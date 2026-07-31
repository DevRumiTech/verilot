import { randomUUID } from "node:crypto";

import { API_PATHS, CSRF_HEADER_NAME } from "@verilot/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";

interface SignedInSession {
  cookie: string;
  csrfToken: string;
}

let auditRecordId = "";
let createdEventId = "";
let foreignLocationId = "";
let locationId = "";
let productId = "";

function readCookiePair(response: request.Response): string {
  const values = response.headers["set-cookie"];

  if (!Array.isArray(values) || values[0] === undefined) {
    throw new Error("Expected a Set-Cookie response header.");
  }

  const cookiePair = values[0].split(";")[0];

  if (cookiePair === undefined) {
    throw new Error("Expected an authentication cookie.");
  }

  return cookiePair;
}

async function signIn(email: string, password: string): Promise<SignedInSession> {
  const response = await request(app)
    .post(API_PATHS.auth.login)
    .set("Origin", env.APP_ORIGIN)
    .send({
      email,
      password,
    })
    .expect(200);

  return {
    cookie: readCookiePair(response),
    csrfToken: response.body.data.csrfToken,
  };
}

beforeAll(async () => {
  const product = await prisma.product.findUniqueOrThrow({
    select: {
      batch: {
        select: {
          manufacturerOrganizationId: true,
        },
      },
      id: true,
    },
    where: {
      serialNumber: "VL-2026-000060",
    },
  });

  const foreignOrganization = await prisma.organization.findFirstOrThrow({
    select: {
      id: true,
    },
    where: {
      id: {
        not: product.batch.manufacturerOrganizationId,
      },
    },
  });

  const suffix = randomUUID().slice(0, 8);

  const [location, foreignLocation] = await prisma.$transaction([
    prisma.location.create({
      data: {
        canton: "VD",
        code: `EVENT-OWNED-${suffix}`,
        countryCode: "CH",
        isKnown: true,
        latitude: 46.52,
        longitude: 6.63,
        municipality: "Lausanne",
        name: "Owned Event Test Site",
        organizationId: product.batch.manufacturerOrganizationId,
      },
      select: {
        id: true,
      },
    }),
    prisma.location.create({
      data: {
        canton: "ZH",
        code: `EVENT-FOREIGN-${suffix}`,
        countryCode: "CH",
        isKnown: true,
        latitude: 47.37,
        longitude: 8.54,
        municipality: "Zürich",
        name: "Foreign Event Test Site",
        organizationId: foreignOrganization.id,
      },
      select: {
        id: true,
      },
    }),
  ]);

  productId = product.id;
  locationId = location.id;
  foreignLocationId = foreignLocation.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("product custody-event writes", () => {
  it("rejects an inspector without write permission", async () => {
    const session = await signIn("inspector@verilot.local", "VeriLotInspector2026!");

    await request(app)
      .post(`${API_PATHS.products}/${productId}/events`)
      .set("Cookie", session.cookie)
      .set(CSRF_HEADER_NAME, session.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        eventAt: "2026-07-31T06:00:00.000Z",
        idempotencyKey: `inspect-${randomUUID()}`,
        locationId,
        notes: "Inspection event.",
        type: "INSPECTED",
      })
      .expect(403);
  });

  it("requires the allowed origin and CSRF token", async () => {
    const session = await signIn("operator@verilot.local", "VeriLotOperator2026!");

    const body = {
      eventAt: "2026-07-31T06:10:00.000Z",
      idempotencyKey: `security-${randomUUID()}`,
      locationId,
      notes: "Security middleware test.",
      type: "INSPECTED",
    };

    await request(app)
      .post(`${API_PATHS.products}/${productId}/events`)
      .set("Cookie", session.cookie)
      .set(CSRF_HEADER_NAME, session.csrfToken)
      .set("Origin", "https://untrusted.example")
      .send(body)
      .expect(403);

    await request(app)
      .post(`${API_PATHS.products}/${productId}/events`)
      .set("Cookie", session.cookie)
      .set("Origin", env.APP_ORIGIN)
      .send(body)
      .expect(403);
  });

  it("creates an event and audit record atomically", async () => {
    const session = await signIn("operator@verilot.local", "VeriLotOperator2026!");
    const idempotencyKey = `event-${randomUUID()}`;
    const body = {
      eventAt: "2026-07-31T06:20:00.000Z",
      idempotencyKey,
      locationId,
      metadata: {
        inspectionStation: "QA-04",
        passed: true,
      },
      notes: "Final dimensional inspection passed.",
      shipmentReference: "SHIP-2026-0042",
      transportMode: "ROAD",
      type: "INSPECTED",
    };

    const response = await request(app)
      .post(`${API_PATHS.products}/${productId}/events`)
      .set("Cookie", session.cookie)
      .set(CSRF_HEADER_NAME, session.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .set("X-Request-ID", "req_test_event_create")
      .send(body)
      .expect(201);

    expect(response.body.data).toMatchObject({
      event: {
        eventAt: body.eventAt,
        notes: body.notes,
        shipmentReference: body.shipmentReference,
        transportMode: "ROAD",
        type: "INSPECTED",
      },
      productStatus: "VERIFIED",
      replayed: false,
    });

    createdEventId = response.body.data.event.id;

    const [event, auditRecord] = await Promise.all([
      prisma.custodyEvent.findUniqueOrThrow({
        where: {
          id: createdEventId,
        },
      }),
      prisma.auditRecord.findFirstOrThrow({
        where: {
          action: "product.custody_event.created",
          entityId: createdEventId,
          entityType: "CustodyEvent",
        },
      }),
    ]);

    auditRecordId = auditRecord.id;

    expect(event).toMatchObject({
      actorId: expect.any(String),
      idempotencyKey,
      locationId,
      productId,
      requestId: "req_test_event_create",
      type: "INSPECTED",
    });

    expect(auditRecord).toMatchObject({
      actorEmail: "operator@verilot.local",
      entityId: createdEventId,
      requestId: "req_test_event_create",
    });

    const replay = await request(app)
      .post(`${API_PATHS.products}/${productId}/events`)
      .set("Cookie", session.cookie)
      .set(CSRF_HEADER_NAME, session.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .set("X-Request-ID", "req_test_event_replay")
      .send(body)
      .expect(200);

    expect(replay.body.data).toMatchObject({
      event: {
        id: createdEventId,
      },
      productStatus: "VERIFIED",
      replayed: true,
    });

    const auditCount = await prisma.auditRecord.count({
      where: {
        action: "product.custody_event.created",
        entityId: createdEventId,
      },
    });

    expect(auditCount).toBe(1);

    const conflict = await request(app)
      .post(`${API_PATHS.products}/${productId}/events`)
      .set("Cookie", session.cookie)
      .set(CSRF_HEADER_NAME, session.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        ...body,
        notes: "Different event data.",
      })
      .expect(409);

    expect(conflict.body.error).toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("rejects a location outside the organization", async () => {
    const session = await signIn("operator@verilot.local", "VeriLotOperator2026!");

    const response = await request(app)
      .post(`${API_PATHS.products}/${productId}/events`)
      .set("Cookie", session.cookie)
      .set(CSRF_HEADER_NAME, session.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        eventAt: "2026-07-31T06:30:00.000Z",
        idempotencyKey: `foreign-location-${randomUUID()}`,
        locationId: foreignLocationId,
        notes: "Foreign location test.",
        type: "INSPECTED",
      })
      .expect(404);

    expect(response.body.error).toMatchObject({
      code: "LOCATION_NOT_FOUND",
    });
  });

  it("preserves custody events and audit records", async () => {
    expect(createdEventId).not.toBe("");
    expect(auditRecordId).not.toBe("");

    await expect(
      prisma.custodyEvent.update({
        data: {
          notes: "Changed.",
        },
        where: {
          id: createdEventId,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.custodyEvent.delete({
        where: {
          id: createdEventId,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.auditRecord.update({
        data: {
          reason: "Changed.",
        },
        where: {
          id: auditRecordId,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.auditRecord.delete({
        where: {
          id: auditRecordId,
        },
      }),
    ).rejects.toThrow();
  });
});
