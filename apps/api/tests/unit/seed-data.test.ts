import { describe, expect, it } from "vitest";

import {
  buildSeedData,
  STABLE_SERIAL_NUMBER,
  type SeedCredentials,
} from "../../prisma/seed-data.js";

const credentials: SeedCredentials = {
  administratorPasswordHash: "a".repeat(60),
  apiKeyHash: "d".repeat(64),
  inspectorPasswordHash: "i".repeat(60),
  operatorPasswordHash: "o".repeat(60),
};

describe("buildSeedData", () => {
  it("builds the complete deterministic recruiter dataset", () => {
    const data = buildSeedData(credentials);

    expect(data.organizations).toHaveLength(4);
    expect(data.users).toHaveLength(4);
    expect(data.locations).toHaveLength(8);
    expect(data.batches).toHaveLength(8);
    expect(data.products).toHaveLength(160);
    expect(data.custodyEvents).toHaveLength(250);
    expect(data.alerts).toHaveLength(16);
    expect(data.recalls).toHaveLength(2);
    expect(data.auditRecords).toHaveLength(120);
    expect(data.apiClients).toHaveLength(1);
  });

  it("preserves the initial recruiter-sequence state", () => {
    const data = buildSeedData(credentials);
    const stableProduct = data.products.find(
      (product) => product.serialNumber === STABLE_SERIAL_NUMBER,
    );
    const geneva = data.locations.find((location) => location.code === "GVA");
    const stableTimeline = data.custodyEvents.filter(
      (event) => event.productId === stableProduct?.id,
    );

    expect(stableProduct).toMatchObject({
      serialNumber: "VL-2026-000042",
      status: "VERIFIED",
    });
    expect(stableTimeline).toHaveLength(2);
    expect(stableTimeline.at(-1)).toMatchObject({
      eventAt: new Date("2026-07-30T09:00:00.000Z"),
      locationId: geneva?.id,
      type: "DISPATCHED",
    });
    expect(data.alerts.some((alert) => alert.productId === stableProduct?.id)).toBe(false);
  });
});
