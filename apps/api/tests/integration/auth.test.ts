import { randomUUID } from "node:crypto";

import { AUTH_COOKIE_NAME, CSRF_HEADER_NAME } from "@verilot/contracts";
import { parseCookie } from "cookie";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import { createAuthToken, hashAuthValue } from "../../src/security/auth-token.js";

const createdSessionIds = new Set<string>();
let operatorId = "";
let originalLastSignedInAt: Date | null = null;

function readSetCookieHeader(response: request.Response): string {
  const values = response.headers["set-cookie"];

  if (!Array.isArray(values) || values[0] === undefined) {
    throw new Error("Expected a Set-Cookie response header.");
  }

  return values[0];
}

function readSessionCookie(response: request.Response): {
  cookiePair: string;
  token: string;
} {
  const setCookie = readSetCookieHeader(response);
  const cookiePair = setCookie.split(";")[0];

  if (cookiePair === undefined) {
    throw new Error("Expected an authentication cookie.");
  }

  const token = parseCookie(cookiePair)[AUTH_COOKIE_NAME];

  if (token === undefined) {
    throw new Error("Expected an authentication token.");
  }

  return {
    cookiePair,
    token,
  };
}

beforeAll(async () => {
  const operator = await prisma.user.findUniqueOrThrow({
    select: {
      id: true,
      lastSignedInAt: true,
    },
    where: {
      email: "operator@verilot.local",
    },
  });

  operatorId = operator.id;
  originalLastSignedInAt = operator.lastSignedInAt;
});

afterAll(async () => {
  await prisma.authSession.deleteMany({
    where: {
      id: {
        in: [...createdSessionIds],
      },
    },
  });

  if (operatorId !== "") {
    await prisma.user.update({
      data: {
        lastSignedInAt: originalLastSignedInAt,
      },
      where: {
        id: operatorId,
      },
    });
  }

  await prisma.$disconnect();
});

describe("authentication sessions", () => {
  it("signs in an active user and returns the same safe session", async () => {
    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", env.APP_ORIGIN)
      .send({
        email: " OPERATOR@VERILOT.LOCAL ",
        password: "VeriLotOperator2026!",
      })
      .expect(200);

    expect(loginResponse.body.data).toMatchObject({
      user: {
        displayName: "Supply Chain Operator",
        email: "operator@verilot.local",
        organization: {
          name: "VeriLot Manufacturing Romandie",
        },
        role: "OPERATOR",
      },
    });
    expect(loginResponse.body.data.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(loginResponse.body.data.expiresAt).toEqual(expect.any(String));
    expect(JSON.stringify(loginResponse.body)).not.toContain("passwordHash");

    const setCookie = readSetCookieHeader(loginResponse);
    const { cookiePair, token } = readSessionCookie(loginResponse);

    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).not.toContain("Secure");

    const storedSession = await prisma.authSession.findUniqueOrThrow({
      where: {
        tokenHash: hashAuthValue(token),
      },
    });
    createdSessionIds.add(storedSession.id);

    expect(storedSession.tokenHash).not.toBe(token);
    expect(storedSession.csrfHash).toBe(hashAuthValue(loginResponse.body.data.csrfToken));

    const sessionResponse = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", cookiePair)
      .expect(200);

    expect(sessionResponse.body.data).toEqual(loginResponse.body.data);

    const missingCsrfResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookiePair)
      .set("Origin", env.APP_ORIGIN)
      .expect(403);

    expect(missingCsrfResponse.body.error).toMatchObject({
      code: "CSRF_TOKEN_INVALID",
      fieldErrors: {},
      message: "CSRF token is missing or invalid.",
    });

    const mismatchedCsrfResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookiePair)
      .set(CSRF_HEADER_NAME, "not-the-session-csrf-token")
      .set("Origin", env.APP_ORIGIN)
      .expect(403);

    expect(mismatchedCsrfResponse.body.error).toMatchObject({
      code: "CSRF_TOKEN_INVALID",
    });

    const wrongOriginResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookiePair)
      .set(CSRF_HEADER_NAME, loginResponse.body.data.csrfToken)
      .set("Origin", "https://untrusted.example")
      .expect(403);

    expect(wrongOriginResponse.body.error).toMatchObject({
      code: "ORIGIN_NOT_ALLOWED",
      fieldErrors: {},
      message: "Request origin is not allowed.",
    });

    const sessionAfterRejections = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", cookiePair)
      .expect(200);

    expect(sessionAfterRejections.body.data.user.email).toBe("operator@verilot.local");

    const logoutResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookiePair)
      .set(CSRF_HEADER_NAME, loginResponse.body.data.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .expect(204);

    expect(readSetCookieHeader(logoutResponse)).toContain("Max-Age=0");
    await expect(
      prisma.authSession.findUniqueOrThrow({
        select: {
          revokedAt: true,
        },
        where: {
          id: storedSession.id,
        },
      }),
    ).resolves.toMatchObject({
      revokedAt: expect.any(Date),
    });

    const revokedResponse = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", cookiePair)
      .expect(401);

    expect(revokedResponse.body.error).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      fieldErrors: {},
      message: "Authentication is required.",
    });
  });

  it("uses the same error for wrong, unknown, and suspended credentials", async () => {
    const wrongPasswordResponse = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", env.APP_ORIGIN)
      .send({
        email: "operator@verilot.local",
        password: "incorrect-password",
      })
      .expect(401);
    const unknownUserResponse = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", env.APP_ORIGIN)
      .send({
        email: "unknown@verilot.local",
        password: "incorrect-password",
      })
      .expect(401);
    const suspendedResponse = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", env.APP_ORIGIN)
      .send({
        email: "partner@alpine-transit.local",
        password: "VeriLotOperator2026!",
      })
      .expect(401);

    for (const response of [wrongPasswordResponse, unknownUserResponse, suspendedResponse]) {
      expect(response.body.error).toMatchObject({
        code: "INVALID_CREDENTIALS",
        fieldErrors: {},
        message: "Email or password is incorrect.",
      });
      expect(response.headers["set-cookie"]).toBeUndefined();
    }
  });

  it("rejects an expired database session even when its JWT is still valid", async () => {
    const sessionId = randomUUID();
    const csrfToken = "test-csrf-token-with-sufficient-random-shape";
    const token = await createAuthToken({
      csrfToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
      sessionId,
      userId: operatorId,
    });
    createdSessionIds.add(sessionId);

    await prisma.authSession.create({
      data: {
        csrfHash: hashAuthValue(csrfToken),
        expiresAt: new Date(Date.now() - 1_000),
        id: sessionId,
        tokenHash: hashAuthValue(token),
        userId: operatorId,
      },
    });

    const response = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", `${AUTH_COOKIE_NAME}=${token}`)
      .expect(401);

    expect(response.body.error).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required.",
    });
  });

  it("returns field errors for malformed credentials", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", env.APP_ORIGIN)
      .send({
        email: "invalid",
        password: "",
      })
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: {
        email: ["Enter a valid email address."],
        password: ["Enter your password."],
      },
      message: "The sign-in request is invalid.",
    });
  });

  it("rejects login requests from missing and untrusted origins", async () => {
    const body = {
      email: "operator@verilot.local",
      password: "VeriLotOperator2026!",
    };
    const missingOriginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send(body)
      .expect(403);
    const untrustedOriginResponse = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://untrusted.example")
      .send(body)
      .expect(403);

    for (const response of [missingOriginResponse, untrustedOriginResponse]) {
      expect(response.body.error).toMatchObject({
        code: "ORIGIN_NOT_ALLOWED",
        fieldErrors: {},
        message: "Request origin is not allowed.",
      });
      expect(response.headers["set-cookie"]).toBeUndefined();
    }
  });
});
