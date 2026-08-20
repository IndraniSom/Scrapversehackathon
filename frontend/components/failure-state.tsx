import Link from "next/link";

import type { ApiFailureKind } from "../lib/api";

const failureCopy = {
  transport: {
    title: "Backend unavailable",
    detail: "BidRadar could not reach the evidence service. No fixture or cached result has been substituted.",
  },
  schema: {
    title: "Response contract mismatch",
    detail: "The backend response could not be validated, so BidRadar has withheld the affected decision data.",
  },
  "not-found": {
    title: "Opportunity not found",
    detail: "The requested opportunity is not available in the validated dataset.",
  },
} satisfies Record<ApiFailureKind, { title: string; detail: string }>;

/** Renders an explicit, above-fold expected failure without exposing internals. */
export function FailureState({ kind }: { kind: ApiFailureKind }) {
  const copy = failureCopy[kind];
  return (
    <main className="page-shell state-page" id="main-content">
      <section className="state-banner error-banner" role="alert">
        <StatusMark />
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.detail}</p>
          <Link className="text-link" href="/">Return to opportunity register</Link>
        </div>
      </section>
    </main>
  );
}

/** Supplies a decorative warning mark while status remains textual. */
function StatusMark() {
  return <span className="state-mark" aria-hidden="true">!</span>;
}
