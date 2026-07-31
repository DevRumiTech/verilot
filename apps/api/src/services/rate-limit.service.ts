import { createHmac } from "node:crypto";

import { env } from "../config/env.js";
import {
  rateLimitRepository,
  type RateLimitRepository,
} from "../repositories/rate-limit.repository.js";

export interface ConsumeRateLimitInput {
  identity: string;
  limit: number;
  now?: Date;
  scope: string;
  windowSeconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
  retryAfterSeconds: number;
}

export function createRateLimitBucketKey(scope: string, identity: string): string {
  const identityHash = createHmac("sha256", env.DATA_HASH_SECRET).update(identity).digest("hex");

  return `${scope}:${identityHash}`;
}

export class RateLimitService {
  public constructor(private readonly repository: RateLimitRepository) {}

  public async consume(input: ConsumeRateLimitInput): Promise<RateLimitDecision> {
    const now = input.now ?? new Date();

    const counter = await this.repository.consume({
      bucketKey: createRateLimitBucketKey(input.scope, input.identity),
      now,
      windowSeconds: input.windowSeconds,
    });

    return {
      allowed: counter.hitCount <= input.limit,
      limit: input.limit,
      remaining: Math.max(0, input.limit - counter.hitCount),
      resetAt: counter.expiresAt.toISOString(),
      retryAfterSeconds: Math.max(
        0,
        Math.ceil((counter.expiresAt.getTime() - now.getTime()) / 1_000),
      ),
    };
  }
}

export const rateLimitService = new RateLimitService(rateLimitRepository);
