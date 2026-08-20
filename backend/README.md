# BidRadar backend

BidRadar serves a read-only, offline FastAPI view of the immutable demo bundle. Runtime startup performs no provider, LLM, document, or arbitrary URL requests. It validates every manifest hash, the recorded Bright Data proof and raw bytes, both reviewed extraction caches, OCAC opportunity/document semantics, and exact assessment recomputation before accepting traffic.

## Install and verify

From the repository root:

```bash
cd backend
uv sync --frozen
uv run pytest -q
uv run ruff check src tests scripts
uv run python scripts/capture_source_proof.py --verify-only data/demo/source-proof.json
uv run python scripts/prepare_demo.py --verify-only data/demo/extractions
uv run python -c "from pathlib import Path; from backend.artifacts import load_demo_bundle; load_demo_bundle(Path('data/demo')); print('VERIFIED bundle')"
```

These checks are network-free. Runtime does not read Bright Data, DeepSeek, or OpenAI credentials. The only runtime settings are:

- `BIDRADAR_DEMO_DATA_DIR` (default: committed `backend/data/demo`)
- `BIDRADAR_HOST` (default: `127.0.0.1`)
- `BIDRADAR_PORT` (default: `8000`)

## Start the API

```bash
cd backend
uv run uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
curl -fsS http://127.0.0.1:8000/health/live
curl -fsS http://127.0.0.1:8000/health/ready
curl -fsS http://127.0.0.1:8000/api/v1/opportunities
curl -fsS http://127.0.0.1:8000/api/v1/opportunities/ocac-pond-monitoring-26001
curl -fsS http://127.0.0.1:8000/api/v1/opportunities/ocac-pond-monitoring-26001/amendment-impact
curl -fsS http://127.0.0.1:8000/api/v1/source-proof
```

Stop Uvicorn with `Ctrl-C`. Invalid or escaping artifacts fail during lifespan startup; the server does not serve partial data.

## Evidence and limitations

- Source proof is a verified recorded Bright Data snapshot with provider run `j_mt0i928kyu57telkk`; the retained raw SHA-256 is `b7ff42dfef9c3a12cd043ee0a23394158d9f9800a12407938a07dccd1ee11aef`.
- The assessed OCAC opportunity remains honestly `MANUAL_FIXTURE`; real official documents and human review do not imply provider collection of that opportunity row.
- The reviewed official base/corrigendum pair changes only average turnover from INR 120,000,000 to INR 60,000,000. The same synthetic bidder changes from `NO_BID` to `BID` with zero applicable unknown rules.
- The API is decision support only. It is not legal advice, bid submission, nationwide coverage, live collection, or runtime model extraction.
