import { randomUUID } from "node:crypto";

import { API_PATHS } from "@verilot/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import {
  BatchStatus,
  ProductStatus,
  UserRole,
  UserStatus,
} from "../../src/generated/prisma/enums.js";

let crossOrganizationBatchId = "";
let crossOrganizationEmail = "";
let crossOrganizationProductId = "";
let crossOrganizationUserId = "";

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

async function signIn(email: string, password: string): Promise<string> {
  const response = await request(app)
    .post(API_PATHS.auth.login)
    .set("Origin", env.APP_ORIGIN)
    .send({
      email,
      password,
    })
    .expect(200);

  return readCookiePair(response);
}

beforeAll(async () => {
  const [organization, administrator] = await Promise.all([
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
        passwordHash: true,
      },
      where: {
        email: "admin@verilot.local",
      },
    }),
  ]);

  crossOrganizationUserId = randomUUID();
  crossOrganizationBatchId = randomUUID();
  crossOrganizationProductId = randomUUID();
  crossOrganizationEmail = `product-admin-${randomUUID()}@verilot.local`;

  await prisma.user.create({
    data: {
      displayName: "Logistics Product Administrator",
      email: crossOrganizationEmail,
      id: crossOrganizationUserId,
      organizationId: organization.id,
      passwordHash: administrator.passwordHash,
      role: UserRole.ADMINISTRATOR,
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.batch.create({
    data: {
      activatedAt: new Date("2026-07-01T08:00:00.000Z"),
      code: `ALT-PRODUCT-${randomUUID().slice(0, 8)}`,
      createdById: crossOrganizationUserId,
      expiresAt: new Date("2029-07-01T00:00:00.000Z"),
      id: crossOrganizationBatchId,
      lotNumber: `ALT-PRODUCT-LOT-${randomUUID().slice(0, 8)}`,
      manufacturedAt: new Date("2026-07-01T00:00:00.000Z"),
      manufacturerOrganizationId: organization.id,
      productName: "Logistics Product Test",
      serialEnd: 1,
      serialPrefix: "ALT-PRODUCT-",
      serialStart: 1,
      sku: `ALT-PRODUCT-SKU-${randomUUID().slice(0, 8)}`,
      status: BatchStatus.ACTIVE,
    },
  });

  await prisma.product.create({
    data: {
      activatedAt: new Date("2026-07-01T08:00:00.000Z"),
      batchId: crossOrganizationBatchId,
      id: crossOrganizationProductId,
      qrPayload: `https://verilot.local/test/${randomUUID()}`,
      serialNumber: `ALT-${randomUUID()}`,
      status: ProductStatus.VERIFIED,
    },
  });
});

afterAll(async () => {
  if (crossOrganizationProductId !== "") {
    await prisma.product.deleteMany({
      where: {
        id: crossOrganizationProductId,
      },
    });
  }

  if (crossOrganizationBatchId !== "") {
    await prisma.batch.deleteMany({
      where: {
        id: crossOrganizationBatchId,
      },
    });
  }

  if (crossOrganizationUserId !== "") {
    await prisma.user.deleteMany({
      where: {
        id: crossOrganizationUserId,
      },
    });
  }

  await prisma.$disconnect();
});

describe("product APIs", () => {
  it("rejects anonymous requests", async () => {
    const response = await request(app).get(API_PATHS.products).expect(401);

    expect(response.body.error).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required.",
    });
  });

  it("returns paginated organization products", async () => {
    const cookie = await signIn("operator@verilot.local", "VeriLotOperator2026!");

    const response = await request(app)
      .get(API_PATHS.products)
      .query({
        page: 1,
        pageSize: 10,
        search: "VL-2026-",
      })
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.products).toHaveLength(10);
    expect(response.body.data.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 160,
      totalPages: 16,
    });

    for (const product of response.body.data.products) {
      expect(product.serialNumber).toMatch(/^VL-2026-/);
      expect(product.eventCount).toBeGreaterThan(0);
      expect(product.batch.code).toMatch(/^VL-BATCH-2026-/);
    }
  });

  it("filters products by status, batch, and search text", async () => {
    const cookie = await signIn("inspector@verilot.local", "VeriLotInspector2026!");

    const recalled = await request(app)
      .get(API_PATHS.products)
      .query({
        pageSize: 100,
        status: "RECALLED",
      })
      .set("Cookie", cookie)
      .expect(200);

    expect(recalled.body.data.products).toHaveLength(40);
    expect(recalled.body.data.pagination.totalItems).toBe(40);

    const batch = await prisma.batch.findUniqueOrThrow({
      select: {
        id: true,
      },
      where: {
        code: "VL-BATCH-2026-003",
      },
    });

    const batchProducts = await request(app)
      .get(API_PATHS.products)
      .query({
        batchId: batch.id,
      })
      .set("Cookie", cookie)
      .expect(200);

    expect(batchProducts.body.data.products).toHaveLength(20);
    expect(
      batchProducts.body.data.products.every(
        (product: { batch: { id: string } }) => product.batch.id === batch.id,
      ),
    ).toBe(true);

    const searched = await request(app)
      .get(API_PATHS.products)
      .query({
        search: "VL-2026-000042",
      })
      .set("Cookie", cookie)
      .expect(200);

    expect(searched.body.data.products).toHaveLength(1);
    expect(searched.body.data.products[0]).toMatchObject({
      serialNumber: "VL-2026-000042",
      status: "VERIFIED",
    });
  });

  it("returns product custody history", async () => {
    const cookie = await signIn("operator@verilot.local", "VeriLotOperator2026!");

    const product = await prisma.product.findUniqueOrThrow({
      select: {
        id: true,
      },
      where: {
        serialNumber: "VL-2026-000042",
      },
    });

    const response = await request(app)
      .get(`${API_PATHS.products}/${product.id}`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.product).toMatchObject({
      batch: {
        code: "VL-BATCH-2026-003",
        productName: "Thermal Control Module",
      },
      serialNumber: "VL-2026-000042",
      status: "VERIFIED",
    });

    expect(response.body.data.product.custodyEvents.length).toBe(
      response.body.data.product.eventCount,
    );

    expect(response.body.data.product.custodyEvents[0]).toMatchObject({
      type: "MANUFACTURED",
    });
  });

  it("does not expose a product from another organization", async () => {
    const manufacturerCookie = await signIn("admin@verilot.local", "VeriLotAdmin2026!");

    await request(app)
      .get(`${API_PATHS.products}/${crossOrganizationProductId}`)
      .set("Cookie", manufacturerCookie)
      .expect(404);

    const logisticsCookie = await signIn(crossOrganizationEmail, "VeriLotAdmin2026!");

    const response = await request(app)
      .get(API_PATHS.products)
      .set("Cookie", logisticsCookie)
      .expect(200);

    expect(response.body.data.products).toHaveLength(1);
    expect(response.body.data.products[0].id).toBe(crossOrganizationProductId);
  });
});
