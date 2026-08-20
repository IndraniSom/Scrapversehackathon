/**
 * Proposal workspace with outline navigation, section editor, comments,
 * assignment, explicit approval flow, and progress without AI heuristics.
 * Editorial polish: warm paper, stone borders, single green accent, 4/8 rhythm.
 */
"use client";

import { useMemo, useState } from "react";
import { OutlineNavigation, type NavSection } from "./outline-navigation";
import { SectionEditor, type EditableSection } from "./section-editor";

type Section = NavSection & { body?: string; state: string };
type Comment = { _id: string; sectionId?: string; authorId: string; body: string; resolutionState: string; anchor?: string; createdAt: number };
type Proposal = { _id: string; lockedRevision?: number };

type Props = {
  proposal: Proposal;
  sections: Section[];
  comments: Comment[];
  onSelect?: (id: string) => void;
  onAssign: (id: string, assigneeId: string) => void;
  onSave: (id: string, body: string, nextState?: string) => void;
  onAddComment: (sectionId: string | undefined, body: string, anchor?: string) => void;
  onGenerateOutline?: (clauses: { title: string; citation: string }[]) => void;
  onLock?: () => void;
  role?: string;
};

/** Computes explicit progress from section states. */
function progressFrom(sections: Section[]): { total: number; approved: number; percent: number; counts: Record<string,number> } {
  const counts: Record<string,number> = {}; for (const s of sections) counts[s.state]=(counts[s.state]??0)+1;
  const total=sections.length; const approved=(counts["APPROVED"]??0)+(counts["LOCKED"]??0);
  return { total, approved, percent: total? Math.round((approved/total)*100):0, counts };
}

/** Main workspace: outline, editor, evidence rail, and gated approvals. */
export function ProposalWorkspace({ proposal, sections, comments, onAssign, onSave, onAddComment, onGenerateOutline, onLock, role }: Props) {
  const [activeId, setActiveId] = useState<string | undefined>(sections[0]?._id);
  const [commentBody, setCommentBody] = useState(""); const [anchor, setAnchor] = useState("");
  const active = useMemo(()=>sections.find((s)=>s._id===activeId) ?? null, [sections, activeId]);
  const locked = proposal.lockedRevision !== undefined;
  const progress = useMemo(()=>progressFrom(sections), [sections]);
  const sectionComments = useMemo(()=>comments.filter((c)=>!activeId || c.sectionId===activeId || !c.sectionId), [comments, activeId]);
  const canGenerate = role === "org:bid_manager" || role === "org:admin";

  return (
    <div className="proposal-workspace-layout">
      <div className="workspace-outline">
        <h2>Outline</h2>
        <p className="workspace-progress">Progress: {progress.approved}/{progress.total} approved ({progress.percent}%) — derived from explicit states, not AI.</p>
        <OutlineNavigation sections={sections} activeId={activeId} onSelect={setActiveId} />
        {onGenerateOutline && (
          <button
            type="button"
            onClick={()=>onGenerateOutline([{ title: "1. Cover Letter", citation: "Instruction §1" }, { title: "1.1 Technical Approach", citation: "Evaluation §2.1" }])}
            disabled={!canGenerate}
            title={canGenerate?"Generate cited outline (requires bid-manager approval)":"Bid-manager approval required"}
            className={canGenerate ? "btn-primary" : "btn-ghost"}
            style={{ marginTop: "var(--space-4)", width: "100%" }}
          >
            Generate outline from clauses
          </button>
        )}
        {onLock && (
          <button
            type="button"
            onClick={onLock}
            disabled={locked || !canGenerate}
            className="btn-ghost"
            style={{ marginTop: "var(--space-2)", width: "100%" }}
          >
            {locked?"Locked — edits blocked":"Lock revision"}
          </button>
        )}
      </div>
      <div className="workspace-main" style={{ display: "grid", gap: "var(--space-4)" }}>
        <SectionEditor section={active as EditableSection | null} locked={locked} onSave={(id,b,ns)=>onSave(id,b,ns)} onAssign={onAssign} />
        <section aria-label="Comments" className="card">
          <h3>Comments {active?.title ? `· ${active.title}` : ""}</h3>
          <p className="help-text">Anchor threads to section excerpts; resolution state is explicit.</p>
          <div className="comment-thread">
            <label htmlFor="comment-anchor" className="sr-only">Anchor (optional)</label>
            <input id="comment-anchor" value={anchor} onChange={(e)=>setAnchor(e.target.value)} placeholder="Anchor (optional) — e.g., p2: eligibility clause" />
            <div className="comment-input-row">
              <label htmlFor="comment-body" className="sr-only">Comment body</label>
              <input id="comment-body" value={commentBody} onChange={(e)=>setCommentBody(e.target.value)} placeholder="Add comment with anchor" />
              <button
                type="button"
                className="btn-primary"
                onClick={()=>{ if (commentBody.trim()) { onAddComment(active?._id, commentBody.trim(), anchor.trim()||undefined); setCommentBody(""); setAnchor(""); } }}
              >
                Post
              </button>
            </div>
            <ul className="comment-list">
              {sectionComments.map((c)=>(
                <li key={c._id}>
                  <span className="comment-meta">{c.authorId} · {c.resolutionState}{c.anchor?` · anchor:${c.anchor}`:""}</span>
                  <p style={{ margin: "var(--space-1) 0 0", fontSize: "0.92rem" }}>{c.body}</p>
                </li>
              ))}
              {sectionComments.length===0 && <li className="help-text" style={{ border: "1px dashed var(--border)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", background: "var(--surface-subtle)" }}>No comments. Use anchors to tie threads to section excerpts.</li>}
            </ul>
          </div>
        </section>
      </div>
      <div className="workspace-rail">
        <h3>Evidence & approvals</h3>
        <ul style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "var(--muted)", paddingLeft: "1rem", margin: 0 }}>{Object.entries(progress.counts).map(([k,v])=>(<li key={k}>{k}: {v}</li>))}</ul>
        <p className="help-text" style={{ marginTop: "var(--space-3)" }}>Approval requires bid-manager role. Every heading cites an instruction or evaluation clause. Locked revisions cannot be edited.</p>
      </div>
    </div>
  );
}
