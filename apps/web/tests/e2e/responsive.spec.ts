import { expect, test } from "@playwright/test";

import { expectNoHorizontalPageMovement, stableRecords } from "./support.js";

const viewports = [
  { height: 568, width: 320 },
  { height: 844, width: 390 },
  { height: 932, width: 430 },
  { height: 1024, width: 768 },
  { height: 768, width: 1024 },
  { height: 900, width: 1440 },
] as const;

for (const viewport of viewports) {
  test(`${viewport.width} by ${viewport.height} keeps primary views and dialogs inside the page`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent alerts" })).toBeVisible();
    await expectNoHorizontalPageMovement(page);

    await page.goto("/products");
    await expect(page.getByRole("heading", { level: 1, name: "Products" })).toBeVisible();
    await expect(page.getByRole("rowheader").first()).toBeVisible();
    await expectNoHorizontalPageMovement(page);

    await page.goto("/recalls");
    await expect(page.getByRole("heading", { level: 1, name: "Recalls" })).toBeVisible();
    const recallCard = await page.locator(".recall-controls").boundingBox();
    expect(recallCard).not.toBeNull();
    for (const label of ["Announced from", "Announced to"]) {
      const input = page.getByLabel(label);
      const inputBounds = await input.boundingBox();
      const fieldBounds = await input.locator("xpath=..").boundingBox();
      expect(inputBounds).not.toBeNull();
      expect(fieldBounds).not.toBeNull();
      expect((inputBounds?.x ?? 0) + (inputBounds?.width ?? 0)).toBeLessThanOrEqual(
        (fieldBounds?.x ?? 0) + (fieldBounds?.width ?? 0) + 1,
      );
      expect((inputBounds?.x ?? 0) + (inputBounds?.width ?? 0)).toBeLessThanOrEqual(
        (recallCard?.x ?? 0) + (recallCard?.width ?? 0) + 1,
      );
    }
    await expectNoHorizontalPageMovement(page);

    if (viewport.width <= 430) {
      const menuButton = page.getByRole("button", { name: "Menu" });
      const dimensions = await menuButton.boundingBox();
      expect(dimensions?.height ?? 0).toBeGreaterThanOrEqual(44);
      await menuButton.click();
      await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveCount(0);

      const productRow = page
        .getByRole("row")
        .filter({ has: page.getByRole("rowheader") })
        .first();
      await expect(productRow).toHaveCSS("display", "block");
    }

    await page.goto(`/products/${stableRecords.productId}`);
    await page.getByRole("button", { name: "Record event" }).click();
    const dialog = page.getByRole("dialog", { name: "Record custody event" });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(bounds?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
    await dialog.getByRole("button", { name: "Cancel" }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expectNoHorizontalPageMovement(page);
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.goto("/audit");
    await expect(page.getByRole("heading", { level: 1, name: "Audit" })).toBeVisible();
    await expect(page.getByRole("rowheader").first()).toBeVisible();
    await expectNoHorizontalPageMovement(page);
  });
}
