import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { AUTH_COOKIE_NAME } from "@verilot/contracts";
import { parseCookie, stringifySetCookie } from "cookie";
import { jwtVerify, SignJWT } from "jose";

import { env } from "../config/env.js";

const JWT_ALGORITHM = "HS256";
const JWT_AUDIENCE = "verilot-client";
const JWT_ISSUER = "verilot-api";
const jwtSecret = new TextEncoder().encode(env.JWT_SECRET);

export interface AuthTokenClaims {
  csrfToken: string;
  sessionId: string;
  userId: string;
}

export interface CreateAuthTokenInput extends AuthTokenClaims {
  expiresAt: Date;
}

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAuthValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function authValueMatchesHash(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashAuthValue(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createAuthToken(input: CreateAuthTokenInput): Promise<string> {
  return new SignJWT({
    csrf: input.csrfToken,
    sid: input.sessionId,
  })
    .setProtectedHeader({
      alg: JWT_ALGORITHM,
      typ: "JWT",
    })
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(Math.floor(input.expiresAt.getTime() / 1_000))
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setSubject(input.userId)
    .sign(jwtSecret);
}

export async function verifyAuthToken(token: string): Promise<AuthTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret, {
      algorithms: [JWT_ALGORITHM],
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER,
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.csrf !== "string"
    ) {
      return null;
    }

    return {
      csrfToken: payload.csrf,
      sessionId: payload.sid,
      userId: payload.sub,
    };
  } catch {
    return null;
  }
}

export function readAuthCookie(cookieHeader: string | undefined): string | undefined {
  if (cookieHeader === undefined) {
    return undefined;
  }

  return parseCookie(cookieHeader)[AUTH_COOKIE_NAME];
}

export function serializeAuthCookie(token: string, expiresAt: Date): string {
  return stringifySetCookie({
    name: AUTH_COOKIE_NAME,
    value: token,
    expires: expiresAt,
    httpOnly: true,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000)),
    path: "/",
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });
}

export function serializeClearedAuthCookie(): string {
  return stringifySetCookie({
    name: AUTH_COOKIE_NAME,
    value: "",
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });
}
