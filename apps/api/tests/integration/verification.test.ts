import { createHmac } from "node:crypto";

import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { prisma } from "../../src/config/database.js";

const TEST_REQUEST_PREFIX = "req_test_verify_";
const TEST_USER_AGENT = "verilot-integration-suite/1.0";

afterAll(async () => {
  await prisma.verificationAttempt.deleteMany({
    where: {
      requestId: {
        startsWith: TEST_REQUEST_PREFIX,
      },
    },
  });
  await prisma.$disconnect();
});

describe("public product verification", () => {
  it("returns a redacted history and records a verified attempt", async () => {
    const requestId = `${TEST_REQUEST_PREFIX}known`;
    const response = await request(app)
      .get("/api/v1/verification/vl-2026-000042")
      .set("User-Agent", TEST_USER_AGENT)
      .set("X-Request-ID", requestId)
      .expect(200);

    expect(response.body.data).toMatchObject({
      batch: {
        code: "VL-BATCH-2026-003",
        lotNumber: "LOT-26-003",
        manufacturer: "VeriLot Manufacturing Romandie",
      },
      result: "VERIFIED",
      serialNumber: "VL-2026-000042",
    });
    expect(response.body.data.checkedAt).toEqual(expect.any(String));
    expect(response.body.data.timeline.length).toBeGreaterThan(0);
    expect(response.body.data.timeline.at(-1)).toMatchObject({
      eventAt: "2026-07-30T09:00:00.000Z",
      location: {
        canton: "GE",
        municipality: "Geneva",
      },
    });

    const storedEvents = await prisma.$queryRaw<Array<{ eventAt: Date; sessionTimeZone: string }>>`
      SELECT
        ce."eventAt" AS "eventAt",
        current_setting('TimeZone') AS "sessionTimeZone"
      FROM custody_events ce
      JOIN products p ON p.id = ce."productId"
      WHERE p."serialNumber" = ${"VL-2026-000042"}
      ORDER BY ce."eventAt" DESC
      LIMIT 1
    `;
    const storedEvent = storedEvents[0];

    if (storedEvent === undefined) {
      throw new Error("Expected the stable custody event.");
    }

    expect(storedEvent.sessionTimeZone).toBe("UTC");
    expect(storedEvent.eventAt.toISOString()).toBe("2026-07-30T09:00:00.000Z");
    expect(response.body.data.timeline.at(-1)?.eventAt).toBe(storedEvent.eventAt.toISOString());

    for (const event of response.body.data.timeline) {
      expect(Object.keys(event).sort()).toEqual([
        "eventAt",
        "location",
        "organizationType",
        "type",
      ]);
    }

    const attempt = await prisma.verificationAttempt.findFirstOrThrow({
      where: {
        requestId,
      },
    });
    const expectedUserAgentHash = createHmac("sha256", env.DATA_HASH_SECRET)
      .update(TEST_USER_AGENT)
      .digest("hex");

    expect(attempt).toMatchObject({
      result: "VERIFIED",
      serialNumber: "VL-2026-000042",
      userAgentHash: expectedUserAgentHash,
    });
    expect(attempt.ipHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns the recalled outcome for a recalled batch", async () => {
    const response = await request(app)
      .get("/api/v1/verification/VL-2026-000121")
      .set("X-Request-ID", `${TEST_REQUEST_PREFIX}recalled`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      result: "RECALLED",
      serialNumber: "VL-2026-000121",
    });
  });

  it("records an unknown result and returns the standard not-found error", async () => {
    const requestId = `${TEST_REQUEST_PREFIX}unknown`;
    const response = await request(app)
      .get("/api/v1/verification/VL-2026-999998")
      .set("X-Request-ID", requestId)
      .expect(404);

    expect(response.body).toEqual({
      error: {
        code: "PRODUCT_NOT_FOUND",
        fieldErrors: {},
        message: "Product not found.",
        requestId,
      },
    });

    const attempt = await prisma.verificationAttempt.findFirstOrThrow({
      where: {
        requestId,
      },
    });

    expect(attempt).toMatchObject({
      organizationId: null,
      result: "UNKNOWN",
      serialNumber: "VL-2026-999998",
    });
  });

  it("rejects a malformed serial number before recording an attempt", async () => {
    const requestId = `${TEST_REQUEST_PREFIX}invalid`;
    const response = await request(app)
      .get("/api/v1/verification/not-a-serial")
      .set("X-Request-ID", requestId)
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: {
          serialNumber: ["Use the format VL-YYYY-NNNNNN."],
        },
        message: "The verification request is invalid.",
        requestId,
      },
    });
    await expect(
      prisma.verificationAttempt.count({
        where: {
          requestId,
        },
      }),
    ).resolves.toBe(0);
  });
});
