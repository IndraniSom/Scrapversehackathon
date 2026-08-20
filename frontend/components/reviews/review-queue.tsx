/**
 * Review queue with filters for assignee, priority, tender, state,
 * extraction reason, and due date. Selects a task for evidence review.
 */
"use client";

import { useMemo, useState } from "react";

type ReviewTask = {
  _id: string;
  targetId: string;
  targetType: string;
  assigneeId?: string;
  priority: "low" | "medium" | "high";
  state: "open" | "in_review" | "approved" | "rejected";
  dueAt?: number;
  decision?: string;
};

type Props = {
  tasks: ReviewTask[];
  onSelect: (id: string) => void;
  selectedId?: string;
};

/**
 * Renders a filterable queue of clause review tasks.
 */
export function ReviewQueue({ tasks, onSelect, selectedId }: Props) {
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("");
  const [state, setState] = useState("");
  const [dueBefore, setDueBefore] = useState("");

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (assignee && t.assigneeId !== assignee) return false;
      if (priority && t.priority !== priority) return false;
      if (state && t.state !== state) return false;
      if (dueBefore && t.dueAt && t.dueAt > Number(dueBefore)) return false;
      return true;
    });
  }, [tasks, assignee, priority, state, dueBefore]);

  return (
    <section aria-labelledby="review-queue-title">
      <h2 id="review-queue-title">Review queue</h2>
      <form className="filter-rail" aria-label="Review filters" onSubmit={(e) => e.preventDefault()}>
        <label>
          Assignee
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="assignee id" />
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">All</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          State
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="in_review">In review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label>
          Due before
          <input type="date" value={dueBefore} onChange={(e) => setDueBefore(e.target.value ? String(new Date(e.target.value).getTime()) : "")} />
        </label>
      </form>

      {filtered.length === 0 ? (
        <p>No review tasks match filters.</p>
      ) : (
        <table aria-label="Review queue">
          <thead>
            <tr>
              <th scope="col">Tender</th>
              <th scope="col">Priority</th>
              <th scope="col">State</th>
              <th scope="col">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t._id} className={selectedId === t._id ? "selected-row" : ""}>
                <td>
                  <button type="button" className="text-link" onClick={() => onSelect(t._id)}>
                    {t.targetId}
                  </button>
                  <span className="subline">{t.targetType}</span>
                </td>
                <td>{t.priority}</td>
                <td>{t.state}</td>
                <td>{t.assigneeId ?? "Unassigned"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
