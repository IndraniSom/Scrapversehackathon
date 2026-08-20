/** Create-company page with form and redirect. */
"use client";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { CompanyForm, type CompanyFormValues } from "../../../../components/companies/company-form";

const ORG_ID = "org_demo";

/**
 * Renders company creation form.
 * Calls createCompany mutation with tenant isolation and navigates on success.
 */
export default function NewCompanyPage() {
  const router = useRouter();
  const create = useMutation(api.companies.createCompany);

  async function handleSubmit(values: CompanyFormValues) {
    const id = await create({ organizationId: ORG_ID, legalName: values.legalName, registrationId: values.registrationId });
    router.push(`/companies/${id}`);
  }

  return (
    <main className="page-shell" id="main-content">
      <h1>Create company</h1>
      <p>Legal name is required. Registration ID must be unique within the organization.</p>
      <CompanyForm organizationId={ORG_ID} onSubmit={handleSubmit} submitLabel="Create company" />
    </main>
  );
}
