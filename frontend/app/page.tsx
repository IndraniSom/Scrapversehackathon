import { FailureState } from "../components/failure-state";
import { OpportunityTable } from "../components/opportunity-table";
import { SourceProofPanel } from "../components/source-proof-panel";
import { ApiFailure, getOpportunities, getSourceProof } from "../lib/api";
import type { SourceProofEnvelope } from "../schemas/envelopes";
import type { OpportunityListEnvelope } from "../schemas/opportunities";

export const dynamic = "force-dynamic";

type RegisterResult = { opportunities: OpportunityListEnvelope; sourceProof: SourceProofEnvelope } | ApiFailure;

/** Loads both validated register resources while preserving typed expected failures. */
async function loadRegister(): Promise<RegisterResult> {
  try {
    const [opportunities, sourceProof] = await Promise.all([getOpportunities(), getSourceProof()]);
    return { opportunities, sourceProof };
  } catch (error) {
    if (error instanceof ApiFailure) return error;
    throw error;
  }
}

/** Renders the runtime-validated opportunity register and source-proof state. */
export default async function HomePage() {
  const result = await loadRegister();
  if (result instanceof ApiFailure) return <FailureState kind={result.kind} />;
  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro register-intro">
        <p className="source-line">Validated decision inputs</p>
        <h1>Opportunity register</h1>
        <p>Compare public tenders while preserving the source mode, collection proof, and immutable snapshot hash behind every row.</p>
      </header>
      <SourceProofPanel proof={result.sourceProof.data} />
      <OpportunityTable envelope={result.opportunities} />
    </main>
  );
}
