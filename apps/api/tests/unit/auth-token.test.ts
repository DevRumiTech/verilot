import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  authValueMatchesHash,
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
    const finalCharacter = token.at(-1);
    const replacement = finalCharacter === "a" ? "b" : "a";

    await expect(verifyAuthToken(`${token.slice(0, -1)}${replacement}`)).resolves.toBeNull();
  });

  it("compares stored authentication hashes without exposing the input", () => {
    const hash = hashAuthValue("session-secret");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("session-secret");
    expect(authValueMatchesHash("session-secret", hash)).toBe(true);
    expect(authValueMatchesHash("different-secret", hash)).toBe(false);
  });
});
