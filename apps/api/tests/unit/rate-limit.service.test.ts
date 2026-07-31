import { describe, expect, it, vi } from "vitest";

import type {
  ConsumeRateLimitCounterInput,
  RateLimitRepository,
} from "../../src/repositories/rate-limit.repository.js";
import {
  RateLimitService,
  createRateLimitBucketKey,
} from "../../src/services/rate-limit.service.js";

describe("RateLimitService", () => {
  it("allows requests within the configured limit", async () => {
    const now = new Date("2026-07-31T08:00:00.000Z");
    const consume = vi.fn(async (input: ConsumeRateLimitCounterInput) => ({
      bucketKey: input.bucketKey,
      expiresAt: new Date("2026-07-31T08:01:00.000Z"),
      hitCount: 2,
      windowStart: now,
    }));

    const service = new RateLimitService({
      consume,
    } satisfies RateLimitRepository);

    const result = await service.consume({
      identity: "198.51.100.20",
      limit: 5,
      now,
      scope: "public-verification",
      windowSeconds: 60,
    });

    expect(result).toEqual({
      allowed: true,
      limit: 5,
      remaining: 3,
      resetAt: "2026-07-31T08:01:00.000Z",
      retryAfterSeconds: 60,
    });

    expect(consume).toHaveBeenCalledWith({
      bucketKey: createRateLimitBucketKey("public-verification", "198.51.100.20"),
      now,
      windowSeconds: 60,
    });

    expect(consume.mock.calls[0]?.[0].bucketKey).not.toContain("198.51.100.20");
  });

  it("denies requests above the configured limit", async () => {
    const now = new Date("2026-07-31T08:00:30.000Z");

    const service = new RateLimitService({
      async consume(input) {
        return {
          bucketKey: input.bucketKey,
          expiresAt: new Date("2026-07-31T08:01:00.000Z"),
          hitCount: 6,
          windowStart: new Date("2026-07-31T08:00:00.000Z"),
        };
      },
    });

    await expect(
      service.consume({
        identity: "198.51.100.21",
        limit: 5,
        now,
        scope: "public-verification",
        windowSeconds: 60,
      }),
    ).resolves.toEqual({
      allowed: false,
      limit: 5,
      remaining: 0,
      resetAt: "2026-07-31T08:01:00.000Z",
      retryAfterSeconds: 30,
    });
  });
});
