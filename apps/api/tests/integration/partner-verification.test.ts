import { createHash, randomUUID } from "node:crypto";

import { PARTNER_API_KEY_HEADER_NAME, PARTNER_API_PATHS } from "@verilot/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PARTNER_API_KEY } from "../../prisma/seed-data.js";
import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import { createLogger } from "../../src/config/logger.js";
import { createRateLimitBucketKey } from "../../src/services/rate-limit.service.js";

const TEST_REQUEST_PREFIX = "req_partner_verify_";
const partnerPath = (serialNumber: string) => `${PARTNER_API_PATHS.verification}/${serialNumber}`;
const responseBodies: string[] = [];

let partnerRateLimitBucketKey = "";
let revokedApiClientId = "";
let revokedApiKey = "";
let seededApiClientId = "";

function remember(response: request.Response): request.Response {
  responseBodies.push(JSON.stringify(response.body));
  return response;
}

function withApiKey(apiKey: string, serialNumber: string, requestId: string) {
  return request(app)
    .get(partnerPath(serialNumber))
    .set(PARTNER_API_KEY_HEADER_NAME, apiKey)
    .set("X-Request-ID", requestId);
}

beforeAll(async () => {
  const [organization, creator, seededClient] = await Promise.all([
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
        id: true,
      },
      where: {
        email: "partner@alpine-transit.local",
      },
    }),
    prisma.apiClient.findUniqueOrThrow({
      select: {
        id: true,
      },
      where: {
        keyPrefix: PARTNER_API_KEY.slice(0, 16),
      },
    }),
  ]);

  seededApiClientId = seededClient.id;
  revokedApiClientId = randomUUID();
  revokedApiKey = `vlp_revoked_${randomUUID().replaceAll("-", "")}`;
  partnerRateLimitBucketKey = createRateLimitBucketKey("partner-verification", seededApiClientId);

  await prisma.apiClient.create({
    data: {
      createdById: creator.id,
      id: revokedApiClientId,
      keyHash: createHash("sha256").update(revokedApiKey).digest("hex"),
      keyPrefix: revokedApiKey.slice(0, 16),
      name: "Revoked partner verification fixture",
      organizationId: organization.id,
      revokedAt: new Date(),
    },
  });
});

afterAll(async () => {
  await prisma.partnerApiRequest.deleteMany({
    where: {
      requestId: {
        startsWith: TEST_REQUEST_PREFIX,
      },
    },
  });

  await prisma.verificationAttempt.deleteMany({
    where: {
      requestId: {
        startsWith: TEST_REQUEST_PREFIX,
      },
    },
  });

  await prisma.rateLimitCounter.deleteMany({
    where: {
      bucketKey: partnerRateLimitBucketKey,
    },
  });

  await prisma.apiClient.update({
    data: {
      lastUsedAt: null,
    },
    where: {
      id: seededApiClientId,
    },
  });

  await prisma.apiClient.delete({
    where: {
      id: revokedApiClientId,
    },
  });

  await prisma.$disconnect();
});

describe("partner product verification", () => {
  it("rejects a missing API key without creating an unsupported request row", async () => {
    const requestId = `${TEST_REQUEST_PREFIX}missing`;
    const response = remember(
      await request(app)
        .get(partnerPath("VL-2026-000042"))
        .set("X-Request-ID", requestId)
        .expect(401),
    );

    expect(response.body.error.code).toBe("PARTNER_API_KEY_REQUIRED");
    await expect(
      prisma.partnerApiRequest.count({
        where: {
          requestId,
        },
      }),
    ).resolves.toBe(0);
  });

  it("rejects malformed and unknown-prefix API keys", async () => {
    const malformedRequestId = `${TEST_REQUEST_PREFIX}malformed_key`;
    const malformed = remember(
      await withApiKey("not-a-partner-key", "VL-2026-000042", malformedRequestId).expect(401),
    );

    expect(malformed.body.error.code).toBe("PARTNER_API_KEY_INVALID");

    const unknownRequestId = `${TEST_REQUEST_PREFIX}unknown_prefix`;
    const unknown = remember(
      await withApiKey(
        `vlp_unknown_${randomUUID().replaceAll("-", "")}`,
        "VL-2026-000042",
        unknownRequestId,
      ).expect(401),
    );

    expect(unknown.body.error.code).toBe("PARTNER_API_KEY_INVALID");
    await expect(
      prisma.partnerApiRequest.count({
        where: {
          requestId: {
            in: [malformedRequestId, unknownRequestId],
          },
        },
      }),
    ).resolves.toBe(0);
  });

  it("uses constant-time hash comparison and records a known-prefix mismatch", async () => {
    const requestId = `${TEST_REQUEST_PREFIX}wrong_hash`;
    const invalidKey = `${PARTNER_API_KEY.slice(0, 16)}${"x".repeat(PARTNER_API_KEY.length - 16)}`;
    const response = remember(
      await withApiKey(invalidKey, "VL-2026-000042", requestId).expect(401),
    );

    expect(response.body.error.code).toBe("PARTNER_API_KEY_INVALID");

    const stored = await prisma.partnerApiRequest.findUniqueOrThrow({
      where: {
        requestId,
      },
    });

    expect(stored).toMatchObject({
      apiClientId: seededApiClientId,
      httpStatus: 401,
      outcome: "INVALID",
    });
    expect(JSON.stringify(stored)).not.toContain(invalidKey);
  });

  it("rejects and records a revoked API client", async () => {
    const requestId = `${TEST_REQUEST_PREFIX}revoked`;
    const response = remember(
      await withApiKey(revokedApiKey, "VL-2026-000042", requestId).expect(401),
    );

    expect(response.body.error.code).toBe("PARTNER_API_KEY_INVALID");
    await expect(
      prisma.partnerApiRequest.findUnique({
        where: {
          requestId,
        },
      }),
    ).resolves.toMatchObject({
      apiClientId: revokedApiClientId,
      httpStatus: 401,
      outcome: "INVALID",
    });
  });

  it("returns the redacted verification contract and updates client usage", async () => {
    const requestId = `${TEST_REQUEST_PREFIX}known`;
    const response = remember(
      await withApiKey(PARTNER_API_KEY, "vl-2026-000042", requestId).expect(200),
    );

    expect(response.body.data).toMatchObject({
      batch: {
        code: "VL-BATCH-2026-003",
        lotNumber: "LOT-26-003",
        manufacturer: "VeriLot Manufacturing Romandie",
      },
      result: "VERIFIED",
      serialNumber: "VL-2026-000042",
    });
    expect(response.headers["ratelimit-limit"]).toBe(String(env.RATE_LIMIT_PARTNER_MAX));
    expect(response.body.data.timeline.length).toBeGreaterThan(0);

    for (const event of response.body.data.timeline) {
      expect(Object.keys(event).sort()).toEqual([
        "eventAt",
        "location",
        "organizationType",
        "type",
      ]);
    }

    const [client, stored] = await Promise.all([
      prisma.apiClient.findUniqueOrThrow({
        select: {
          lastUsedAt: true,
        },
        where: {
          id: seededApiClientId,
        },
      }),
      prisma.partnerApiRequest.findUniqueOrThrow({
        where: {
          requestId,
        },
      }),
    ]);

    expect(client.lastUsedAt).toEqual(expect.any(Date));
    expect(stored).toMatchObject({
      apiClientId: seededApiClientId,
      httpStatus: 200,
      outcome: "VALID",
      requestBody: {
        method: "GET",
        serialNumber: "VL-2026-000042",
      },
    });
  });

  it("returns and records a recalled product result", async () => {
    const requestId = `${TEST_REQUEST_PREFIX}recalled`;
    const response = remember(
      await withApiKey(PARTNER_API_KEY, "VL-2026-000121", requestId).expect(200),
    );

    expect(response.body.data).toMatchObject({
      result: "RECALLED",
      serialNumber: "VL-2026-000121",
    });
    await expect(
      prisma.partnerApiRequest.findUnique({
        where: {
          requestId,
        },
      }),
    ).resolves.toMatchObject({
      httpStatus: 200,
      outcome: "VALID",
    });
  });

  it("records unknown products in both verification and partner histories", async () => {
    const requestId = `${TEST_REQUEST_PREFIX}unknown_product`;
    const response = remember(
      await withApiKey(PARTNER_API_KEY, "VL-2026-999998", requestId).expect(404),
    );

    expect(response.body.error.code).toBe("PRODUCT_NOT_FOUND");

    const [attempt, stored] = await Promise.all([
      prisma.verificationAttempt.findFirstOrThrow({
        where: {
          requestId,
        },
      }),
      prisma.partnerApiRequest.findUniqueOrThrow({
        where: {
          requestId,
        },
      }),
    ]);

    expect(attempt.result).toBe("UNKNOWN");
    expect(stored).toMatchObject({
      httpStatus: 404,
      outcome: "INVALID",
    });
  });

  it("records malformed serial validation without a verification attempt", async () => {
    const requestId = `${TEST_REQUEST_PREFIX}malformed_serial`;
    const response = remember(
      await withApiKey(PARTNER_API_KEY, "not-a-serial", requestId).expect(400),
    );

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: {
        serialNumber: ["Use the format VL-YYYY-NNNNNN."],
      },
    });
    await expect(
      prisma.verificationAttempt.count({
        where: {
          requestId,
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.partnerApiRequest.findUnique({
        where: {
          requestId,
        },
      }),
    ).resolves.toMatchObject({
      httpStatus: 400,
      outcome: "INVALID",
    });
  });

  it("applies a persistent partner-client rate limit and records rejection", async () => {
    const now = new Date();

    await prisma.rateLimitCounter.upsert({
      create: {
        bucketKey: partnerRateLimitBucketKey,
        expiresAt: new Date(now.getTime() + env.RATE_LIMIT_PARTNER_WINDOW_SECONDS * 1_000),
        hitCount: env.RATE_LIMIT_PARTNER_MAX,
        updatedAt: now,
        windowStart: now,
      },
      update: {
        expiresAt: new Date(now.getTime() + env.RATE_LIMIT_PARTNER_WINDOW_SECONDS * 1_000),
        hitCount: env.RATE_LIMIT_PARTNER_MAX,
        updatedAt: now,
        windowStart: now,
      },
      where: {
        bucketKey: partnerRateLimitBucketKey,
      },
    });

    const requestId = `${TEST_REQUEST_PREFIX}rate_limit`;
    const response = remember(
      await withApiKey(PARTNER_API_KEY, "VL-2026-000042", requestId).expect(429),
    );

    expect(response.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(response.headers["ratelimit-remaining"]).toBe("0");
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
    await expect(
      prisma.partnerApiRequest.findUnique({
        where: {
          requestId,
        },
      }),
    ).resolves.toMatchObject({
      httpStatus: 429,
      outcome: "INVALID",
    });
  });

  it("never writes or emits a complete plaintext API key", async () => {
    const logChunks: string[] = [];
    const testLogger = createLogger({
      write(message) {
        logChunks.push(message);
      },
    });

    testLogger.info(
      {
        req: {
          headers: {
            [PARTNER_API_KEY_HEADER_NAME]: PARTNER_API_KEY,
          },
        },
        request: {
          headers: {
            [PARTNER_API_KEY_HEADER_NAME]: PARTNER_API_KEY,
          },
        },
      },
      "partner logging redaction check",
    );

    const [storedRequests, storedClient] = await Promise.all([
      prisma.partnerApiRequest.findMany({
        where: {
          requestId: {
            startsWith: TEST_REQUEST_PREFIX,
          },
        },
      }),
      prisma.apiClient.findUniqueOrThrow({
        where: {
          id: seededApiClientId,
        },
      }),
    ]);
    const logOutput = logChunks.join("");

    expect(logOutput).toContain("[REDACTED]");
    expect(logOutput).not.toContain(PARTNER_API_KEY);
    expect(JSON.stringify(storedRequests)).not.toContain(PARTNER_API_KEY);
    expect(JSON.stringify(storedClient)).not.toContain(PARTNER_API_KEY);
    expect(responseBodies.join("")).not.toContain(PARTNER_API_KEY);
  });
});
