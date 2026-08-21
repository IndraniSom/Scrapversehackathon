"""Deterministic production demo seed — 2 orgs, 3 companies, 12 opps, amendments, proposal."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "tools" / "demo_seed.json"
ALT_OUT = ROOT / "frontend" / "tests" / "fixtures" / "production-demo.json"


def sha(s: str) -> str:
    """Return hex sha256 of input string."""
    return hashlib.sha256(s.encode()).hexdigest()


def orgs() -> list[dict[str, object]]:
    """Return two deterministic organizations."""
    return [
        {"id": "org_alpha", "slug": "alpha-procurement", "displayName": "Alpha Procurement Collective", "clerkOrganizationId": "org_alpha_clerk", "timezone": "Asia/Kolkata"},
        {"id": "org_beta", "slug": "beta-ventures", "displayName": "Beta Ventures Pvt Ltd", "clerkOrganizationId": "org_beta_clerk", "timezone": "Asia/Kolkata"},
    ]


def companies() -> list[dict[str, object]]:
    """Return three companies across two orgs with evidence pointers."""
    return [
        {"id": "comp_alpha_1", "organizationId": "org_alpha", "legalName": "Alpha Systems Pvt Ltd", "registrationId": "CIN-U72900MH2020PTC111111", "turnoverEvidence": [{"fy": "2022-23", "amountInr": "95000000", "audited": True}], "certifications": [{"name": "ISO 9001", "validUntil": "2027-12-31"}]},
        {"id": "comp_alpha_2", "organizationId": "org_alpha", "legalName": "Alpha Infra Solutions", "registrationId": "CIN-U72900MH2021PTC222222", "turnoverEvidence": [{"fy": "2023-24", "amountInr": "120000000", "audited": True}], "certifications": [{"name": "CMMI DEV L3", "validUntil": "2026-09-30"}]},
        {"id": "comp_beta_1", "organizationId": "org_beta", "legalName": "Beta Digital Works", "registrationId": "CIN-U72900KA2022PTC333333", "turnoverEvidence": [{"fy": "2023-24", "amountInr": "60000000", "audited": True}], "certifications": [{"name": "ISO 27001", "validUntil": "2027-06-30"}]},
    ]


def opportunities() -> list[dict[str, object]]:
    """Return 12 opportunities across four sources with deterministic hashes."""
    sources = ["CPPP", "WEST_BENGAL", "NTPC", "ODISHA"]
    titles = ["Cloud operations support", "Pond Monitoring and Advisory System", "Highway maintenance", "Medical equipment supply", "Solar plant installation", "Water treatment plant", "School infrastructure", "Data center upgrade", "Railway signaling", "Port logistics", "Urban surveillance", "E-governance platform"]
    modes = ["LIVE", "RECORDED_BRIGHT_DATA_SNAPSHOT", "MANUAL_FIXTURE"]
    rows: list[dict[str, object]] = []
    for i in range(12):
        src = sources[i % 4]
        title = titles[i]
        oid = f"opp-{i+1:02d}-{src.lower()}-{sha(title)[:8]}"
        rows.append({"id": oid, "organizationId": "org_alpha" if i < 8 else "org_beta", "source": src, "sourceTenderId": f"{src}-2026-{1000+i}", "title": title, "authority": f"{src} Authority", "category": "SOFTWARE" if i % 3 == 0 else "WORKS", "lifecycle": "open", "dataMode": modes[i % 3], "canonicalUrl": f"https://example.gov.in/tenders/{oid}", "sha256": sha(oid + title), "snapshotSha256": sha(f"snapshot-{oid}"), "closesAt": 1726800000000 + i * 86400000, "budgetAmount": 5000000 + i * 1000000, "hasAmendment": i in (1, 5)})
    return rows


def amendments(opp_ids: list[str]) -> list[dict[str, object]]:
    """Return two amendments — one authority accepted, one bidder rejected."""
    return [
        {"id": "amd-01", "opportunityId": opp_ids[1], "actor": "AUTHORITY", "disposition": "ACCEPTED", "effectiveChange": True, "baseSha256": sha(opp_ids[1] + "base"), "amendmentSha256": sha(opp_ids[1] + "amend"), "diff": "Turnover threshold 12cr → 6cr", "replacesDocumentId": "doc-base-01"},
        {"id": "amd-02", "opportunityId": opp_ids[5], "actor": "BIDDER", "disposition": "REJECTED", "effectiveChange": False, "baseSha256": sha(opp_ids[5] + "base"), "amendmentSha256": sha(opp_ids[5] + "amend"), "diff": "Bidder requested extension — rejected", "replacesDocumentId": None},
    ]


def proposal_doc(opportunity_id: str) -> dict[str, object]:
    """Return a complete proposal workspace with outline, compliance, and lock."""
    sections = [{"id": f"sec-{i}", "title": t, "instructionCitation": f"Instruction §{i+1}", "state": s, "order": i, "body": f"Body for {t}"} for i, (t, s) in enumerate([("Cover Letter", "APPROVED"), ("Technical Approach", "APPROVED"), ("Compliance Matrix", "READY_FOR_REVIEW"), ("Financial Bid", "DRAFTING")])]
    compliance = [{"requirementId": f"req-{i}", "category": c, "status": "compliant" if i < 2 else "gap", "evidence": f"evidence-{i}"} for i, c in enumerate(["MISSING_DATA", "FAILED_REQUIREMENT", "REVIEW_REQUIRED", "OWNER_REQUIRED"])]
    return {"id": "prop-01", "opportunityId": opportunity_id, "companyId": "comp_alpha_1", "sections": sections, "compliance": compliance, "comments": [{"id": "c1", "body": "Verify turnover evidence", "resolutionState": "open"}], "lockedRevision": 4, "approvalGate": {"requiredRole": "org:bid_manager", "decision": "APPROVED"}}


def exports_manifest() -> dict[str, object]:
    """Return deterministic export manifest with hashes and mime types."""
    files = [("assessment.pdf", "application/pdf"), ("compliance.csv", "text/csv"), ("proposal.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), ("evidence.json", "application/json"), ("package.zip", "application/zip")]
    manifest = [{"path": p, "sha256": sha(p + "v1"), "mime": m, "bytes": 1024 + i * 512} for i, (p, m) in enumerate(files)]
    return {"manifest": manifest, "revision": 4, "generatedAt": "2026-08-21T08:00:00Z"}


def build_seed() -> dict[str, object]:
    """Assemble the full deterministic demo dataset."""
    org_list = orgs()
    comp_list = companies()
    opp_list = opportunities()
    opp_ids = [str(o["id"]) for o in opp_list]
    return {"organizations": org_list, "companies": comp_list, "opportunities": opp_list, "sourceRuns": [{"providerRunId": "j_demo_001", "collector": "ntpc-v2", "status": "SUCCESS", "rawSha256": sha("raw-01")}, {"providerRunId": "j_demo_002", "collector": "cppp-v1", "status": "SUCCESS", "rawSha256": sha("raw-02")}], "documentStates": [{"quality": "parsed", "pages": 12}, {"quality": "needsOcr", "pages": 8}, {"quality": "invalid", "reason": "encrypted"}], "amendments": amendments(opp_ids), "proposal": proposal_doc(opp_ids[1]), "compliance": proposal_doc(opp_ids[1])["compliance"], "exports": exports_manifest(), "submission": {"stepUpVerified": True, "approvalVerified": True, "aiCanSubmit": False, "receipt": {"acknowledgementNumber": "ACK-2026-0001", "portalTimestamp": "2026-08-21T09:30:00Z", "digest": sha("package-zip")}, "officialUrl": "https://eprocure.gov.in/eprocure/app"}, "outcome": {"result": "WON", "value": 12000000, "reasonCategories": ["competitive_pricing", "strong_evidence"], "lessons": ["Update turnover evidence early"]}, "generatedAt": "2026-08-21T08:00:00Z", "contractSha256": "bb7df948805027b7325d243a094e48f290371547ae39c2dfd27de093414ca2b1"}


def write_seed(out: Path | None = None) -> Path:
    """Write seed to primary and alternate locations deterministically."""
    seed = build_seed()
    primary = out or DEFAULT_OUT
    primary.parent.mkdir(parents=True, exist_ok=True)
    primary.write_text(json.dumps(seed, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    ALT_OUT.parent.mkdir(parents=True, exist_ok=True)
    ALT_OUT.write_text(json.dumps(seed, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return primary


def main() -> int:
    """CLI entrypoint for deterministic demo seeding."""
    parser = argparse.ArgumentParser(description="Seed deterministic production demo")
    parser.add_argument("--out", type=str, default=None, help="output JSON path")
    parser.add_argument("--check", action="store_true", help="validate without writing")
    args = parser.parse_args()
    seed = build_seed()
    assert len(seed["organizations"] or []) == 2
    assert len(seed["companies"] or []) == 3
    assert len(seed["opportunities"] or []) == 12
    if args.check:
        print(f"seed valid: 2 orgs, 3 companies, 12 opps, {len(seed['amendments'] or [])} amendments")
        return 0
    out = Path(args.out) if args.out else DEFAULT_OUT
    written = write_seed(out)
    print(f"seeded {written} and {ALT_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
