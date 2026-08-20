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

The current immutable bundle implements the reviewed frozen handoff below.

- Synthetic company artifact SHA-256: `f4c7e4522417a951207bbbe9374a3b174939aa34002e64079685c9e7190af030`.
- Base: `NO_BID`, one failed hard rule, three UNKNOWN certification rules, ₹12 crore turnover threshold.
- Amended: `REVIEW`, zero failed hard rules, three UNKNOWN certification rules, ₹6 crore turnover threshold.
- The authority clause names ISO 9001, ISO 27001, and CMMI DEV Level 3 but states no explicit validity anchor; all three remain UNKNOWN in both versions.
- Actor/disposition: `AUTHORITY` / `ACCEPTED`; replacement targets `ocac-pond-monitoring-rfp-v1`.
- ISO 9001, ISO 27001, and CMMI DEV Level 3 requirements/evidence remain unchanged and UNKNOWN; turnover is the only changed rule.

## Immutable bundle digests

These digests match the current manifest-backed bundle for contract hash `bb7df948805027b7325d243a094e48f290371547ae39c2dfd27de093414ca2b1`.

| Manifest key | Path | SHA-256 |
|---|---|---|
| opportunities | `opportunities.json` | `9fecd94c9e6ebcc7c01516b82127e8ec79c4068a209a8b2ef0aeacfb2454ad3a` |
| company | `company-profile.json` | `f4c7e4522417a951207bbbe9374a3b174939aa34002e64079685c9e7190af030` |
| assessment | `assessment.json` | `269e90d5991c0e8730171e82043c2a566710716d69963be95c894bdaccec0545` |
| impact | `amendment-impact.json` | `36cf0c0b3cd308c47b024cc89682d6952b47fb5dfdf4e87282b4824c3ec52cda` |
| base extraction | `extractions/base.json` | `dcd14dfb04c807627bcc54804510a86eb8a1eb7d3c6a62050e213956be112f29` |
| amendment extraction | `extractions/amendment.json` | `2ddce3620b0bbb800a0a190e7cec76b0d7cef100db702722be82fa1a97fd420d` |
| raw snapshot | `raw/b7ff…aef.json` | `b7ff42dfef9c3a12cd043ee0a23394158d9f9800a12407938a07dccd1ee11aef` |
| source proof | `source-proof.json` | `9663cf48da676942f180d08a8c8f6c5d7071cfc056470176611d3d8bbdf67ade` |

Manifest file SHA-256: `3963a42ec4d067d02d6f711884ced2ef1b0b4b51b127a43d6a981a368c8dfaae`.

## Limits

- One official digital-text base/corrigendum pair, one synthetic bidder, and four supported hard rules.
- Broader two-document/20-to-30-clause evaluation remains post-hackathon and is not claimed.
- No OCR, uploads, arbitrary fetching, automated submission, scoring, alerts, chat, or production deployment is included.
