import { expect, test } from "@playwright/test";

import { expectNoHorizontalPageMovement, signIn, testAccounts } from "./support.js";

test("administrator can sign in and sign out", async ({ page }) => {
  await signIn(page, testAccounts.administrator);
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Sign in to VeriLot" })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("an unknown route displays the not-found page", async ({ page }) => {
  await page.goto("/route-that-does-not-exist");

  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
});

test("a missing session returns a protected route to sign-in at 320 by 568", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 320 });
  await page.goto("/products");

  await expect(page.getByRole("heading", { level: 1, name: "Sign in to VeriLot" })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expectNoHorizontalPageMovement(page);
  const card = await page.getByRole("region", { name: "Account access" }).boundingBox();
  expect(card?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((card?.x ?? 0) + (card?.width ?? 0)).toBeLessThanOrEqual(320);
});
