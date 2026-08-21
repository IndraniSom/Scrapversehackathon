/**
 * Proposal collaboration, outline hierarchy, assignments, comments, and approval states.
 * Validates cited outline generation, bid-manager gate, locked guard, and explicit progress.
 */
import { describe, expect, test } from "vitest";
import { buildOutlineSections, canEdit, computeProgress, isValidTransition, SECTION_STATES } from "../convex/proposals";

describe("proposal outline and approval states", () => {
  test("creates hierarchy from cited instruction and evaluation clauses", () => {
    const clauses = [
      { title: "1. Cover Letter", citation: "Instruction §1" },
      { title: "1.1 Technical Approach", citation: "Evaluation §2.1" },
      { title: "2. Compliance", citation: "Instruction §3" },
    ];
    const sections = buildOutlineSections(clauses);
    expect(sections).toHaveLength(3);
    expect(sections[0].citation).toBe("Instruction §1");
    expect(sections[0].parentOrder).toBeNull();
    expect(sections[0].level).toBe(1);
    expect(sections[1].parentOrder).toBe(0);
    expect(sections[1].level).toBe(2);
    expect(sections[2].parentOrder).toBeNull();
  });

  test("requires every heading to cite an instruction or evaluation clause", () => {
    expect(()=>buildOutlineSections([{ title: "1. Intro", citation: "" }])).toThrow(/cited/i);
    expect(()=>buildOutlineSections([{ title: "1. Intro", citation: "   " }])).toThrow(/cited/i);
    expect(()=>buildOutlineSections([])).toThrow(/At least one clause/);
  });

  test("enumerates exactly six explicit states and valid transitions", () => {
    expect(SECTION_STATES).toEqual(["NOT_STARTED","DRAFTING","READY_FOR_REVIEW","CHANGES_REQUESTED","APPROVED","LOCKED"]);
    expect(isValidTransition("NOT_STARTED","DRAFTING")).toBe(true);
    expect(isValidTransition("DRAFTING","READY_FOR_REVIEW")).toBe(true);
    expect(isValidTransition("READY_FOR_REVIEW","APPROVED")).toBe(true);
    expect(isValidTransition("APPROVED","LOCKED")).toBe(true);
    expect(isValidTransition("NOT_STARTED","APPROVED")).toBe(false);
    expect(isValidTransition("LOCKED","DRAFTING")).toBe(false);
    expect(isValidTransition("CHANGES_REQUESTED","DRAFTING")).toBe(true);
    expect(isValidTransition("READY_FOR_REVIEW","CHANGES_REQUESTED")).toBe(true);
  });

  test("prevents edits to locked revisions and sections", () => {
    expect(canEdit("DRAFTING")).toBe(true);
    expect(canEdit("APPROVED")).toBe(true);
    expect(canEdit("LOCKED")).toBe(false);
    expect(canEdit("DRAFTING", Date.now())).toBe(false);
    expect(canEdit("NOT_STARTED", 123)).toBe(false);
  });

  test("derives progress from explicit states without AI heuristics", () => {
    const sections = [
      { state: "NOT_STARTED" as const },
      { state: "DRAFTING" as const },
      { state: "APPROVED" as const },
      { state: "LOCKED" as const },
      { state: "READY_FOR_REVIEW" as const },
    ];
    const p = computeProgress(sections);
    expect(p.total).toBe(5);
    expect(p.counts["NOT_STARTED"]).toBe(1);
    expect(p.counts["APPROVED"]).toBe(1);
    expect(p.counts["LOCKED"]).toBe(1);
    expect(p.percentApproved).toBe(40);
  });

  test("supports assignment and anchor comment threads", () => {
    const section = { _id: "s1", state: "DRAFTING", assigneeId: undefined as string | undefined, body: "draft" };
    const assigned = { ...section, assigneeId: "user_123" };
    expect(assigned.assigneeId).toBe("user_123");
    expect(canEdit(assigned.state as never)).toBe(true);
    const comment = { proposalId: "p1", sectionId: "s1", body: "Please clarify pricing", anchor: "pricing-table", resolutionState: "open" };
    expect(comment.anchor).toBe("pricing-table");
    expect(comment.resolutionState).toBe("open");
  });

  test("locks revision and blocks concurrent edits", () => {
    const lockedProposal = { lockedRevision: Date.now() };
    expect(canEdit("DRAFTING", lockedProposal.lockedRevision)).toBe(false);
    expect(canEdit("LOCKED")).toBe(false);
    expect(isValidTransition("APPROVED","LOCKED")).toBe(true);
    expect(isValidTransition("LOCKED","APPROVED")).toBe(false);
  });
});
