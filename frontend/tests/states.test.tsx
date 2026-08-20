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
