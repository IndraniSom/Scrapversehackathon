/** Company profile form with live validation and revision handling. */
"use client";
import { useState } from "react";

export type CompanyFormValues = {
  legalName: string;
  registrationId?: string;
  organizationId: string;
  revision?: number;
};

type Props = {
  initial?: CompanyFormValues;
  organizationId: string;
  onSubmit: (values: CompanyFormValues) => Promise<void>;
  submitLabel: string;
};

const REG_HINT = "Registration ID must be unique within the organization.";
const NAME_HINT = "Legal name is required and cannot be blank.";

/** Validates legalName is non-blank after trim. */
function validateName(name: string): string | null {
  return name.trim() ? null : NAME_HINT;
}

/**
 * Renders company create/edit form with inline validation guidance.
 * Submits trimmed values and surfaces blank-name errors without navigation.
 */
export function CompanyForm({ initial, organizationId, onSubmit, submitLabel }: Props) {
  const [legalName, setLegalName] = useState(initial?.legalName ?? "");
  const [registrationId, setRegistrationId] = useState(initial?.registrationId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const nameError = validateName(legalName);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = validateName(legalName);
    if (msg) {
      setError(msg);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        legalName: legalName.trim(),
        registrationId: registrationId.trim() || undefined,
        organizationId,
        revision: initial?.revision,
      });
    } catch (err) {
      const m = err instanceof Error ? err.message : "Save failed.";
      setError(m);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="company-form" aria-label="Company profile form" noValidate>
      <div className="field">
        <label htmlFor="legalName">Legal name</label>
        <input id="legalName" value={legalName} onChange={(e) => setLegalName(e.target.value)} aria-invalid={Boolean(nameError)} aria-describedby="legalName-hint" required minLength={1} />
        <p id="legalName-hint" className="hint">{nameError ?? "Enter the registered legal entity name."}</p>
      </div>
      <div className="field">
        <label htmlFor="registrationId">Registration ID (optional)</label>
        <input id="registrationId" value={registrationId} onChange={(e) => setRegistrationId(e.target.value)} aria-describedby="reg-hint" placeholder="CIN-U72900OD2026PTC000001" />
        <p id="reg-hint" className="hint">{REG_HINT}</p>
      </div>
      {error ? <p role="alert" className="field-error">{error}</p> : null}
      <button type="submit" className="primary-action" disabled={pending || Boolean(nameError)}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
