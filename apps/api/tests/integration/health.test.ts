import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../../src/app.js";

describe("system routes", () => {
  it("returns API health with a generated request ID", async () => {
    const response = await request(app).get("/api/health").expect(200);

    expect(response.headers["x-request-id"]).toMatch(/^req_[a-f0-9]{32}$/);
    expect(response.body).toMatchObject({
      data: {
        apiVersion: "v1",
        service: "verilot-api",
        status: "ok",
      },
    });
    expect(response.body.data.timestamp).toEqual(expect.any(String));
    expect(response.body.data.uptimeSeconds).toEqual(expect.any(Number));
  });

  it("returns the standard error shape for an unknown route", async () => {
    const response = await request(app).get("/api/missing").expect(404);

    expect(response.body).toEqual({
      error: {
        code: "ROUTE_NOT_FOUND",
        fieldErrors: {},
        message: "Route not found.",
        requestId: response.headers["x-request-id"],
      },
    });
  });

  it("accepts a valid caller-provided request ID", async () => {
    const requestId = "req_partner_12345";
    const response = await request(app)
      .get("/api/health")
      .set("X-Request-ID", requestId)
      .expect(200);

    expect(response.headers["x-request-id"]).toBe(requestId);
  });
});
