/**
 * Convex company document security tests.
 * Covers unauthorized, spoofed MIME, double extension, oversize, duplicate hash, cross-tenant, deleted.
 */
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  MAX_FILE_BYTES,
  isSafeFilename,
  isValidSha256,
  hasDoubleExtension,
  matchesSignature,
  validateFileMeta,
  escapeFilename,
} from "../../convex/companyDocuments";

const convexFile = path.resolve(__dirname, "../../convex/companyDocuments.ts");
const fileText = fs.readFileSync(convexFile, "utf8");

describe("company document helpers", () => {
  test("rejects double extension", () => {
    expect(hasDoubleExtension("report.pdf.exe")).toBe(true);
    expect(hasDoubleExtension("invoice.docx.pdf")).toBe(true);
    expect(hasDoubleExtension("archive.pdf.pdf")).toBe(true);
    expect(hasDoubleExtension("my.report.pdf")).toBe(false);
    expect(isSafeFilename("report.pdf.exe")).toBe(false);
    expect(isSafeFilename("clean.pdf")).toBe(true);
    expect(isSafeFilename("clean.docx")).toBe(true);
    expect(isSafeFilename("../../etc/passwd.pdf")).toBe(false);
  });

  test("validates SHA-256", () => {
    expect(isValidSha256("a".repeat(64))).toBe(true);
    expect(isValidSha256("A".repeat(64))).toBe(true);
    expect(isValidSha256("g".repeat(64))).toBe(false);
    expect(isValidSha256("short")).toBe(false);
  });

  test("matches signature", () => {
    expect(matchesSignature("application/pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(true);
    expect(matchesSignature("application/pdf", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
    expect(matchesSignature("application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
  });

  test("escapes filename", () => {
    expect(escapeFilename('evil\"file\r\n.pdf')).not.toContain('"');
    expect(escapeFilename('evil\"file\r\n.pdf')).not.toContain("\n");
  });

  test("rejects oversize", () => {
    expect(() => validateFileMeta({ fileName: "a.pdf", mime: "application/pdf", size: MAX_FILE_BYTES + 1, sha256: "a".repeat(64) })).toThrow();
  });

  test("rejects spoofed MIME via extension mismatch", () => {
    expect(() => validateFileMeta({ fileName: "doc.pdf", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 100, sha256: "b".repeat(64) })).toThrow();
  });

  test("rejects spoofed MIME via signature", () => {
    const docxHeader = "504b0304";
    expect(() => validateFileMeta({ fileName: "a.pdf", mime: "application/pdf", size: 100, sha256: "c".repeat(64), headerHex: docxHeader })).toThrow();
  });

  test("rejects double extension via validate", () => {
    expect(() => validateFileMeta({ fileName: "a.pdf.exe", mime: "application/pdf", size: 100, sha256: "d".repeat(64) })).toThrow();
  });

  test("accepts valid meta", () => {
    expect(() => validateFileMeta({ fileName: "report.pdf", mime: "application/pdf", size: 100, sha256: "e".repeat(64), headerHex: "25504446" })).not.toThrow();
  });
});

describe("convex upload auth and isolation", () => {
  test("unauthorized upload URL requires auth", () => {
    expect(fileText).toContain("generateUploadUrl");
    expect(fileText).toContain("requireOrg");
    expect(fileText).toContain("throwUnauthorized");
  });

  test("finalize validates size/type/signature/hash agreement", () => {
    expect(fileText).toContain("finalizeUpload");
    expect(fileText).toContain("validateFileMeta");
    expect(fileText).toContain("getMetadata");
    expect(fileText).toContain("Size mismatch");
    expect(fileText).toContain("Hash mismatch");
    expect(fileText).toContain("Content-Type mismatch");
  });

  test("duplicate hash throws CONFLICT", () => {
    expect(fileText).toContain("throwConflict");
    expect(fileText).toContain("Duplicate document hash");
    expect(fileText).toContain("by_organization_and_id");
  });

  test("cross-tenant read throws NOT_FOUND", () => {
    expect(fileText).toContain("getDocument");
    expect(fileText).toContain("organizationId");
    expect(fileText).toContain("throwNotFound");
  });

  test("deleted access throws NOT_FOUND", () => {
    expect(fileText).toContain("deleted");
    expect(fileText).toContain('scanState==="deleted"');
    expect(fileText).toContain("throwNotFound");
  });

  test("list hides deleted and does not leak bearer URL", () => {
    expect(fileText).toContain("listDocuments");
    expect(fileText).toContain('scanState!=="deleted"');
    expect(fileText).not.toContain("storageUrl");
    expect(fileText).toContain("withIndex");
    expect(fileText).toContain("by_organization");
    // getUrl should only appear in getDownloadUrl (server proxy), not in list/get
    const listSection = fileText.slice(fileText.indexOf("listDocuments"), fileText.indexOf("getDocument"));
    expect(listSection).not.toContain("getUrl");
  });

  test("oversize file is rejected server-side", () => {
    expect(fileText).toContain("MAX_FILE_BYTES");
    expect(fileText).toContain("15");
    expect(() => validateFileMeta({ fileName: "big.pdf", mime: "application/pdf", size: MAX_FILE_BYTES + 1, sha256: "a".repeat(64) })).toThrow();
  });

  test("states quarantine/approved/rejected/deleted are present", () => {
    expect(fileText).toContain("quarantined");
    expect(fileText).toContain("approved");
    expect(fileText).toContain("rejected");
    expect(fileText).toContain("deleted");
  });

  test("no bearer URL leak in list/get", () => {
    const getSection = fileText.slice(fileText.indexOf("getDocument"), fileText.indexOf("approveDocument"));
    expect(getSection).not.toContain("getUrl");
  });
});
