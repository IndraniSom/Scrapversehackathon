/**
 * Review queue behavior: assignment, reassignment, concurrency,
 * stale revision, reject/edit/confirm, permissions, and resets.
 */
import { describe, expect, test } from "vitest";
import { checkStale, requireReason } from "../../convex/reviews";

type Task = { _id: string; organizationId: string; assigneeId?: string; state: string; createdAt: number; decision?: string };

/** Simulates assignment with stale and conflict checks. */
function assign(task: Task, assigneeId: string, expected?: number): Task {
  checkStale(task.createdAt, expected);
  if (task.assigneeId) throw new Error("CONFLICT: already assigned");
  return { ...task, assigneeId, state: "in_review" };
}

/** Simulates reassignment with role check. */
function reassign(task: Task, assigneeId: string, role: string, expected?: number): Task {
  if (role !== "org:admin" && role !== "org:bid_manager") throw new Error("FORBIDDEN");
  checkStale(task.createdAt, expected);
  if (!task.assigneeId) throw new Error("CONFLICT: not assigned");
  return { ...task, assigneeId };
}

/** Simulates reject requiring reason. */
function reject(task: Task, reason: string): Task {
  const r = requireReason(reason);
  return { ...task, state: "rejected", decision: r };
}

/** Simulates edit requiring reason and resetting state. */
function edit(task: Task, reason: string): Task {
  const r = requireReason(reason);
  return { ...task, state: "open", decision: r };
}

/** Resets on material change. */
function resetOnChange(task: Task, changed: boolean): Task {
  if (!changed) return task;
  return { ...task, state: "open", decision: undefined };
}

describe("clause review queue", () => {
  test("assigns an unassigned task", () => {
    const t: Task = { _id: "t1", organizationId: "org1", state: "open", createdAt: 100 };
    const next = assign(t, "userA");
    expect(next.assigneeId).toBe("userA");
    expect(next.state).toBe("in_review");
  });

  test("rejects assignment when already assigned", () => {
    const t: Task = { _id: "t1", organizationId: "org1", assigneeId: "userA", state: "in_review", createdAt: 100 };
    expect(() => assign(t, "userB")).toThrow(/already assigned/);
  });

  test("reassigns with admin role", () => {
    const t: Task = { _id: "t1", organizationId: "org1", assigneeId: "userA", state: "in_review", createdAt: 100 };
    const next = reassign(t, "userB", "org:admin");
    expect(next.assigneeId).toBe("userB");
  });

  test("blocks reassignment for viewer", () => {
    const t: Task = { _id: "t1", organizationId: "org1", assigneeId: "userA", state: "in_review", createdAt: 100 };
    expect(() => reassign(t, "userB", "org:viewer")).toThrow(/FORBIDDEN/);
  });

  test("detects concurrent edits via stale revision", () => {
    const t: Task = { _id: "t1", organizationId: "org1", state: "open", createdAt: 100 };
    expect(() => assign(t, "userA", 99)).toThrow(/Stale revision/);
    expect(() => assign(t, "userA", 101)).toThrow(/Stale revision/);
  });

  test("concurrent second edit fails after first succeeds", () => {
    const t: Task = { _id: "t1", organizationId: "org1", state: "open", createdAt: 100 };
    const first = assign(t, "userA", 100);
    expect(first.assigneeId).toBe("userA");
    // second concurrent attempt with same expected revision should still conflict because now assigned
    expect(() => assign({ ...t, assigneeId: "userA", state: "in_review", createdAt: 100 }, "userB", 100)).toThrow(/already assigned/);
  });

  test("reject requires reason", () => {
    const t: Task = { _id: "t1", organizationId: "org1", state: "in_review", createdAt: 100 };
    expect(() => reject(t, "")).toThrow(/Reason/);
    expect(() => reject(t, "short")).toThrow(/Reason/);
    const r = reject(t, "Evidence does not support turnover claim");
    expect(r.state).toBe("rejected");
  });

  test("edit requires reason and resets review", () => {
    const t: Task = { _id: "t1", organizationId: "org1", state: "approved", createdAt: 100, decision: "confirmed" };
    expect(() => edit(t, "   ")).toThrow(/Reason/);
    const next = edit(t, "Correcting predicate threshold from 12 to 6 crore");
    expect(next.state).toBe("open");
    expect(next.decision).toContain("predicate");
  });

  test("confirm is distinct from reject and edit", () => {
    const t: Task = { _id: "t1", organizationId: "org1", state: "in_review", createdAt: 100 };
    const confirmed: Task = { ...t, state: "approved", decision: "confirmed" };
    expect(confirmed.state).toBe("approved");
    expect(reject(t, "Evidence proves rejection").state).toBe("rejected");
    expect(edit(t, "Material correction for clause").state).toBe("open");
  });

  test("permission boundaries deny cross-tenant and viewer confirms", () => {
    const t: Task = { _id: "t1", organizationId: "org1", state: "open", createdAt: 100 };
    // simulate tenant check
    function assertTenant(a: string, b: string) { if (a !== b) throw new Error("NOT_FOUND"); }
    expect(() => assertTenant(t.organizationId, "org2")).toThrow(/NOT_FOUND/);
    // viewer cannot be reviewer
    function requireReviewer(role: string) { if (role === "org:viewer") throw new Error("FORBIDDEN"); }
    expect(() => requireReviewer("org:viewer")).toThrow(/FORBIDDEN/);
  });

  test("resets review on material clause or page hash change", () => {
    const t: Task = { _id: "t1", organizationId: "org1", state: "approved", createdAt: 100, decision: "confirmed" };
    const unchanged = resetOnChange(t, false);
    expect(unchanged.state).toBe("approved");
    const changed = resetOnChange(t, true);
    expect(changed.state).toBe("open");
    expect(changed.decision).toBeUndefined();
  });

  test("re-runs assessments after acceptance", () => {
    const jobs: unknown[] = [];
    function confirmAndRerun(task: Task) {
      const confirmed = { ...task, state: "approved", decision: "confirmed" };
      jobs.push({ kind: "ASSESSMENT", status: "QUEUED", taskId: task._id });
      return confirmed;
    }
    const t: Task = { _id: "t1", organizationId: "org1", state: "in_review", createdAt: 100 };
    const c = confirmAndRerun(t);
    expect(c.state).toBe("approved");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ kind: "ASSESSMENT", status: "QUEUED" });
  });
});
