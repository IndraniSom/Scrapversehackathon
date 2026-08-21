/** Runtime responsive checks at product-supported widths. */
import { expect, test, type Page } from "@playwright/test";

/** Returns document width and visible elements extending beyond its viewport. */
async function overflowDetails(page: Page): Promise<{ clientWidth: number; scrollWidth: number; offenders: string[] }> {
  return page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > clientWidth + 1 || rect.left < -1;
      })
      .slice(0, 5)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`);
    return { clientWidth, scrollWidth: document.documentElement.scrollWidth, offenders };
  });
}

for (const width of [320, 768, 1024, 1440]) {
  test(`product routes avoid page overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/opportunities", "/reviews", "/companies", "/proposals"]) {
      await page.goto(route);
      await expect(page.locator("#main-content").first()).toBeVisible();
      const overflow = await overflowDetails(page);
      expect(overflow.scrollWidth, `${route} overflowed at ${width}px: ${overflow.offenders.join(", ")}`).toBeLessThanOrEqual(overflow.clientWidth + 1);
    }
  });
}

test("navigation changes between mobile and desktop", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/opportunities");
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Primary navigation desktop" })).toBeHidden();
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(page.getByRole("complementary", { name: "Primary navigation desktop" })).toBeVisible();
});
