import { describe, expect, it } from "vitest";

import { getHealthSnapshot } from "../../src/services/system.service.js";

describe("getHealthSnapshot", () => {
  it("returns deterministic service metadata", () => {
    const now = new Date("2026-07-31T10:15:00.000Z");

    expect(getHealthSnapshot(now, 42.9)).toEqual({
      apiVersion: "v1",
      service: "verilot-api",
      status: "ok",
      timestamp: "2026-07-31T10:15:00.000Z",
      uptimeSeconds: 42,
    });
  });
});
