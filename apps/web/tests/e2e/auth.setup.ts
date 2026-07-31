import { test } from "@playwright/test";

import { authenticationState, signIn, testAccounts } from "./support.js";

test("prepare administrator browser state", async ({ page }) => {
  await signIn(page, testAccounts.administrator);
  await page.context().storageState({ path: authenticationState.administrator });
});

test("prepare operator browser state", async ({ page }) => {
  await signIn(page, testAccounts.operator);
  await page.context().storageState({ path: authenticationState.operator });
});
