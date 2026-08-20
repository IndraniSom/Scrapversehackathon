# BidRadar Release Provenance

Frozen API SHA-256: `bb7df948805027b7325d243a094e48f290371547ae39c2dfd27de093414ca2b1`.

## Opportunity inventory

- Seven normalized rows: CPPP 2, West Bengal 2, NTPC 2, Odisha 1.
- Modes: six `MANUAL_FIXTURE`; one `RECORDED_BRIGHT_DATA_SNAPSHOT`.
- Assessed selector: `ocac-pond-monitoring-26001`, `ODISHA`, Odisha Computer Application Centre, `MANUAL_FIXTURE`.
- Opportunity artifact SHA-256: `9fecd94c9e6ebcc7c01516b82127e8ec79c4068a209a8b2ef0aeacfb2454ad3a`.

## Bright Data proof

- Collector: `ntpc-live-tenders`, configuration `1.0.0`.
- Completed runs: `j_mt0i7u3zhh7ylzc30`, `j_mt0i8gv6123quvy2fx`, `j_mt0i928kyu57telkk`.
- Chosen run: `j_mt0i928kyu57telkk`; 2026-08-19 19:49:13.664Z to 19:49:29.767Z; terminal `SUCCESS`.
- Exact raw-byte SHA-256: `b7ff42dfef9c3a12cd043ee0a23394158d9f9800a12407938a07dccd1ee11aef`.
- Source-proof artifact SHA-256: `9663cf48da676942f180d08a8c8f6c5d7071cfc056470176611d3d8bbdf67ade`.
- Human portal review: Skythrill256, 2026-08-20, NTPC disclaimer, collection `ALLOW`, retention `ALLOW`.

## Official document pair

| Artifact | Official URL | Content SHA-256 | Pages | Review |
|---|---|---|---:|---|
| OCAC base RFP | `https://odisha.gov.in/sites/default/files/2026-01/RFP-26001_03.01.2026_1.pdf` | `f1bc41678cd71b0d20cd2432cf579b840af7a52152b72d8c55a5ee129b927afd` | 69 | Skythrill256, 2026-08-20, `HUMAN_EDITED`, revision 1 |
| OCAC corrigendum | `https://odisha.gov.in/sites/default/files/2026-03/Corrigendum_17.03.2026_RFP-26001.pdf` | `ccbe30fa4f886087bb09d94cf1073fca97e66789957ba2da63c09a5e7fa657a1` | 30 | Skythrill256, 2026-08-20, `HUMAN_EDITED`, revision 2 |

All 69 base and 30 amendment pages are listed as processed. The base turnover clause is on physical page 19 (printed 18); the accepted replacement is on amendment physical/printed page 4. Extraction metadata records model `deepseek-v4-flash`, prompt `ocac-v1`, and schema `rules-v1`. Runtime uses only reviewed cached outputs and makes no model call.

## Deterministic decision

Revised frozen handoff below is pending B artifact rebuild; the digest table that follows records the superseded pre-final-fix bundle for lineage only.

- Synthetic company artifact SHA-256: `f4c7e4522417a951207bbbe9374a3b174939aa34002e64079685c9e7190af030`.
- Base: `NO_BID`, one failed hard rule, three UNKNOWN certification rules, ₹12 crore turnover threshold.
- Amended: `REVIEW`, zero failed hard rules, three UNKNOWN certification rules, ₹6 crore turnover threshold.
- The authority clause names ISO 9001, ISO 27001, and CMMI DEV Level 3 but states no explicit validity anchor; all three remain UNKNOWN in both versions.
- Actor/disposition: `AUTHORITY` / `ACCEPTED`; replacement targets `ocac-pond-monitoring-rfp-v1`.
- ISO 9001, ISO 27001, and CMMI DEV Level 3 requirements/evidence remain unchanged and UNKNOWN; turnover is the only changed rule.

## Immutable bundle digests

**SUPERSEDED / REBUILD PENDING:** These digests identify the last BID bundle and must be replaced after backend consumption of contract hash `bb7df948805027b7325d243a094e48f290371547ae39c2dfd27de093414ca2b1`.

| Manifest key | Path | SHA-256 |
|---|---|---|
| opportunities | `opportunities.json` | `9fecd94c9e6ebcc7c01516b82127e8ec79c4068a209a8b2ef0aeacfb2454ad3a` |
| company | `company-profile.json` | `f4c7e4522417a951207bbbe9374a3b174939aa34002e64079685c9e7190af030` |
| assessment | `assessment.json` | `fc7d106460d3c81a40885a481f5e7b83806bfe01e6badc47a83babd9148a6245` |
| impact | `amendment-impact.json` | `30c79d4c7996a0c9a3d04a246bf2826b4136b6d66d9510efdbcae881789a6766` |
| base extraction | `extractions/base.json` | `7033c80bb62cd69c091d6fe8dee5e9347511ab112f54d2a293b5de0c281cd81a` |
| amendment extraction | `extractions/amendment.json` | `69bb705743f85e3d28ad42c1126640ca0641a22ae0f88a714cc21b3a92e66aca` |
| raw snapshot | `raw/b7ff…aef.json` | `b7ff42dfef9c3a12cd043ee0a23394158d9f9800a12407938a07dccd1ee11aef` |
| source proof | `source-proof.json` | `9663cf48da676942f180d08a8c8f6c5d7071cfc056470176611d3d8bbdf67ade` |

Manifest file SHA-256: `d0421c269f6afa17b7f6e2d2ae68c0ad381c1fe6b184fbfc24056e5a8e2feeca`.

## Limits

- One official digital-text base/corrigendum pair, one synthetic bidder, and four supported hard rules.
- Broader two-document/20-to-30-clause evaluation remains post-hackathon and is not claimed.
- No OCR, uploads, arbitrary fetching, automated submission, scoring, alerts, chat, or production deployment is included.
