import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  authValueMatchesHash,
  authValuesMatch,
  createAuthToken,
  hashAuthValue,
  verifyAuthToken,
} from "../../src/security/auth-token.js";

describe("authentication tokens", () => {
  it("signs and verifies the required claims", async () => {
    const claims = {
      csrfToken: "csrf-token",
      sessionId: randomUUID(),
      userId: randomUUID(),
    };
    const token = await createAuthToken({
      ...claims,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(verifyAuthToken(token)).resolves.toEqual(claims);
  });

  it("rejects a modified token", async () => {
    const token = await createAuthToken({
      csrfToken: "csrf-token",
      expiresAt: new Date(Date.now() + 60_000),
      sessionId: randomUUID(),
      userId: randomUUID(),
    });
    const [header, payload, signature] = token.split(".");

    if (!header || !payload || !signature) {
      throw new Error("Expected a three-part authentication token.");
    }

    const firstSignatureCharacter = signature[0];

    if (firstSignatureCharacter === undefined) {
      throw new Error("Expected a token signature.");
    }

    const replacement = firstSignatureCharacter === "a" ? "b" : "a";
    const modifiedToken = [header, payload, `${replacement}${signature.slice(1)}`].join(".");

    await expect(verifyAuthToken(modifiedToken)).resolves.toBeNull();
  });

  it("compares stored authentication hashes without exposing the input", () => {
    const hash = hashAuthValue("session-secret");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("session-secret");
    expect(authValueMatchesHash("session-secret", hash)).toBe(true);
    expect(authValueMatchesHash("different-secret", hash)).toBe(false);
  });

  it("compares request tokens in constant time", () => {
    expect(authValuesMatch("matching-token", "matching-token")).toBe(true);
    expect(authValuesMatch("matching-token", "different-token")).toBe(false);
    expect(authValuesMatch("short", "longer-token")).toBe(false);
  });
});
