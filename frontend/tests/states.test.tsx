import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import ErrorBoundary from "../app/error";
import Loading from "../app/loading";
import NotFound from "../app/not-found";
import { AmendmentImpactView } from "../components/amendment-impact-view";
import { EmptyOpportunities } from "../components/opportunity-table";
import { SourceProofPanel } from "../components/source-proof-panel";
import { StatusBadge } from "../components/status-badge";
import { amendmentImpactEnvelopeSchema } from "../schemas/assessment";
import { sourceProofEnvelopeSchema } from "../schemas/envelopes";
import type { Evaluation } from "../schemas/common";
import { opportunityListEnvelopeSchema } from "../schemas/opportunities";
import { cloneFixture, objectProperty, readFixture } from "./fixtures";

const sourceProof = sourceProofEnvelopeSchema.parse(readFixture("source-proof.manual.json"));
const amendment = readFixture("amendment-impact.manual.json");
const evaluationStates: Evaluation[] = ["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"];

afterEach(cleanup);

describe("honest view states", () => {
  test("renders all evaluation states with text and a non-duplicating icon", () => {
    render(<>{evaluationStates.map((status) => <StatusBadge key={status} status={status} />)}</>);
    for (const status of ["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]) {
      const badge = screen.getByText(status);
      expect(badge).toBeVisible();
      expect(badge.querySelector("[aria-hidden='true']")).toBeInTheDocument();
    }
  });

  test("keeps unavailable manual source proof explicit without fabricating null claims", () => {
    render(<SourceProofPanel proof={sourceProof.data} />);
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(screen.getByText("MANUAL_FIXTURE")).toBeVisible();
    expect(screen.getByText(/provider proof was not captured/i)).toBeVisible();
    const details = screen.getByRole("group", { name: /source proof details/i });
    expect(details.tagName).toBe("DETAILS");
    expect(screen.queryByText(/provider_run_id/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/collector_name/i)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("null");
  });

  test("discloses and contains every verified source-proof field at narrow widths", () => {
    const normalized = opportunityListEnvelopeSchema.parse(readFixture("opportunities.manual.json")).data.items[0];
    const verified = sourceProofEnvelopeSchema.parse({
      request_id: "55555555-5555-4555-8555-555555555555",
      data: {
        status: "VERIFIED",
        data_mode: "RECORDED_BRIGHT_DATA_SNAPSHOT",
        reason_code: null,
        collector_name: "bright-data-collector",
        collector_config_version: "collector-v7",
        provider_run_id: "provider-run-2042",
        started_at: "2026-08-20T07:58:00Z",
        completed_at: "2026-08-20T08:00:00Z",
        raw_snapshot_sha256: "7777777777777777777777777777777777777777777777777777777777777777",
        raw_record: { raw_tender_id: "CPPP-2026-001", capture_sequence: 42 },
        normalized_record: normalized,
        terminal_state: "SUCCESS",
        failure_code: null,
      },
    });
    render(<SourceProofPanel proof={verified.data} />);
    fireEvent.click(screen.getByText("Source proof details"));
    expect(screen.getByText("collector-v7")).toBeVisible();
    expect(screen.getByText("2026-08-20T07:58:00Z")).toBeVisible();
    expect(screen.getByText("2026-08-20T08:00:00Z")).toBeVisible();
    expect(screen.getByText("SUCCESS")).toBeVisible();
    const rawRecord = screen.getByText(/"raw_tender_id": "CPPP-2026-001"/);
    expect(rawRecord).toBeVisible();
    expect(screen.getByText(/"title": "Cloud operations support services"/)).toBeVisible();
    const linkage = screen.getByText(/raw snapshot .* was normalized as opportunity cppp-cloud-001/i);
    expect(linkage).toBeVisible();
    const details = screen.getByRole("group", { name: /source proof details/i });
    const records = rawRecord.closest(".proof-records");
    if (records === null) throw new Error("Expected proof records container");
    expect(details).toHaveClass("proof-disclosure");
    expect(records).toHaveClass("proof-records");
    expect(rawRecord).toHaveClass("proof-record");
    expect(linkage).toHaveClass("proof-linkage");
  });

  test("shows a rejected bidder request as no effective recommendation change", () => {
    const copy = cloneFixture(amendment);
    const data = objectProperty(copy, "data");
    const authority = objectProperty(data, "authority_statement");
    authority.actor = "BIDDER";
    authority.disposition = "REJECTED";
    authority.effective_change = false;
    authority.replaces_document_id = null;
    data.authority_change_applied = false;
    data.amended_recommendation = "NO_BID";
    data.transition_reason = "The bidder request was rejected, so the base recommendation remains in force.";
    const parsed = amendmentImpactEnvelopeSchema.parse(copy);
    render(<AmendmentImpactView impact={parsed.data} />);
    expect(screen.getByText("BIDDER")).toBeVisible();
    expect(screen.getByText("REJECTED")).toBeVisible();
    expect(screen.getAllByText(/no effective change/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/remains in force/i)).toBeVisible();
  });

  test("renders empty, loading, not-found, and retryable unexpected failure states", () => {
    const retry = vi.fn();
    const { rerender } = render(<EmptyOpportunities />);
    expect(screen.getByText(/no opportunities are available/i)).toBeVisible();
    rerender(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading procurement evidence/i);
    rerender(<NotFound />);
    expect(screen.getByRole("heading", { name: /opportunity not found/i })).toBeVisible();
    rerender(<ErrorBoundary error={new Error("private detail")} retry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/unexpected application error/i);
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
