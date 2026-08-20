/**
 * Hierarchical outline navigation for proposal sections.
 * Renders level-indented tree, active state, assignment, and citation.
 * Uses warm paper, stone borders, single green accent, 4/8 rhythm.
 */
"use client";

export type NavSection = {
  _id: string;
  title: string;
  instructionCitation?: string;
  state: string;
  order: number;
  parentId?: string;
  assigneeId?: string;
};

/** Props for outline navigation. */
type Props = {
  sections: NavSection[];
  activeId?: string;
  onSelect: (id: string) => void;
};

/** Renders nested outline using parentId hierarchy with explicit order. */
export function OutlineNavigation({ sections, activeId, onSelect }: Props) {
  const childrenByParent = new Map<string | null, NavSection[]>();
  for (const s of sections) {
    const key = s.parentId ?? null;
    const list = childrenByParent.get(key) ?? [];
    list.push(s); childrenByParent.set(key, list);
  }
  for (const list of childrenByParent.values()) list.sort((a,b)=>a.order-b.order);

  /** Recursively renders a level with indentation and state. */
  function renderLevel(parentId: string | null, depth: number): React.ReactNode {
    const items = childrenByParent.get(parentId) ?? [];
    if (items.length===0) return null;
    return (
      <ul style={{ paddingLeft: depth ? "var(--space-4)" : 0, listStyle: "none", margin: 0, display: "grid", gap: "var(--space-1)" }} role={depth===0?"tree":undefined}>
        {items.map((s)=>(
          <li key={s._id}>
            <button
              role={depth===0?"treeitem":undefined}
              aria-current={activeId===s._id?"true":undefined}
              aria-selected={activeId===s._id}
              onClick={()=>onSelect(s._id)}
              className={activeId===s._id?"outline-item active":"outline-item"}
            >
              <span>{s.order+1}. {s.title}</span>
              <span>{s.state}{s.assigneeId ? ` · ${s.assigneeId}` : ""}{s.instructionCitation ? ` · ${s.instructionCitation.slice(0,60)}` : ""}</span>
            </button>
            {renderLevel(s._id, depth+1)}
          </li>
        ))}
      </ul>
    );
  }
  if (sections.length===0) return <p className="help-text">No outline. Generate from cited instruction and evaluation clauses, then obtain bid-manager approval.</p>;
  return <nav aria-label="Proposal outline">{renderLevel(null, 0)}</nav>;
}
