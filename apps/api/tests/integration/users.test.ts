import { randomUUID } from "node:crypto";

import { API_PATHS } from "@verilot/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { prisma } from "../../src/config/database.js";
import { UserRole, UserStatus } from "../../src/generated/prisma/enums.js";

let crossOrganizationUserId = "";

function readCookiePair(response: request.Response): string {
  const values = response.headers["set-cookie"];

  if (!Array.isArray(values) || values[0] === undefined) {
    throw new Error("Expected a Set-Cookie response header.");
  }

  const cookiePair = values[0].split(";")[0];

  if (cookiePair === undefined) {
    throw new Error("Expected an authentication cookie.");
  }

  return cookiePair;
}

async function signIn(email: string, password: string): Promise<string> {
  const response = await request(app)
    .post(API_PATHS.auth.login)
    .set("Origin", env.APP_ORIGIN)
    .send({ email, password })
    .expect(200);

  return readCookiePair(response);
}

beforeAll(async () => {
  const [organization, suspendedPartner] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      select: {
        id: true,
      },
      where: {
        slug: "alpine-transit",
      },
    }),
    prisma.user.findUniqueOrThrow({
      select: {
        passwordHash: true,
      },
      where: {
        email: "partner@alpine-transit.local",
      },
    }),
  ]);

  crossOrganizationUserId = randomUUID();

  await prisma.user.create({
    data: {
      displayName: "Active Partner Operator",
      email: "active-partner-test@verilot.local",
      id: crossOrganizationUserId,
      organizationId: organization.id,
      passwordHash: suspendedPartner.passwordHash,
      role: UserRole.OPERATOR,
      status: UserStatus.ACTIVE,
    },
  });
});

afterAll(async () => {
  if (crossOrganizationUserId !== "") {
    await prisma.user.deleteMany({
      where: {
        id: crossOrganizationUserId,
      },
    });
  }

  await prisma.$disconnect();
});

describe("user authorization and organization boundaries", () => {
  it("rejects anonymous requests", async () => {
    const response = await request(app).get(API_PATHS.users).expect(401);

    expect(response.body.error).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      fieldErrors: {},
      message: "Authentication is required.",
    });
  });

  it("rejects an operator without the users-read permission", async () => {
    const cookie = await signIn("operator@verilot.local", "VeriLotOperator2026!");

    const response = await request(app).get(API_PATHS.users).set("Cookie", cookie).expect(403);

    expect(response.body.error).toMatchObject({
      code: "INSUFFICIENT_PERMISSIONS",
      fieldErrors: {},
      message: "You do not have permission to perform this action.",
    });
  });

  it("returns only users from the administrator organization", async () => {
    const cookie = await signIn("admin@verilot.local", "VeriLotAdmin2026!");

    const response = await request(app).get(API_PATHS.users).set("Cookie", cookie).expect(200);

    expect(response.body.data.users).toHaveLength(3);
    expect(response.body.data.users.map((user: { email: string }) => user.email)).toEqual([
      "admin@verilot.local",
      "inspector@verilot.local",
      "operator@verilot.local",
    ]);

    for (const user of response.body.data.users) {
      expect(user.organization).toMatchObject({
        name: "VeriLot Manufacturing Romandie",
      });
      expect(user).not.toHaveProperty("passwordHash");
    }

    expect(JSON.stringify(response.body)).not.toContain("active-partner-test@verilot.local");
    expect(JSON.stringify(response.body)).not.toContain("partner@alpine-transit.local");
  });
});
