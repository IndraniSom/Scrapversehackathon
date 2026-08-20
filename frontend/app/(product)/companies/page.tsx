/** Company register with completeness counts and active selector. */
"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

const ORG_ID = "org_demo";

/** Persists active company per organization in localStorage. */
function useActiveCompany(orgId: string): [string | null, (id: string) => void] {
  const key = `activeCompany:${orgId}`;
  const [active, setActive] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(key);
  });
  function select(id: string) {
    localStorage.setItem(key, id);
    setActive(id);
  }
  return [active, select];
}

/**
 * Lists companies for the active organization.
 * Shows missing-evidence counts without a readiness score.
 */
export default function CompaniesPage() {
  const companies = useQuery(api.companies.listCompanies, { organizationId: ORG_ID });
  const [active, setActive] = useActiveCompany(ORG_ID);

  if (companies === undefined) return <main className="page-shell" id="main-content"><p role="status">Loading companies…</p></main>;
  if (companies.length === 0)
    return (
      <main className="page-shell" id="main-content">
        <h1>Companies</h1>
        <p>No companies yet. Create one to evaluate tenders.</p>
        <Link href="/companies/new" className="primary-action">Create company</Link>
      </main>
    );

  return (
    <main className="page-shell" id="main-content">
      <div className="section-heading-row">
        <h1>Companies</h1>
        <Link href="/companies/new" className="primary-action">Create company</Link>
      </div>
      <table>
        <thead><tr><th>Legal name</th><th>Missing evidence</th><th>Total records</th><th>Active</th></tr></thead>
        <tbody>
          {companies.map((c) => (
            <tr key={c._id}>
              <td><Link href={`/companies/${c._id}`} className="text-link">{c.legalName}</Link><span className="subline">{c.registrationId ?? "No registration ID"}</span></td>
              <td>{c.completeness.totalMissing} missing</td>
              <td>{c.completeness.total}</td>
              <td><button onClick={() => setActive(c._id)} aria-pressed={active === c._id}>{active === c._id ? "Active" : "Set active"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
