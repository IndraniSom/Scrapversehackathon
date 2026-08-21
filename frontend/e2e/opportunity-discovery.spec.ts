/** Runtime opportunity discovery coverage with persistent Convex seed data. */
import { expect, test } from "@playwright/test";

test.describe("opportunity discovery", () => {
  test("renders seeded opportunity and enables bulk watch", async ({ page }) => {
    await page.goto("/opportunities");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("link", { name: "Cloud security operations" })).toBeVisible();
    await page.getByLabel("Select all opportunities").check();
    await expect(page.getByRole("button", { name: "Watch (1)" })).toBeEnabled();
  });

  test("keyword and closed filters update URL and results", async ({ page }) => {
    await page.goto("/opportunities");
    await page.getByRole("searchbox", { name: "Keyword" }).fill("Cloud");
    await expect(page).toHaveURL(/q=Cloud/);
    await expect(page.getByRole("link", { name: "Cloud security operations" })).toBeVisible();
    await page.getByRole("combobox", { name: "Source" }).selectOption("CPPP");
    await expect(page).toHaveURL(/source=CPPP/);
    await expect(page.getByRole("heading", { name: "No opportunities match" })).toBeVisible();
  });

  test("invalid filters do not crash discovery", async ({ page }) => {
    await page.goto("/opportunities?lifecycle=INVALID&source=NTPC");
    await expect(page.locator(".page-intro").getByRole("heading", { name: "Opportunities", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cloud security operations" })).toBeVisible();
  });
});
