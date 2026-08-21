/** Runtime accessibility checks against seeded product pages. */
import { expect, test } from "@playwright/test";

test.describe("runtime accessibility", () => {
  test("skip link reaches visible main content", async ({ page }) => {
    await page.goto("/opportunities");
    const skip = page.getByRole("link", { name: "Skip to main content" }).first();
    await skip.focus();
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await skip.press("Enter");
    await expect(page.locator("#main-content").first()).toBeFocused();
  });

  test("product pages expose headings, tables, and labelled controls", async ({ page }) => {
    await page.goto("/opportunities");
    await expect(page.locator(".page-intro").getByRole("heading", { name: "Opportunities", level: 1 })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Keyword" })).toBeVisible();
    await page.goto("/reviews");
    await expect(page.getByRole("heading", { name: "Evidence review queue", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Priority")).toBeVisible();
    await expect(page.getByLabel("State")).toBeVisible();
  });

  test("focus indicator and target size are rendered", async ({ page }) => {
    await page.goto("/opportunities");
    const button = page.getByRole("button", { name: "Save this search" });
    await button.focus();
    const metrics = await button.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { height: box.height, outlineWidth: style.outlineWidth };
    });
    expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(metrics.outlineWidth).not.toBe("0px");
  });
});
