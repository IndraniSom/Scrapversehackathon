"""Smoke platform — deterministic demo, tenant isolation, hashes, and optional live probes."""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "tools" / "demo_seed.json"
ALT_SEED = ROOT / "frontend" / "tests" / "fixtures" / "production-demo.json"
MAX_SECONDS = 420.0


def load_seed(path: Path) -> dict[str, object]:
    """Load and parse seed JSON or fail with location."""
    raw = path.read_text(encoding="utf-8")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise RuntimeError(f"{path}: expected object")
    return value


def check_seed(seed: dict[str, object]) -> None:
    """Validate deterministic invariants: counts, isolation, hashes."""
    orgs = seed.get("organizations")
    comps = seed.get("companies")
    opps = seed.get("opportunities")
    ams = seed.get("amendments")
    if not isinstance(orgs, list) or len(orgs) != 2:
        raise RuntimeError("organizations must be 2")
    if not isinstance(comps, list) or len(comps) != 3:
        raise RuntimeError("companies must be 3")
    if not isinstance(opps, list) or len(opps) != 12:
        raise RuntimeError("opportunities must be 12")
    # tenant isolation
    org_ids = {str(o.get("id")) for o in orgs if isinstance(o, dict)}
    for c in comps:
        if not isinstance(c, dict) or str(c.get("organizationId")) not in org_ids:
            raise RuntimeError("company has invalid organizationId")
    for o in opps:
        if not isinstance(o, dict) or str(o.get("organizationId")) not in org_ids:
            raise RuntimeError("opportunity has invalid organizationId")
    # hashes are 64 hex
    for o in opps:
        h = str((o if isinstance(o, dict) else {}).get("sha256") or "")
        if len(h) != 64 or any(ch not in "0123456789abcdef" for ch in h):
            raise RuntimeError(f"opportunity hash invalid: {o}")
    if not isinstance(ams, list) or len(ams) < 2:
        raise RuntimeError("amendments must be >=2")
    accepted = [a for a in ams if isinstance(a, dict) and a.get("actor") == "AUTHORITY" and a.get("disposition") == "ACCEPTED"]
    rejected = [a for a in ams if isinstance(a, dict) and a.get("actor") == "BIDDER" and a.get("disposition") == "REJECTED"]
    if not accepted or not rejected:
        raise RuntimeError("amendment authority gates missing")
    prop = seed.get("proposal")
    if not isinstance(prop, dict) or not isinstance(prop.get("sections"), list):
        raise RuntimeError("proposal sections missing")
    ex = seed.get("exports")
    if not isinstance(ex, dict) or not isinstance(ex.get("manifest"), list):
        raise RuntimeError("export manifest missing")
    sub = seed.get("submission")
    if not isinstance(sub, dict) or sub.get("aiCanSubmit") is not False:
        raise RuntimeError("submission must block AI")
    if sub.get("stepUpVerified") is not True or sub.get("approvalVerified") is not True:
        raise RuntimeError("submission gates must be verified")


def probe_live(backend: str, frontend: str) -> tuple[bool, str]:
    """Probe live API/frontend when reachable; return success flag and note."""
    try:
        brief = 4
        for url in [f"{backend}/health/live", f"{backend}/health/ready", f"{frontend}/"]:
            req = urllib.request.Request(url, headers={"User-Agent": "BidRadar-Smoke/1"})
            with urllib.request.urlopen(req, timeout=brief) as r:
                if r.status != 200:
                    return False, f"{url} status {r.status}"
        return True, "live probes passed"
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return False, f"live probes skipped ({e})"


def run_smoke(seed_path: Path | None = None, offline: bool = False) -> float:
    """Run dataset validation and optional live probes within time ceiling."""
    started = time.monotonic()
    # credentials must be absent in offline mode
    if offline:
        for k in ("BRIGHT_DATA_API_TOKEN", "BRIGHT_DATA_COLLECTOR_ID", "DEEPSEEK_API_KEY", "OPENAI_API_KEY"):
            if os.environ.get(k):
                raise RuntimeError(f"credential {k} must be absent in offline mode")
    path = seed_path or (SEED if SEED.exists() else ALT_SEED)
    if not path.exists():
        raise RuntimeError(f"seed missing at {path}; run tools/seed_production_demo.py")
    seed = load_seed(path)
    check_seed(seed)
    if offline:
        live_note = "offline replay"
    else:
        backend = os.environ.get("BIDRADAR_API_BASE_URL", "http://127.0.0.1:8000")
        frontend_url = os.environ.get("BIDRADAR_FRONTEND_URL", "http://127.0.0.1:3000")
        live_ok, live_note = probe_live(backend, frontend_url)
        if not live_ok:
            raise RuntimeError(f"live probes failed: {live_note}")
    # check frontend build exists
    build_marker = ROOT / "frontend" / ".next" / "BUILD_ID"
    build_note = "build present" if build_marker.exists() else "build not checked (no .next)"
    elapsed = time.monotonic() - started
    if elapsed >= MAX_SECONDS:
        raise RuntimeError("smoke exceeded seven minutes")
    print(f"smoke_platform PASS ({elapsed:.2f}s) — 2 orgs, 3 companies, 12 opps, amendments, proposal, exports, receipt; {build_note}; {live_note}")
    return elapsed


def main() -> int:
    """CLI entrypoint for platform smoke validation."""
    parser = argparse.ArgumentParser(description="Smoke platform deterministic dataset and live probes")
    parser.add_argument("--mode", choices=["normal", "offline"], default="normal", help="offline removes credentials and skips live probes")
    parser.add_argument("--seed", type=str, default=None, help="seed JSON path")
    args = parser.parse_args()
    try:
        run_smoke(Path(args.seed) if args.seed else None, offline=args.mode == "offline")
        return 0
    except Exception as e:  # noqa: BLE001
        print(f"smoke_platform FAIL: {e}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
