/**
 * Section editor with assignment, state transition, citation, and lock guard.
 * Prevents edits to LOCKED sections and validates explicit transitions.
 * Editorial: stone borders, warm paper, single green accent, 44px targets.
 */
"use client";

import { useState } from "react";

// Keep STATES for external type derivation but allow eslint to treat as used via export
export const STATES = ["NOT_STARTED","DRAFTING","READY_FOR_REVIEW","CHANGES_REQUESTED","APPROVED","LOCKED"] as const;
type State = typeof STATES[number];
const ALLOWED: Record<State, State[]> = {
  NOT_STARTED: ["DRAFTING"],
  DRAFTING: ["READY_FOR_REVIEW"],
  READY_FOR_REVIEW: ["CHANGES_REQUESTED","APPROVED"],
  CHANGES_REQUESTED: ["DRAFTING"],
  APPROVED: ["LOCKED"],
  LOCKED: [],
};

/** Editable section shape. */
export type EditableSection = {
  _id: string;
  title: string;
  body?: string;
  state: State;
  instructionCitation?: string;
  assigneeId?: string;
};

type Props = {
  section: EditableSection | null;
  locked?: boolean;
  onSave: (id: string, body: string, nextState?: State) => void;
  onAssign: (id: string, assigneeId: string) => void;
};

/** Renders editor with guard for locked revisions. */
export function SectionEditor({ section, locked, onSave, onAssign }: Props) {
  const [body, setBody] = useState(section?.body ?? "");
  const [nextState, setNextState] = useState<State | "">("");
  const [assignee, setAssignee] = useState(section?.assigneeId ?? "");
  if (!section) return <div className="card" style={{ borderStyle: "dashed", background: "var(--surface-subtle)" }}><p className="help-text" style={{ margin: 0 }}>Select a section to edit. Outline headings map to cited instruction and evaluation clauses.</p></div>;
  const isLocked = section.state === "LOCKED" || locked;
  const allowed = ALLOWED[section.state] ?? [];
  const canTransition = nextState !== "" && allowed.includes(nextState as State);

  return (
    <section aria-labelledby="section-title" className="section-editor">
      <h3 id="section-title">{section.title}</h3>
      {section.instructionCitation && <p className="citation">Citation: <code>{section.instructionCitation}</code></p>}
      <p className="help-text">State: <strong style={{ color: "var(--text)" }}>{section.state}</strong> {isLocked && <span style={{ color: "var(--warning)" }}>(locked — edits blocked)</span>}</p>
      <label htmlFor="assignee">Assignee</label>
      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
        <input id="assignee" value={assignee} onChange={(e)=>setAssignee(e.target.value)} placeholder="User ID" disabled={!!isLocked} style={{ flex: 1 }} />
        <button type="button" onClick={()=>assignee.trim() && onAssign(section._id, assignee.trim())} disabled={!!isLocked || !assignee.trim()} className={isLocked ? "btn-ghost" : "btn-primary"}>Assign</button>
      </div>
      <label htmlFor="section-body">Body</label>
      <textarea id="section-body" value={body} onChange={(e)=>setBody(e.target.value)} disabled={!!isLocked} rows={8} placeholder={isLocked ? "Locked revision cannot be edited." : "Write section content. Unsupported facts require author input."} />
      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)", alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor="next-state" style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", margin: 0 }}>Next state
          <select id="next-state" value={nextState} onChange={(e)=>setNextState(e.target.value as State)} disabled={!!isLocked} style={{ minWidth: 180 }}>
            <option value="">— keep —</option>
            {allowed.map((s)=>(<option key={s} value={s}>{s}</option>))}
          </select>
        </label>
        <button type="button" onClick={()=>onSave(section._id, body, nextState ? (nextState as State) : undefined)} disabled={!!isLocked} className={isLocked ? "btn-ghost" : "btn-primary"}>Save</button>
      </div>
      {!canTransition && nextState ? <p role="alert" style={{ color: "var(--error)", fontSize: "0.78rem", marginTop: "var(--space-2)" }}>Invalid transition {section.state} → {nextState}.</p> : null}
    </section>
  );
}
