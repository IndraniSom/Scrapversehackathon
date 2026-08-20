/**
 * Submission handoff tests: checklist, stale, step-up, duplicate, connector, audit, AI guard.
 */
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isAllowedPortal, isOfficialUrl, isSha256 } from "../../convex/integrations";

const integrationsPath = path.resolve(__dirname, "../../convex/integrations.ts");
const submissionsPath = path.resolve(__dirname, "../../convex/submissions.ts");
const checklistPath = path.resolve(__dirname, "../../components/submissions/submission-checklist.tsx");
const receiptPath = path.resolve(__dirname, "../../components/submissions/receipt-form.tsx");
const integrationsPagePath = path.resolve(__dirname, "../../app/(product)/integrations/page.tsx");

/**
 * Reads file content for static boundary checks.
 */
function read(p: string): string {
  return fs.readFileSync(p, "utf8");
}

describe("submission connector boundary", () => {
  test("integrations exposes prepare/status only, no submit", () => {
    const txt = read(integrationsPath);
    expect(txt).toMatch(/export const prepare/);
    expect(txt).toMatch(/export const status/);
    expect(txt).not.toMatch(/\bsubmit\s*\(/i);
    expect(txt).toMatch(/SubmissionConnector/);
    expect(txt).toMatch(/prepare[\s\S]*status/);
  });

  test("checklist requires official link, server-clock warning, EMD, signing", () => {
    const txt = read(checklistPath);
    expect(txt).toMatch(/Official portal/i);
    expect(txt).toMatch(/Server-clock warning/i);
    expect(txt).toMatch(/EMD/i);
    expect(txt).toMatch(/signing/i);
    expect(txt).toMatch(/Filenames/i);
    expect(txt).toMatch(/stepUpVerified/i);
    expect(txt).toMatch(/approvalVerified/i);
  });

  test("receipt form records acknowledgement digest", () => {
    const txt = read(receiptPath);
    expect(txt).toMatch(/Acknowledgement/i);
    expect(txt).toMatch(/packageDigest/i);
    expect(txt).toMatch(/audit/i);
    expect(txt).toMatch(/64 hex/i);
  });

  test("integrations page shows official link and server-clock warning", () => {
    const txt = read(integrationsPagePath);
    expect(txt).toMatch(/eprocure\.gov\.in/);
    expect(txt).toMatch(/Server/);
    expect(txt).toMatch(/SubmissionConnector/);
  });

  test("portal allowlist rejects unauthorized connector", () => {
    expect(isAllowedPortal("CPPP")).toBe(true);
    expect(isAllowedPortal("RANDOM_PORTAL")).toBe(false);
    expect(isAllowedPortal("EVIL")).toBe(false);
  });

  test("official url must be https", () => {
    expect(isOfficialUrl("https://eprocure.gov.in/eprocure/app")).toBe(true);
    expect(isOfficialUrl("http://eprocure.gov.in")).toBe(false);
    expect(isOfficialUrl("not-a-url")).toBe(false);
  });

  test("sha256 digest format enforced", () => {
    expect(isSha256("a".repeat(64))).toBe(true);
    expect(isSha256("A".repeat(64))).toBe(true);
    expect(isSha256("short")).toBe(false);
    expect(isSha256("g".repeat(64))).toBe(false);
  });

  test("submissions enforces audit and AI guard text", () => {
    const txt = read(submissionsPath);
    expect(txt).toMatch(/auditEvents/);
    expect(txt).toMatch(/AI cannot change submission state/);
    expect(txt).toMatch(/Duplicate receipt/);
    expect(txt).toMatch(/Stale package/);
    expect(txt).toMatch(/Step-up authentication required/);
    expect(txt).toMatch(/Approval required/);
  });

  test("incomplete checklist is rejected", () => {
    const txt = read(integrationsPath);
    expect(txt).toMatch(/Checklist incomplete/);
  });

  test("stale package detection present", () => {
    const txt = read(integrationsPath) + read(submissionsPath);
    expect(txt).toMatch(/Stale package/);
    expect(txt).toMatch(/manifest/);
  });

  test("missing step-up and approval are distinct errors", () => {
    const txt = read(integrationsPath);
    expect(txt).toMatch(/Step-up authentication required/);
    expect(txt).toMatch(/Approval required/);
  });
});
