/** Product layout regression tests for isolated E2E mode. */
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/opportunities" }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => { throw new Error("Clerk hook used in E2E mode"); },
  useOrganization: () => { throw new Error("Clerk hook used in E2E mode"); },
  useUser: () => { throw new Error("Clerk hook used in E2E mode"); },
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_BIDRADAR_E2E_MODE", "1");
});

test("renders isolated E2E shell without invoking Clerk hooks", async () => {
  const { default: ProductLayout } = await import("../../app/(product)/layout");
  render(<ProductLayout><main>Test content</main></ProductLayout>);
  expect(screen.getByText("Test content")).toBeVisible();
  expect(screen.getByText("E2E organization")).toBeVisible();
});

test("maps Clerk organization roles to least-privilege navigation", async () => {
  const layout = await import("../../app/(product)/layout");
  expect(layout.permissionsForRole("org:viewer")).toEqual(["opportunities", "alerts", "reports"]);
  expect(layout.permissionsForRole("org:reviewer")).toEqual(["opportunities", "alerts", "reviews", "content", "proposals", "reports"]);
  expect(layout.permissionsForRole("org:admin")).toEqual([
    "opportunities", "watchlist", "alerts", "companies", "reviews", "content", "proposals", "submissions", "integrations", "reports", "settings",
  ]);
});
