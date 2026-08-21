/** Runtime assisted-submission boundary coverage. */
import { expect, test } from "@playwright/test";

test.describe("assisted submission handoff", () => {
  test("shows official portal and requires complete checklist", async ({ page }) => {
    await page.goto("/integrations");
    await expect(page.getByRole("heading", { name: "Portal integrations" })).toBeVisible();
    await expect(page.getByRole("link", { name: "https://eprocure.gov.in/eprocure/app" })).toHaveAttribute("href", "https://eprocure.gov.in/eprocure/app");
    await expect(page.getByText(/Recent Clerk verification is enforced/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm handoff readiness" })).toBeDisabled();
    await page.getByLabel("I confirmed the portal server time and deadline").check();
    await page.getByLabel("EMD amount, instrument, and validity verified").check();
    await page.getByLabel("Digital signing certificate and required covers ready").check();
    await page.getByLabel("Filenames, formats, and size limits match portal instructions").check();
    await expect(page.getByRole("button", { name: "Confirm handoff readiness" })).toBeEnabled();
  });

  test("validates receipt before accepting acknowledgement", async ({ page }) => {
    await page.goto("/integrations");
    await page.getByLabel("Acknowledgement number").fill("short");
    await page.getByLabel("Portal timestamp").fill("2026-08-21T12:00");
    const acknowledgement = page.getByLabel("Acknowledgement number");
    expect(await acknowledgement.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  });

  test("states autonomous submission is unavailable", async ({ page }) => {
    await page.goto("/integrations");
    await expect(page.getByText(/system never submits autonomously/).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Submission boundary" })).toContainText("No API exists for DSC use, terms acceptance, or final portal submission.");
  });
});
