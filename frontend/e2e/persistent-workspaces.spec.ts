/** Runtime coverage for persistent product registers beyond discovery. */
import { expect, test } from "@playwright/test";

test("watchlist and submission registers load from Convex", async ({ page }) => {
  await page.goto("/watchlist");
  await expect(page.locator(".page-intro").getByRole("heading", { name: "Watchlist", exact: true })).toBeVisible();
  await page.goto("/submissions");
  await expect(page.getByRole("heading", { name: "Submission packages" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
});

test("proposal register opens persistent workspace", async ({ page }) => {
  await page.goto("/proposals");
  const proposal = page.getByRole("table").getByRole("link").first();
  await expect(proposal).toBeVisible();
  await proposal.click();
  await expect(page.getByRole("heading", { name: "Proposal workspace" })).toBeVisible();
});

test("governance and organization settings use persisted queries", async ({ page }) => {
  await page.goto("/settings/ai");
  await expect(page.getByRole("heading", { name: "AI settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Feature controls" })).toBeVisible();
  await page.goto("/settings/organization");
  await expect(page.getByRole("heading", { name: "Organization settings" })).toBeVisible();
});
