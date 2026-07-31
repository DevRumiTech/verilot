import { expect, test } from "@playwright/test";

const demoEmail = process.env.VERILOT_DEMO_EMAIL;
const demoPassword = process.env.VERILOT_DEMO_PASSWORD;

if (demoEmail === undefined || demoPassword === undefined) {
  throw new Error("VERILOT_DEMO_EMAIL and VERILOT_DEMO_PASSWORD are required.");
}

const viewports = [
  { height: 568, width: 320 },
  { height: 844, width: 390 },
  { height: 932, width: 430 },
] as const;

test("recall date filters stay inside the card on mobile WebKit", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(demoEmail);
  await page.getByLabel("Password").fill(demoPassword);
  const loginResponse = page.waitForResponse((response) =>
    response.url().includes("/api/v1/auth/login"),
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await loginResponse).status()).toBe(200);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/recalls", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: "Recalls" })).toBeVisible();

    const card = page.locator(".recall-controls");
    const cardBox = await card.boundingBox();
    expect(cardBox).not.toBeNull();

    for (const label of ["Announced from", "Announced to"]) {
      const input = page.getByLabel(label);
      const field = input.locator("xpath=..");
      const inputBox = await input.boundingBox();
      const fieldBox = await field.boundingBox();
      expect(inputBox).not.toBeNull();
      expect(fieldBox).not.toBeNull();
      expect((inputBox?.x ?? 0) + (inputBox?.width ?? 0)).toBeLessThanOrEqual(
        (fieldBox?.x ?? 0) + (fieldBox?.width ?? 0) + 1,
      );
      expect((inputBox?.x ?? 0) + (inputBox?.width ?? 0)).toBeLessThanOrEqual(
        (cardBox?.x ?? 0) + (cardBox?.width ?? 0) + 1,
      );
    }

    const hasHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 ||
        document.body.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
  }
});
