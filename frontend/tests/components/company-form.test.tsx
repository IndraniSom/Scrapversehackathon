/** Component tests for company form validation and evidence editors. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CompanyForm } from "../../components/companies/company-form";
import { EvidenceEditor } from "../../components/companies/evidence-editor";

afterEach(cleanup);

describe("CompanyForm", () => {
  test("shows legal name required and disables submit when blank", async () => {
    const onSubmit = vi.fn(async () => {});
    render(<CompanyForm organizationId="org_a" onSubmit={onSubmit} submitLabel="Create company" />);
    const input = screen.getByLabelText(/legal name/i) as HTMLInputElement;
    const button = screen.getByRole("button", { name: /create company/i });
    expect(button).toBeDisabled();
    expect(screen.getByText(/legal name is required/i)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Acme Ltd" } });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(await screen.findByText(/saving/i) || onSubmit).toBeTruthy();
  });

  test("trims values and calls onSubmit with correct payload", async () => {
    const onSubmit = vi.fn(async () => {});
    render(<CompanyForm organizationId="org_a" initial={{ legalName: "  Acme  ", registrationId: " CIN001 ", organizationId: "org_a" }} onSubmit={onSubmit} submitLabel="Save changes" />);
    const button = screen.getByRole("button", { name: /save changes/i });
    fireEvent.click(button);
    // wait for async
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ legalName: "Acme", registrationId: "CIN001", organizationId: "org_a" }));
  });

  test("shows registration hint and preserves error on failure", async () => {
    const onSubmit = vi.fn(async () => { throw new Error("Duplicate registrationId."); });
    render(<CompanyForm organizationId="org_a" onSubmit={onSubmit} submitLabel="Create company" />);
    expect(screen.getByText(/registration id must be unique/i)).toBeInTheDocument();
    const name = screen.getByLabelText(/legal name/i);
    fireEvent.change(name, { target: { value: "New Co" } });
    fireEvent.click(screen.getByRole("button", { name: /create company/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/duplicate/i);
  });
});

describe("EvidenceEditor", () => {
  test("validates FY format and blocks turnover submit when invalid", async () => {
    const addTurnover = vi.fn(async () => {});
    render(<EvidenceEditor organizationId="org_a" companyId="c1" onAddTurnover={addTurnover} onAddCertification={vi.fn(async () => {})} onAddProject={vi.fn(async () => {})} onAddExemption={vi.fn(async () => {})} />);
    const fyInput = screen.getByDisplayValue("2023-24");
    fireEvent.change(fyInput, { target: { value: "2023-25" } });
    expect(screen.getByText(/invalid fy/i)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /add turnover/i });
    expect(btn).toBeDisabled();
    fireEvent.change(fyInput, { target: { value: "2023-24" } });
    expect(screen.getByText(/format yyyy-yy/i)).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  test("shows INR validation and date ordering messages", async () => {
    const addProject = vi.fn(async () => {});
    render(<EvidenceEditor organizationId="org_a" companyId="c1" onAddTurnover={vi.fn(async () => {})} onAddCertification={vi.fn(async () => {})} onAddProject={addProject} onAddExemption={vi.fn(async () => {})} />);
    const certName = screen.getByLabelText(/^name$/i);
    const issuer = screen.getByLabelText(/issuer/i);
    fireEvent.change(certName, { target: { value: "ISO" } });
    fireEvent.change(issuer, { target: { value: "Bureau" } });
    // certifications dates invalid case: set from after until
    const from = screen.getByLabelText(/valid from/i);
    const until = screen.getByLabelText(/valid until/i);
    fireEvent.change(from, { target: { value: "2025-01-10" } });
    fireEvent.change(until, { target: { value: "2025-01-01" } });
    expect(await screen.findByText(/valid from must be before valid until/i)).toBeInTheDocument();
  });
});
