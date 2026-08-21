/** Product layout regression tests for explicit offline demo mode. */
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/opportunities" }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => { throw new Error("Clerk hook used in demo mode"); },
  useOrganization: () => { throw new Error("Clerk hook used in demo mode"); },
  useUser: () => { throw new Error("Clerk hook used in demo mode"); },
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_BIDRADAR_DEMO_MODE", "1");
});

test("renders explicit demo shell without invoking Clerk hooks", async () => {
  const { default: ProductLayout } = await import("../../app/(product)/layout");
  render(<ProductLayout><main>Demo content</main></ProductLayout>);
  expect(screen.getByText("Demo content")).toBeVisible();
  expect(screen.getByText("Demo organization")).toBeVisible();
});

test("maps Clerk organization roles to least-privilege navigation", async () => {
  const layout = await import("../../app/(product)/layout");
  expect(layout.permissionsForRole("org:viewer")).toEqual(["opportunities", "reports"]);
  expect(layout.permissionsForRole("org:reviewer")).toEqual(["opportunities", "reviews", "proposals", "reports"]);
  expect(layout.permissionsForRole("org:admin")).toEqual([
    "opportunities", "watchlist", "companies", "reviews", "proposals", "submissions", "reports", "settings",
  ]);
});
