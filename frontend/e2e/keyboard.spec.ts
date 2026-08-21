/** Runtime keyboard checks for navigation, dialogs, and discovery controls. */
import { expect, test } from "@playwright/test";

test.describe("keyboard interaction", () => {
  test("mobile drawer opens and closes from keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/opportunities");
    const openButton = page.getByRole("button", { name: "Open navigation" });
    await openButton.focus();
    await openButton.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Navigation menu" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("saved-search dialog closes with Escape", async ({ page }) => {
    await page.goto("/opportunities");
    await page.getByRole("button", { name: "Save this search" }).click();
    const dialog = page.getByRole("dialog", { name: "Save search" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("filter and bulk-selection controls work from keyboard", async ({ page }) => {
    await page.goto("/opportunities");
    const keyword = page.getByRole("searchbox", { name: "Keyword" });
    await keyword.focus();
    await keyword.pressSequentially("Cloud");
    await expect(page).toHaveURL(/q=Cloud/);
    const selectAll = page.getByLabel("Select all opportunities");
    await selectAll.focus();
    await selectAll.press("Space");
    await expect(page.getByRole("button", { name: "Watch (1)" })).toBeEnabled();
  });
});
