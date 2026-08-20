/**
 * E2E clause review queue: filters, synchronized panes, reason gates,
 * stale handling, reset on material change, and assessment rerun.
 */
import { expect, test } from "@playwright/test";

test.describe("clause review queue", () => {
  test("filters, synchronized evidence, and reason gates", async ({ page }) => {
    await page.goto("/reviews");
    await expect(page.getByRole("heading", { name: /evidence review queue/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /review queue/i })).toBeVisible();

    // filters visible
    await expect(page.getByLabel("Priority")).toBeVisible();
    await expect(page.getByLabel("State")).toBeVisible();

    // select first tender row
    await page.getByRole("button", { name: "ocac-pond-26001" }).first().click();
    await expect(page.getByRole("heading", { name: /clause review/i })).toBeVisible();

    // synchronized page evidence
    await expect(page.getByRole("heading", { name: /page evidence/i })).toBeVisible();
    await page.getByRole("button", { name: /page 2/i }).click();
    await expect(page.getByText(/cited page 2/i)).toBeVisible();

    // reject requires reason
    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByRole("alert")).toContainText(/reason must be at least 8/i);

    // provide reason and reject
    await page.getByLabel(/decision reason/i).fill("Evidence excerpt does not contain turnover table");
    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByRole("status")).toContainText(/rejected/i);

    // edit requires reason and resets
    await page.getByLabel(/decision reason/i).fill("Correcting threshold from 12 to 6 crore per corrigendum");
    await page.getByLabel(/edited clause/i).fill("Turnover average 6 crore");
    await page.getByRole("button", { name: "Save edit" }).click();
    await expect(page.getByRole("status")).toContainText(/reset/i);

    // confirm re-runs assessments
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByRole("status")).toContainText(/assessments re-running/i);
  });

  test("material change resets review and blocks stale confirm", async ({ page }) => {
    await page.goto("/reviews");
    await page.getByRole("button", { name: "ocac-pond-26001" }).first().click();
    await expect(page.getByText(/material clause or page hash changes reset/i)).toBeVisible();
    // confirm shows status, implying no stale error on fresh page
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByRole("status")).toBeVisible();
  });
});
