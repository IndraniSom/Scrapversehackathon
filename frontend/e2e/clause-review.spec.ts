/** Runtime clause-review queue and decision coverage. */
import { expect, test } from "@playwright/test";

test.describe("clause review queue", () => {
  test("validates rejection reason and persists decision", async ({ page }) => {
    await page.goto("/reviews");
    await expect(page.getByRole("heading", { name: "Review queue", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "turnover-average" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Clause review", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(page.getByText("Reason must be at least 8 characters.", { exact: true })).toBeVisible();
    await page.getByLabel(/Decision reason/).fill("Evidence does not support this requirement");
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Review rejected");
  });
});
