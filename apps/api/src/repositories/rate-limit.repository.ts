import { prisma } from "../config/database.js";

export interface ConsumeRateLimitCounterInput {
  bucketKey: string;
  now: Date;
  windowSeconds: number;
}

export interface RateLimitCounterRecord {
  bucketKey: string;
  expiresAt: Date;
  hitCount: number;
  windowStart: Date;
}

export interface RateLimitRepository {
  consume(input: ConsumeRateLimitCounterInput): Promise<RateLimitCounterRecord>;
}

export const rateLimitRepository: RateLimitRepository = {
  async consume(input) {
    const expiresAt = new Date(input.now.getTime() + input.windowSeconds * 1_000);

    const records = await prisma.$queryRaw<RateLimitCounterRecord[]>`
      INSERT INTO "rate_limit_counters" AS counter (
        "bucketKey",
        "hitCount",
        "windowStart",
        "expiresAt",
        "updatedAt"
      )
      VALUES (
        ${input.bucketKey},
        1,
        ${input.now},
        ${expiresAt},
        ${input.now}
      )
      ON CONFLICT ("bucketKey") DO UPDATE
      SET
        "hitCount" = CASE
          WHEN counter."expiresAt" <= ${input.now} THEN 1
          ELSE counter."hitCount" + 1
        END,
        "windowStart" = CASE
          WHEN counter."expiresAt" <= ${input.now} THEN ${input.now}
          ELSE counter."windowStart"
        END,
        "expiresAt" = CASE
          WHEN counter."expiresAt" <= ${input.now} THEN ${expiresAt}
          ELSE counter."expiresAt"
        END,
        "updatedAt" = ${input.now}
      RETURNING
        "bucketKey",
        "hitCount",
        "windowStart",
        "expiresAt"
    `;

    const record = records[0];

    if (record === undefined) {
      throw new Error("Rate limit counter was not returned.");
    }

    return record;
  },
};
