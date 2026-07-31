import { expect, test } from "@playwright/test";

import { stableRecords } from "./support.js";

test("dashboard loads API-backed summaries", async ({ page }) => {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().includes("/api/v1/dashboard/summary") && candidate.status() === 200,
  );
  await page.goto("/dashboard");
  await response;

  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent alerts" })).toBeVisible();
  await expect(page.getByLabel("Verification activity by day")).toBeVisible();
});

test("product search opens the stable product detail", async ({ page }) => {
  await page.goto("/products");
  await page.getByLabel("Search serial number or batch").fill(stableRecords.serialNumber);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: stableRecords.serialNumber }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Traceability record" })).toBeVisible();
  await expect(page.getByRole("heading", { name: stableRecords.serialNumber })).toBeVisible();
  await expect(page).toHaveURL(`/products/${stableRecords.productId}`);
});

test("batch search opens a batch detail", async ({ page }) => {
  await page.goto("/batches");
  await page.getByLabel("Search code, lot, product, or SKU").fill(stableRecords.batchCode);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: stableRecords.batchCode }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Manufacturing lot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: stableRecords.batchCode })).toBeVisible();
});

test("alert filters open an alert detail", async ({ page }) => {
  await page.goto("/alerts");
  await page.getByLabel("Status").selectOption("OPEN");
  await page.getByLabel("Rule").selectOption("IMPOSSIBLE_TRAVEL");
  await page.getByRole("link", { name: "Impossible Travel detected" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Investigation record" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Impossible Travel detected" })).toBeVisible();
});

test("recall filters open the active recall detail", async ({ page }) => {
  await page.goto("/recalls");
  await page.getByLabel("Status").selectOption("ACTIVE");
  await page.getByLabel("Search recalls").fill(stableRecords.recallReference);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: stableRecords.recallReference }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Response record" })).toBeVisible();
  await expect(page.getByRole("heading", { name: stableRecords.recallReference })).toBeVisible();
});

test("administrator can open audit history and a record", async ({ page }) => {
  await page.goto("/audit");
  await expect(page.getByRole("heading", { level: 1, name: "Audit" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Audit" })).toBeVisible();

  const recordLink = page.getByRole("rowheader").first().getByRole("link");
  await recordLink.click();
  await expect(page.getByRole("heading", { level: 1, name: "Record history" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "After data" })).toBeVisible();
});

test("an authenticated detail route loads directly", async ({ page }) => {
  await page.goto(`/products/${stableRecords.productId}`);

  await expect(page.getByRole("heading", { level: 1, name: "Traceability record" })).toBeVisible();
  await expect(page.getByRole("heading", { name: stableRecords.serialNumber })).toBeVisible();
});

test("administrator can assign an open alert with unique idempotency data", async ({ page }) => {
  await page.goto(`/alerts/${stableRecords.alertId}`);
  await expect(page.getByRole("button", { name: "Assign" })).toBeVisible();
  await page.getByRole("button", { name: "Assign" }).click();
  const dialog = page.getByRole("dialog", { name: "Assign alert" });
  await expect(dialog.getByLabel("Assign to")).toBeEnabled();

  const mutationRequest = page.waitForRequest(
    (request) => request.url().endsWith("/assign") && request.method() === "POST",
  );
  await dialog.getByRole("button", { name: "Confirm assignment" }).click();
  const request = await mutationRequest;
  const body = request.postDataJSON() as { idempotencyKey?: unknown };
  expect(body.idempotencyKey).toEqual(expect.stringMatching(/^alert-assign:/));
  await expect(page.getByText("Alert assigned to Operations Administrator.")).toBeVisible();
});
