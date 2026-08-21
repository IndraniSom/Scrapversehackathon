/** Persistent tender Q&A, brief, and translation workspace. */
"use client";

import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ExecutiveBriefView } from "./executive-brief";
import { TenderQa } from "./tender-qa";
import { WorkingTranslation } from "./working-translation";

const citation = z.object({ chunk_id: z.string(), document_id: z.string(), page_number: z.number(), document_hash: z.string() });
const answerSchema = z.object({ question: z.string(), paragraphs: z.array(z.object({ text: z.string(), citations: z.array(citation) })), abstained: z.boolean() });
const briefField = z.object({ value: z.string(), citations: z.array(citation), is_abstained: z.boolean() });
const briefSchema = z.object({ scope: briefField, authority: briefField, dates: briefField, fees: briefField, hard_requirements: briefField, deliverables: briefField, submission_instructions: briefField, amendments: briefField, uncertainties: briefField, review_state: z.string() });
const translationSchema = z.object({ language: z.string(), disclaimer: z.string(), paragraphs: z.array(z.object({ paragraph_id: z.string(), original_text: z.string(), translated_text: z.string(), document_id: z.string(), page_number: z.number(), document_hash: z.string(), anchor: z.string() })) });

/** Parses stored JSON through a closed runtime schema. */
function parse<T>(value: string | undefined, schema: z.ZodType<T>): T | null {
  if (!value) return null;
  try {
    const result = schema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Renders live persistent intelligence results and request controls. */
export function TenderIntelligenceClient({ opportunityId }: { opportunityId: Id<"opportunities"> }) {
  const rows = useQuery(api.tenderIntelligence.list, { opportunityId });
  const request = useAction(api.tenderIntelligence.request);
  const [pending, setPending] = useState<"qa" | "brief" | "translation" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = (kind: "qa" | "brief" | "translation") => rows?.find((row) => row.kind === kind && row.status === "succeeded");
  const answer = parse(latest("qa")?.resultJson, answerSchema);
  const brief = parse(latest("brief")?.resultJson, briefSchema);
  const translation = parse(latest("translation")?.resultJson, translationSchema);

  /** Runs one signed worker request and surfaces closed failure state. */
  async function run(kind: "qa" | "brief" | "translation", question?: string) {
    setPending(kind);
    setError(null);
    try {
      const result = await request({ opportunityId, kind, question, language: kind === "translation" ? "hi" : undefined });
      if (result.status !== "succeeded") setError(result.status === "needs_review" ? "Translation requires human review." : "Tender intelligence failed.");
    } catch {
      setError("Tender intelligence failed.");
    } finally {
      setPending(null);
    }
  }

  if (rows === undefined) return <p role="status">Loading tender intelligence…</p>;
  return (
    <>
      <TenderQa answer={answer} onAsk={(question) => void run("qa", question)} isLoading={pending === "qa"} error={error} />
      <section className="route-actions" aria-label="Tender intelligence actions">
        <button type="button" onClick={() => void run("brief")} disabled={pending !== null}>Generate cited brief</button>
        <button type="button" onClick={() => void run("translation")} disabled={pending !== null}>Request Hindi translation</button>
      </section>
      {brief ? <ExecutiveBriefView brief={brief} /> : <p className="empty-state">No cited brief generated.</p>}
      {translation ? <WorkingTranslation language={translation.language} paragraphs={translation.paragraphs} disclaimer={translation.disclaimer} /> : <p className="empty-state">No accepted working translation.</p>}
      {rows.some((row) => row.status === "failed") ? <p role="alert">One or more intelligence jobs failed. Review job details and retry.</p> : null}
    </>
  );
}
