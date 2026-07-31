import { expect, test } from "@playwright/test";

import { stableRecords } from "./support.js";

test("operator does not see or access audit history", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Audit" })).toHaveCount(0);

  await page.goto("/audit");
  await expect(page.getByRole("heading", { level: 1, name: "Permission required" })).toBeVisible();
  await expect(page.getByText("Your account cannot open this page.")).toBeVisible();
});

test("operator can append a custody event with unique idempotency data", async ({ page }) => {
  await page.goto(`/products/${stableRecords.productId}`);
  await page.getByRole("button", { name: "Record event" }).click();
  const dialog = page.getByRole("dialog", { name: "Record custody event" });
  await dialog.getByLabel("Event type").selectOption("INSPECTED");
  await dialog.getByLabel("Event timestamp").fill("2026-07-30T14:00");
  await dialog.getByLabel("Notes (optional)").fill("Browser regression custody inspection.");

  const mutationRequest = page.waitForRequest(
    (request) => request.url().endsWith("/events") && request.method() === "POST",
  );
  await dialog.getByRole("button", { name: "Record event" }).click();
  const request = await mutationRequest;
  const body = request.postDataJSON() as { idempotencyKey?: unknown };
  expect(body.idempotencyKey).toEqual(expect.stringMatching(/^product-event:/));
  await expect(
    page.getByText(`Inspected event recorded for ${stableRecords.serialNumber}.`),
  ).toBeVisible();
  await expect(page.getByText("Browser regression custody inspection.")).toBeVisible();
});
