import { expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

export const stableRecords = {
  alertId: "00000000-0000-4000-8000-000008000001",
  batchCode: "VL-BATCH-2026-003",
  productId: "00000000-0000-4000-8000-000005000042",
  recallReference: "VL-REC-2026-001",
  serialNumber: "VL-2026-000042",
} as const;

export const testAccounts = {
  administrator: {
    email: "admin@verilot.local",
    password: "VeriLotAdmin2026!",
  },
  operator: {
    email: "operator@verilot.local",
    password: "VeriLotOperator2026!",
  },
} as const;

export const authenticationState = {
  administrator: fileURLToPath(
    new URL("../../test-results/.auth/administrator.json", import.meta.url),
  ),
  operator: fileURLToPath(new URL("../../test-results/.auth/operator.json", import.meta.url)),
} as const;

export async function signIn(
  page: Page,
  account: (typeof testAccounts)[keyof typeof testAccounts],
): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  const loginResponse = page.waitForResponse((response) =>
    response.url().includes("/api/v1/auth/login"),
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect((await loginResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
}

export async function expectNoHorizontalPageMovement(page: Page): Promise<void> {
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
