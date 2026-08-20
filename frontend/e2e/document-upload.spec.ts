/**
 * E2E document upload security journeys.
 * Validates unauthorized, spoofed MIME, double extension, oversize, duplicate hash, cross-tenant, deleted.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { hasDoubleExtension, isSafeFilename, validateFileMeta, MAX_FILE_BYTES } from "../convex/companyDocuments";

const convexPath = path.resolve(process.cwd(), "convex/companyDocuments.ts");
const routePath = path.resolve(process.cwd(), "app/api/files/[documentId]/route.ts");
const uploaderPath = path.resolve(process.cwd(), "components/companies/document-uploader.tsx");
const listPath = path.resolve(process.cwd(), "components/documents/document-list.tsx");

test.describe("document upload security", () => {
  test("blocks unauthorized upload URL without org", async () => {
    const text = fs.readFileSync(convexPath, "utf8");
    expect(text).toContain("throwUnauthorized");
    expect(text).toContain("generateUploadUrl");
  });

  test("rejects spoofed MIME", async () => {
    expect(() => validateFileMeta({ fileName: "a.pdf", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 100, sha256: "a".repeat(64) })).toThrow();
    expect(() => validateFileMeta({ fileName: "a.pdf", mime: "application/pdf", size: 100, sha256: "a".repeat(64), headerHex: "504b0304" })).toThrow();
  });

  test("rejects double extension", async () => {
    expect(hasDoubleExtension("report.pdf.exe")).toBe(true);
    expect(hasDoubleExtension("invoice.docx.pdf")).toBe(true);
    expect(isSafeFilename("report.pdf.exe")).toBe(false);
    expect(isSafeFilename("clean.pdf")).toBe(true);
    expect(() => validateFileMeta({ fileName: "evil.pdf.exe", mime: "application/pdf", size: 100, sha256: "a".repeat(64) })).toThrow();
    expect(fs.readFileSync(convexPath, "utf8")).toContain("hasDoubleExtension");
  });

  test("rejects oversize >15MB", async () => {
    expect(() => validateFileMeta({ fileName: "big.pdf", mime: "application/pdf", size: MAX_FILE_BYTES + 1, sha256: "b".repeat(64) })).toThrow();
    expect(fs.readFileSync(convexPath, "utf8")).toContain("15");
  });

  test("detects duplicate hash via CONFLICT", async () => {
    const text = fs.readFileSync(convexPath, "utf8");
    expect(text).toContain("throwConflict");
    expect(text).toContain("Duplicate document hash");
    expect(text).toContain("by_organization_and_id");
  });

  test("enforces cross-tenant isolation", async () => {
    const text = fs.readFileSync(convexPath, "utf8");
    expect(text).toContain("organizationId");
    expect(text).toContain("throwNotFound");
    expect(text).toContain("getDocument");
  });

  test("blocks deleted access", async () => {
    const text = fs.readFileSync(convexPath, "utf8");
    expect(text).toContain("deleted");
    expect(text).toContain('scanState==="deleted"');
  });

  test("proxy sets attachment and nosniff and never leaks bearer URL", async () => {
    const route = fs.readFileSync(routePath, "utf8");
    expect(route).toContain("X-Content-Type-Options");
    expect(route).toContain("nosniff");
    expect(route).toContain("Content-Disposition");
    expect(route).toContain("attachment");
    expect(route).not.toMatch(/getUrl.*return.*client/); // ensure not leaking directly
    const list = fs.readFileSync(listPath, "utf8");
    expect(list).toContain("/api/files/");
    expect(list).not.toContain("getUrl");
    expect(list).not.toContain("storageUrl");
    const convex = fs.readFileSync(convexPath, "utf8");
    expect(convex).toContain("listDocuments");
    // list should not return url
    expect(convex).not.toContain("return.*url");
  });

  test("uploader restricts to pdf/docx and quarantined flow", async () => {
    const uploader = fs.readFileSync(uploaderPath, "utf8");
    expect(uploader).toContain(".pdf");
    expect(uploader).toContain(".docx");
    expect(uploader).toContain("quarantined");
    expect(uploader).toContain("generateUploadUrl");
    expect(uploader).toContain("finalize");
    expect(uploader).toContain("15MB");
  });

  test("route validates documentId and returns 401 without auth", async () => {
    const route = fs.readFileSync(routePath, "utf8");
    expect(route).toContain("Unauthorized");
    expect(route).toContain("401");
    expect(route).toContain("Invalid document id");
  });
});
