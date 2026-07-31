import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "../../src/config/database.js";
import { rateLimitRepository } from "../../src/repositories/rate-limit.repository.js";

const bucketKey = `test:${randomUUID()}`;

afterAll(async () => {
  await prisma.rateLimitCounter.deleteMany({
    where: {
      bucketKey,
    },
  });

  await prisma.$disconnect();
});

describe("rate limit repository", () => {
  it("increments an active window and resets an expired window", async () => {
    const firstTime = new Date("2026-07-31T08:00:00.000Z");

    const first = await rateLimitRepository.consume({
      bucketKey,
      now: firstTime,
      windowSeconds: 60,
    });

    const second = await rateLimitRepository.consume({
      bucketKey,
      now: new Date("2026-07-31T08:00:20.000Z"),
      windowSeconds: 60,
    });

    const reset = await rateLimitRepository.consume({
      bucketKey,
      now: new Date("2026-07-31T08:01:01.000Z"),
      windowSeconds: 60,
    });

    expect(first).toMatchObject({
      bucketKey,
      hitCount: 1,
      windowStart: firstTime,
    });
    expect(first.expiresAt.toISOString()).toBe("2026-07-31T08:01:00.000Z");

    expect(second).toMatchObject({
      bucketKey,
      hitCount: 2,
      windowStart: firstTime,
    });
    expect(second.expiresAt.toISOString()).toBe("2026-07-31T08:01:00.000Z");

    expect(reset).toMatchObject({
      bucketKey,
      hitCount: 1,
      windowStart: new Date("2026-07-31T08:01:01.000Z"),
    });
    expect(reset.expiresAt.toISOString()).toBe("2026-07-31T08:02:01.000Z");
  });
});
