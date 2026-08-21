/** Company detail with evidence editors and completeness summary. */
"use client";
import { use } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { CompanyForm } from "../../../../components/companies/company-form";
import { EvidenceEditor } from "../../../../components/companies/evidence-editor";

/**
 * Shows one company, revision-aware edit form, completeness counts, and evidence editors.
 */
export default function CompanyDetailPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = use(params);
  const data = useQuery(api.companies.getCompany, { companyId: companyId as Id<"companies"> });
  const update = useMutation(api.companies.updateCompany);
  const saveTurnover = useMutation(api.companies.saveTurnover);
  const saveCert = useMutation(api.companies.saveCertification);
  const saveProject = useMutation(api.companies.saveProject);
  const saveExempt = useMutation(api.companies.saveExemption);

  if (data === undefined) return <main className="page-shell" id="main-content"><p role="status">Loading company…</p></main>;
  if (!data) return <main className="page-shell" id="main-content"><p role="alert">Company not found.</p></main>;

  const { company, completeness } = data;

  return (
    <main className="page-shell" id="main-content">
      <h1>{company.legalName}</h1>
      <p className="subline">Revision {company.revision} · {company.registrationId ?? "No registration ID"}</p>
      <section aria-label="Completeness summary">
        <h2>Completeness</h2>
        <p>{completeness.totalMissing} records missing evidence of {data.turnover.length + data.certifications.length + data.projects.length + data.exemptions.length}.</p>
        <ul>
          <li>Turnover missing: {completeness.turnoverMissing}</li>
          <li>Certifications missing: {completeness.certificationMissing}</li>
          <li>Projects missing: {completeness.projectMissing}</li>
          <li>Exemptions missing: {completeness.exemptionMissing}</li>
        </ul>
      </section>
      <section aria-label="Edit company">
        <h2>Edit profile</h2>
        <CompanyForm initial={{ legalName: company.legalName, registrationId: company.registrationId, revision: company.revision }} submitLabel="Save changes" onSubmit={async (v) => { await update({ companyId: company._id, revision: company.revision, legalName: v.legalName, registrationId: v.registrationId }); }} />
      </section>
      <EvidenceEditor onAddTurnover={async (v) => { await saveTurnover({ companyId: company._id, ...v }); }} onAddCertification={async (v) => { await saveCert({ companyId: company._id, ...v }); }} onAddProject={async (v) => { await saveProject({ companyId: company._id, ...v }); }} onAddExemption={async (v) => { await saveExempt({ companyId: company._id, ...v }); }} />
    </main>
  );
}
