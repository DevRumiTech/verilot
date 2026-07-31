import { randomUUID } from "node:crypto";

import { API_PATHS } from "@verilot/contracts";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import { createRateLimitBucketKey } from "../../src/services/rate-limit.service.js";

const createdBucketKeys: string[] = [];

afterAll(async () => {
  await prisma.rateLimitCounter.deleteMany({
    where: {
      bucketKey: {
        in: createdBucketKeys,
      },
    },
  });

  await prisma.$disconnect();
});

describe("rate-limited routes", () => {
  it("returns 429 when the sign-in limit has been reached", async () => {
    const email = `blocked-${randomUUID()}@example.com`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.RATE_LIMIT_LOGIN_WINDOW_SECONDS * 1_000);

    const possibleAddresses = ["::ffff:127.0.0.1", "127.0.0.1", "::1", "unknown"];

    const bucketKeys = possibleAddresses.map((address) =>
      createRateLimitBucketKey("auth-login", `${address}:${email}`),
    );

    createdBucketKeys.push(...bucketKeys);

    await prisma.rateLimitCounter.createMany({
      data: bucketKeys.map((bucketKey) => ({
        bucketKey,
        expiresAt,
        hitCount: env.RATE_LIMIT_LOGIN_MAX,
        updatedAt: now,
        windowStart: now,
      })),
    });

    const response = await request(app)
      .post(API_PATHS.auth.login)
      .set("Origin", env.APP_ORIGIN)
      .send({
        email,
        password: "IncorrectPassword2026!",
      })
      .expect(429);

    expect(response.body.error).toMatchObject({
      code: "RATE_LIMIT_EXCEEDED",
      fieldErrors: {},
      message: "Too many requests. Try again later.",
    });

    expect(response.headers["ratelimit-limit"]).toBe(String(env.RATE_LIMIT_LOGIN_MAX));
    expect(response.headers["ratelimit-remaining"]).toBe("0");
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
  });
});
