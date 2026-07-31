import { API_PATHS, APPLICATION_NAME, PARTNER_API_PATHS, SYSTEM_PATHS } from "@verilot/contracts";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../../src/app.js";

describe("API documentation", () => {
  it("returns the OpenAPI document", async () => {
    const response = await request(app).get(SYSTEM_PATHS.openApi).expect(200);

    expect(response.body).toMatchObject({
      info: {
        title: `${APPLICATION_NAME} API`,
        version: "0.1.0",
      },
      openapi: "3.1.1",
    });

    expect(Object.keys(response.body.paths)).toEqual(
      expect.arrayContaining([
        SYSTEM_PATHS.health,
        API_PATHS.auth.login,
        API_PATHS.auth.logout,
        API_PATHS.auth.session,
        API_PATHS.alerts,
        `${API_PATHS.alerts}/{alertId}`,
        `${API_PATHS.alerts}/{alertId}/assign`,
        `${API_PATHS.alerts}/{alertId}/resolve`,
        `${API_PATHS.alerts}/{alertId}/dismiss`,
        API_PATHS.auditRecords,
        `${API_PATHS.auditRecords}/{auditRecordId}`,
        API_PATHS.batches,
        API_PATHS.dashboardSummary,
        `${API_PATHS.batches}/{batchId}`,
        `${API_PATHS.batches}/{batchId}/activate`,
        `${API_PATHS.batches}/{batchId}/close`,
        API_PATHS.products,
        `${API_PATHS.products}/{productId}`,
        `${API_PATHS.products}/{productId}/events`,
        API_PATHS.recalls,
        `${API_PATHS.recalls}/{recallId}`,
        `${API_PATHS.recalls}/{recallId}/complete`,
        API_PATHS.locations,
        API_PATHS.users,
        `${API_PATHS.verification}/{serialNumber}`,
        `${PARTNER_API_PATHS.verification}/{serialNumber}`,
      ]),
    );

    expect(response.body.components.securitySchemes).toEqual(
      expect.objectContaining({
        csrfHeader: expect.any(Object),
        partnerApiKey: expect.any(Object),
        sessionCookie: expect.any(Object),
      }),
    );
  });

  it("returns the Swagger UI page with route-specific headers", async () => {
    const response = await request(app).get(`${SYSTEM_PATHS.docs}/`).expect(200);

    expect(response.type).toBe("text/html");
    expect(response.text).toContain("swagger-ui");
    expect(response.text).toContain("<title>VeriLot API</title>");

    expect(response.headers["content-security-policy"]).toContain(
      "script-src 'self' 'unsafe-inline'",
    );
  });
});
