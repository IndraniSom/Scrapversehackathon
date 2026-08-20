/**
 * Grounded drafting assistant with citation status and author-input gate.
 */
"use client";

import { useMemo } from "react";

export type DraftBlockDisplay = {
  id: string;
  text: string;
  sourceIds: string[];
  isFactual: boolean;
};

export type DraftVerification = {
  block_id: string;
  status: string;
  reason?: string | null;
  verified_source_ids: string[];
};

type DraftAssistantProps = {
  blocks: DraftBlockDisplay[];
  verifications: DraftVerification[];
  modelHash?: string;
  promptHash?: string;
  tokensUsed?: number;
  onAccept?: (blockId: string) => void;
};

const STATUS_LABEL: Record<string, string> = {
  GROUNDED: "Grounded",
  AUTHOR_INPUT_REQUIRED: "Author input required",
};

/**
 * Returns badge class for a verification status.
 */
function statusClass(status: string): string {
  if (status === "GROUNDED") return "status-pass";
  return "status-fail";
}

/**
 * Renders grounded draft blocks with citation verification and input gate.
 * Never invents content for AUTHOR_INPUT_REQUIRED blocks.
 */
export function DraftAssistant({ blocks, verifications, modelHash, promptHash, tokensUsed, onAccept }: DraftAssistantProps) {
  const byId = useMemo(() => new Map(verifications.map((v) => [v.block_id, v])), [verifications]);
  const needsInput = useMemo(() => verifications.some((v) => v.status === "AUTHOR_INPUT_REQUIRED"), [verifications]);

  return (
    <section aria-labelledby="draft-assistant-title">
      <div className="section-heading-row">
        <div>
          <h2 id="draft-assistant-title">Draft assistant</h2>
          <p>Every factual paragraph cites approved content or tender evidence. Ungrounded text is marked for author input.</p>
        </div>
        {(modelHash || promptHash) && (
          <span className="meta-hashes" aria-label="Model and prompt hashes">
            {modelHash && <code>model:{modelHash.slice(0, 8)}</code>} {promptHash && <code>prompt:{promptHash.slice(0, 8)}</code>}
          </span>
        )}
      </div>
      {tokensUsed !== undefined && <p className="token-usage" aria-live="polite">Tokens used: {tokensUsed}</p>}
      {needsInput && <p role="alert" className="approval-blocked">Some blocks need author input. Approval is blocked until grounded or revised.</p>}
      <div className="draft-blocks">
        {blocks.length === 0 ? (
          <p>No draft blocks. Generate a grounded outline first.</p>
        ) : (
          blocks.map((block) => {
            const v = byId.get(block.id);
            const status = v?.status ?? "UNKNOWN";
            const reason = v?.reason ?? null;
            return (
              <article key={block.id} className={`draft-block ${statusClass(status)}`} aria-label={`Draft block ${block.id}`}>
                <header className="draft-block-header">
                  <code>{block.id}</code>
                  <span className={`status-badge ${statusClass(status)}`}>{STATUS_LABEL[status] ?? status}</span>
                  {reason && <span className="reason" title={reason} aria-label={`Reason ${reason}`}>{reason}</span>}
                </header>
                <p className="draft-text">{block.text}</p>
                {block.isFactual ? (
                  <p className="draft-citations">
                    Sources: {block.sourceIds.length ? block.sourceIds.map((s) => <code key={s}>{s}</code>) : <em>Missing citation</em>}
                  </p>
                ) : (
                  <p className="draft-note"><em>Non-factual text — citation not required.</em></p>
                )}
                {v?.verified_source_ids.length ? <p className="verified">Verified: {v.verified_source_ids.join(", ")}</p> : null}
                {status === "AUTHOR_INPUT_REQUIRED" && <p role="note" className="author-input">AUTHOR_INPUT_REQUIRED — revise with accepted evidence or original analysis.</p>}
                {status === "GROUNDED" && onAccept && (
                  <button type="button" className="primary-action" onClick={() => onAccept(block.id)} aria-label={`Accept block ${block.id}`}>
                    Accept block
                  </button>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
