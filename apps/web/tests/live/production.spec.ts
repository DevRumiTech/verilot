import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const demoEmail = process.env.VERILOT_DEMO_EMAIL;
const demoPassword = process.env.VERILOT_DEMO_PASSWORD;

if (demoEmail === undefined || demoPassword === undefined) {
  throw new Error("VERILOT_DEMO_EMAIL and VERILOT_DEMO_PASSWORD are required.");
}

const screenshotDirectory = fileURLToPath(
  new URL("../../../../docs/screenshots/", import.meta.url),
);
const productId = "00000000-0000-4000-8000-000005000042";
const viewports = [
  { height: 568, width: 320 },
  { height: 844, width: 390 },
  { height: 932, width: 430 },
  { height: 1024, width: 768 },
  { height: 768, width: 1024 },
  { height: 900, width: 1440 },
] as const;

async function expectNoPageOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 &&
          document.body.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

async function openPage(page: Page, path: string, heading: string): Promise<void> {
  const response = await page.goto(path, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expectNoPageOverflow(page);
}

async function signIn(page: Page): Promise<string> {
  await page.getByLabel("Email address").fill(demoEmail);
  await page.getByLabel("Password").fill(demoPassword);
  const response = page.waitForResponse((candidate) =>
    candidate.url().includes("/api/v1/auth/login"),
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  const loginResponse = await response;
  expect(loginResponse.status()).toBe(200);
  const body = (await loginResponse.json()) as { data?: { csrfToken?: unknown } };
  expect(typeof body.data?.csrfToken).toBe("string");
  await expect(page.getByText("Demo", { exact: true })).toBeVisible();
  return body.data?.csrfToken as string;
}

test("production demo remains responsive, readable, and read-only", async ({ page }) => {
  const browserErrors: string[] = [];
  const failedApiResponses: string[] = [];

  page.on("console", (message) => {
    const isExpectedSecurityResponseMessage =
      message.type() === "error" &&
      [
        "Failed to load resource: the server responded with a status of 401 ()",
        "Failed to load resource: the server responded with a status of 403 ()",
      ].includes(message.text());

    if (message.type() === "error" && !isExpectedSecurityResponseMessage) {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    const isExpectedAnonymousSession =
      response.status() === 401 && url.pathname === "/api/v1/auth/session";
    const isExpectedDeniedWrite =
      response.status() === 403 &&
      response.request().method() === "POST" &&
      url.pathname === "/api/v1/batches";

    if (
      url.pathname.startsWith("/api/") &&
      response.status() >= 400 &&
      !isExpectedAnonymousSession &&
      !isExpectedDeniedWrite
    ) {
      failedApiResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });

  await page.setViewportSize({ height: 900, width: 1440 });
  await openPage(page, "/sign-in", "Sign in to VeriLot");
  await page.screenshot({
    path: `${screenshotDirectory}sign-in.png`,
  });
  const csrfToken = await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Audit" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);

  const deniedWrite = await page.evaluate(async (token) => {
    const response = await fetch("/api/v1/batches", {
      body: "{}",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": token,
      },
      method: "POST",
    });
    const body = (await response.json()) as { error?: { code?: unknown } };
    return { code: body.error?.code, status: response.status };
  }, csrfToken);
  expect(deniedWrite).toEqual({ code: "INSUFFICIENT_PERMISSIONS", status: 403 });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openPage(page, "/dashboard", "Dashboard");
    await expect(page.getByRole("heading", { name: "Recent alerts" })).toBeVisible();

    if (viewport.width <= 430) {
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveCount(0);
    }

    if (viewport.width === 390) {
      await page.screenshot({ path: `${screenshotDirectory}dashboard-mobile.png` });
    }
    if (viewport.width === 1440) {
      await page.screenshot({ path: `${screenshotDirectory}dashboard-desktop.png` });
    }

    await openPage(page, "/products", "Products");
    await expect(page.getByRole("rowheader").first()).toBeVisible();
    await openPage(page, `/products/${productId}`, "Traceability record");
    await expect(page.getByRole("heading", { name: "Custody history" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record event" })).toHaveCount(0);

    if (viewport.width === 390) {
      await page.screenshot({ path: `${screenshotDirectory}product-mobile.png` });
    }
    if (viewport.width === 1440) {
      await page.screenshot({ path: `${screenshotDirectory}product-detail-desktop.png` });
    }
  }

  await page.setViewportSize({ height: 900, width: 1440 });
  await openPage(page, "/batches", "Batches");
  await expect(page.getByRole("button", { name: "Create batch" })).toHaveCount(0);
  await page.screenshot({ path: `${screenshotDirectory}batches-desktop.png` });
  await openPage(page, "/alerts", "Alerts");
  await openPage(page, "/recalls", "Recalls");
  await openPage(page, "/locations", "Locations");

  await openPage(page, `/products/${productId}`, "Traceability record");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "Traceability record" })).toBeVisible();

  await page.goto("/audit", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "Permission required" })).toBeVisible();
  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to VeriLot" })).toBeVisible();
  await signIn(page);
  await expect(page).toHaveURL(/\/audit$/);
  await expect(page.getByRole("heading", { level: 1, name: "Permission required" })).toBeVisible();
  await openPage(page, "/dashboard", "Dashboard");

  expect(failedApiResponses).toEqual([]);
  expect(browserErrors).toEqual([]);
});
