/**
 * E2E: submission handoff assisted flow.
 *
 * Verifies checklist official link, server-clock warning, EMD/signing,
 * step-up/approval gate, and receipt acknowledgement digest.
 */
import { test, expect } from "@playwright/test";

test.describe("assisted submission handoff", () => {
  test("shows checklist with official link and server-clock warning", async ({ page }) => {
    await page.goto("/integrations");
    await expect(page.getByRole("heading", { name: /portal integrations/i })).toBeVisible();
    await expect(page.getByText(/SubmissionConnector\.prepare/i)).toBeVisible();
    await expect(page.getByText(/SubmissionConnector\.status/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /eprocure\.gov\.in/ })).toHaveAttribute("href", /https:\/\/eprocure\.gov\.in/);
    await expect(page.getByText(/Server-clock warning/i)).toBeVisible();
    await expect(page.getByText(/Portal time is/i)).toBeVisible();
  });

  test("checklist requires EMD, signing, filenames and shows gates", async ({ page }) => {
    await page.goto("/integrations");
    await expect(page.getByText(/EMD amount/i)).toBeVisible();
    await expect(page.getByText(/Digital signing/i)).toBeVisible();
    await expect(page.getByText(/Filenames, formats/i)).toBeVisible();
    await expect(page.getByText(/Step-up authentication required/i)).toBeVisible();
    await expect(page.getByText(/Bid-manager approval required/i)).toBeVisible();
    const button = page.getByRole("button", { name: /Confirm handoff readiness/i });
    await expect(button).toBeDisabled();
  });

  test("receipt form captures acknowledgement and digest", async ({ page }) => {
    await page.goto("/integrations");
    await expect(page.getByRole("heading", { name: /Record portal acknowledgement/i })).toBeVisible();
    await expect(page.getByLabel(/Package digest/i)).toBeVisible();
    await expect(page.getByLabel(/Acknowledgement number/i)).toBeVisible();
    await expect(page.getByLabel(/Portal timestamp/i)).toBeVisible();
    await expect(page.getByText(/AI cannot record receipts/i)).toBeVisible();
    await expect(page.getByText(/audited/i)).toBeVisible();
  });

  test("disclaims no autonomous submission", async ({ page }) => {
    await page.goto("/integrations");
    await expect(page.getByText(/never submits autonomously/i)).toBeVisible();
    await expect(page.getByText(/Freeze Bid/i)).toBeVisible();
  });
});
