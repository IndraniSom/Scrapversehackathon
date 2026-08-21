/** Public production-entry route tests. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import HomePage from "../app/page";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: null })) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

afterEach(cleanup);

test("public entry presents production workflow and authentication routes", async () => {
  render(await HomePage());
  expect(screen.getByRole("heading", { name: "Find tenders. Prove eligibility. Ship a reviewed bid package." })).toBeVisible();
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/sign-up");
  expect(screen.getByText(/Missing facts stay UNKNOWN/)).toBeVisible();
  expect(screen.getByText(/never submits autonomously/i)).toBeVisible();
});
