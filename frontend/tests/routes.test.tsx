import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import AmendmentPage from "../app/opportunities/[opportunityId]/amendment/page";
import OpportunityPage from "../app/opportunities/[opportunityId]/page";
import HomePage from "../app/page";
import { jsonResponse, readFixture } from "./fixtures";

vi.mock("next/dist/compiled/server-only", () => ({}));

const opportunities = readFixture("opportunities.manual.json");
const assessment = readFixture("assessment.manual.json");
const amendment = readFixture("amendment-impact.manual.json");
const sourceProof = readFixture("source-proof.manual.json");

/** Installs a fetch boundary that serves complete examples by request path. */
function installFixtureApi(): void {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(input.toString()).pathname;
    if (path.endsWith("/amendment-impact")) return jsonResponse(amendment);
    if (path.endsWith("/source-proof")) return jsonResponse(sourceProof);
    if (path === "/api/v1/opportunities") return jsonResponse(opportunities);
    return jsonResponse(assessment);
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("server-rendered routes", () => {
  test("lists six opportunities from all three sources with freshness and proof", async () => {
    installFixtureApi();
    render(await HomePage());
    expect(screen.getAllByRole("row")).toHaveLength(7);
    expect(screen.getAllByText("CPPP")).toHaveLength(2);
    expect(screen.getAllByText("WEST_BENGAL")).toHaveLength(2);
    expect(screen.getAllByText("NTPC")).toHaveLength(2);
    expect(screen.getByText(/Generated 20 Aug 2026/i)).toBeVisible();
    expect(screen.getAllByText("MANUAL_FIXTURE").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/aaaaaaaaaaaaaaaa/)).toHaveLength(2);
    expect(screen.getByRole("group", { name: /source proof details/i })).toBeInTheDocument();
  });

  test("shows profile, evidence provenance, and official links on the detail view", async () => {
    installFixtureApi();
    render(await OpportunityPage({ params: Promise.resolve({ opportunityId: "wb-hci-063" }), searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: /hyperconverged infrastructure/i })).toBeVisible();
    expect(screen.getByRole("region", { name: /base tender recommendation/i })).toBeVisible();
    expect(screen.getByText("Example Systems Private Limited")).toBeVisible();
    expect(screen.getByText("CIN-U00000WB2026PTC000001")).toBeVisible();
    expect(screen.getAllByText("EVIDENCE_VERIFIED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("HUMAN_CONFIRMED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("manual-review").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /open official/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /review amendment impact/i })).toHaveAttribute("href", "/opportunities/wb-hci-063/amendment");
    expect(screen.getByText(/meets the amended INR 1 crore threshold/i)).toBeVisible();
    expect(screen.getByText(/decision support only/i)).toBeVisible();
  });

  test("shows the authority-backed document and recommendation transition", async () => {
    installFixtureApi();
    render(await AmendmentPage({ params: Promise.resolve({ opportunityId: "wb-hci-063" }), searchParams: Promise.resolve({}) }));
    const transition = screen.getByRole("region", { name: /recommendation transition/i });
    expect(within(transition).getByText("NO_BID")).toBeVisible();
    expect(within(transition).getByText("BID")).toBeVisible();
    expect(screen.getByText("AUTHORITY")).toBeVisible();
    expect(screen.getByText("ACCEPTED")).toBeVisible();
    expect(screen.getAllByText(/effective change/i).length).toBeGreaterThan(0);
    const lineage = screen.getByRole("region", { name: /document lineage/i });
    expect(within(lineage).getByText("dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd")).toBeVisible();
    expect(within(lineage).getByText("9999999999999999999999999999999999999999999999999999999999999999")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Eligibility Criteria" })).getAllByText(/INR 2 crore/)[0]).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Corrigendum" })).getAllByText(/INR 1 crore/)[0]).toBeVisible();
  });

  test("renders explicit backend and schema failures through the real API layer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 503)));
    const { rerender } = render(await HomePage());
    expect(screen.getByRole("alert")).toHaveTextContent(/backend unavailable/i);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ request_id: "bad", data: {} })));
    rerender(await HomePage());
    expect(screen.getByRole("alert")).toHaveTextContent(/response contract mismatch/i);
  });

  test("delegates a missing opportunity to the route 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 404)));
    await expect(OpportunityPage({ params: Promise.resolve({ opportunityId: "missing" }), searchParams: Promise.resolve({}) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});
