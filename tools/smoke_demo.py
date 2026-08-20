"""Build, start, verify, and always stop the offline BidRadar demo processes."""

import argparse
import json
import os
import signal
import socket
import subprocess
import time
import urllib.error
import urllib.request
from collections import Counter
from collections.abc import Mapping, Sequence
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
OPPORTUNITY_ID = "ocac-pond-monitoring-26001"
RAW_SHA256 = "b7ff42dfef9c3a12cd043ee0a23394158d9f9800a12407938a07dccd1ee11aef"
BASE_SHA256 = "f1bc41678cd71b0d20cd2432cf579b840af7a52152b72d8c55a5ee129b927afd"
AMENDMENT_SHA256 = "ccbe30fa4f886087bb09d94cf1073fca97e66789957ba2da63c09a5e7fa657a1"
MAX_SECONDS = 420.0
CONTRACT = json.loads((ROOT / "contracts/api-v1.openapi.json").read_text())

class SmokeError(RuntimeError):
    """Report one bounded smoke failure without exposing process output or secrets."""

def runtime_environment(source: Mapping[str, str], offline: bool) -> dict[str, str]:
    """Return a child environment with provider/model credentials always absent."""
    environment = dict(source)
    for name in ("BRIGHT_DATA_API_TOKEN", "BRIGHT_DATA_COLLECTOR_ID", "DEEPSEEK_API_KEY", "OPENAI_API_KEY"):
        environment.pop(name, None)
    if offline:
        for name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
            environment[name] = "http://127.0.0.1:9"
        for name in ("NO_PROXY", "no_proxy"):
            environment[name] = "127.0.0.1,localhost"
    return environment

def require_markers(text: str, markers: Sequence[str], label: str) -> None:
    """Require every literal product marker in one response body."""
    missing = [marker for marker in markers if marker not in text]
    if missing: raise SmokeError(f"{label} is missing {len(missing)} required markers")
def stop_process(process: subprocess.Popen[bytes] | None) -> None:
    """Terminate a child process group, escalating after a bounded grace period."""
    if process is None: return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError: return
    if process.poll() is None:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass
    time.sleep(0.1)
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (PermissionError, ProcessLookupError):
        pass
    if process.poll() is None: process.wait(timeout=5)

def _free_port() -> int:
    """Reserve and release one loopback port for immediate child-process use."""
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])
def _start(command: Sequence[str], cwd: Path, environment: Mapping[str, str]) -> subprocess.Popen[bytes]:
    """Start a quiet child in its own process group for deterministic cleanup."""
    return subprocess.Popen(
        list(command), cwd=cwd, env=dict(environment),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True,
    )

def _fetch(url: str) -> tuple[int, str]:
    """Fetch one local URL with a short timeout and return status plus UTF-8 text."""
    request = urllib.request.Request(url, headers={"User-Agent": "BidRadar-Smoke/1"})
    with urllib.request.urlopen(request, timeout=5) as response:
        return response.status, response.read().decode("utf-8")
def _wait(url: str, process: subprocess.Popen[bytes], timeout: float = 45) -> None:
    """Wait boundedly for a 200 local response while detecting early child exit."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None: raise SmokeError("demo process exited before readiness")
        try:
            if _fetch(url)[0] == 200:
                return
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(0.2)
    raise SmokeError("demo readiness deadline expired")

def _json_data(url: str, label: str, schema_name: str) -> dict[str, object]:
    """Fetch one 200 JSON envelope, validate it, and return its data object."""
    status, text = _fetch(url)
    if status != 200: raise SmokeError(f"{label} returned an unexpected status")
    payload = json.loads(text)
    schemas = CONTRACT["components"]["schemas"]
    validator = Draft202012Validator(CONTRACT, format_checker=FormatChecker())
    if not isinstance(payload, dict) or list(validator.evolve(schema=schemas[schema_name]).iter_errors(payload)): raise SmokeError(f"{label} failed frozen response validation")
    value = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(value, dict): raise SmokeError(f"{label} has an invalid envelope")
    return value
def _object(value: object, label: str) -> dict[str, object]:
    """Return one nested object or fail its structured smoke assertion."""
    if not isinstance(value, dict): raise SmokeError(f"{label} is not an object")
    return value

def verify_api_payloads(opportunities: dict[str, object], proof: dict[str, object], detail: dict[str, object], impact: dict[str, object]) -> None:
    """Assert exact modes, proof correlation, transition, hashes, and authority lineage."""
    items = opportunities.get("items")
    rows = [_object(item, "opportunity row") for item in items] if isinstance(items, list) else []
    recorded = [item for item in rows if item.get("data_mode") == "RECORDED_BRIGHT_DATA_SNAPSHOT"]
    recorded_row = recorded[0] if len(recorded) == 1 else {}
    normalized = _object(proof.get("normalized_record"), "proof normalized record")
    selected = _object(detail.get("opportunity"), "assessed opportunity")
    base = _object(detail.get("base_assessment"), "base assessment")
    amended = _object(detail.get("amended_assessment"), "amended assessment")
    base_document = _object(base.get("document"), "base document")
    amended_document = _object(amended.get("document"), "amended document")
    impact_base = _object(impact.get("base_document"), "impact base document")
    impact_amendment = _object(impact.get("amendment_document"), "impact amendment document")
    statement = _object(impact.get("authority_statement"), "authority statement")
    valid = (
        opportunities.get("total") == 7 and len(rows) == 7
        and Counter(str(item.get("source")) for item in rows) == Counter({"CPPP": 2, "WEST_BENGAL": 2, "NTPC": 2, "ODISHA": 1})
        and Counter(str(item.get("data_mode")) for item in rows) == Counter({"MANUAL_FIXTURE": 6, "RECORDED_BRIGHT_DATA_SNAPSHOT": 1})
        and recorded_row == normalized and recorded_row.get("snapshot_sha256") == RAW_SHA256
        and proof.get("status") == "VERIFIED" and proof.get("data_mode") == "RECORDED_BRIGHT_DATA_SNAPSHOT"
        and proof.get("provider_run_id") == "j_mt0i928kyu57telkk" and proof.get("raw_snapshot_sha256") == RAW_SHA256
        and selected.get("id") == OPPORTUNITY_ID and base.get("recommendation") == "NO_BID"
        and amended.get("recommendation") == "BID" and base.get("unknown_applicable_rule_count") == 0
        and amended.get("unknown_applicable_rule_count") == 0 and base_document.get("sha256") == BASE_SHA256
        and amended_document.get("sha256") == AMENDMENT_SHA256 and impact.get("opportunity_id") == OPPORTUNITY_ID
        and impact.get("base_recommendation") == "NO_BID"
        and impact.get("amended_recommendation") == "BID" and impact.get("authority_change_applied") is True
        and impact_base.get("sha256") == BASE_SHA256 and impact_amendment.get("sha256") == AMENDMENT_SHA256
        and statement.get("actor") == "AUTHORITY" and statement.get("disposition") == "ACCEPTED"
        and statement.get("effective_change") is True and statement.get("replaces_document_id") == base_document.get("id")
    )
    if not valid: raise SmokeError("structured API truth or lineage drift")
def _verify_api(base_url: str) -> None:
    """Verify four API routes, exact provenance, hashes, inventory, and transition."""
    opportunities = _json_data(f"{base_url}/api/v1/opportunities", "opportunities", "OpportunityListEnvelope")
    proof = _json_data(f"{base_url}/api/v1/source-proof", "source proof", "SourceProofViewEnvelope")
    detail = _json_data(f"{base_url}/api/v1/opportunities/{OPPORTUNITY_ID}", "assessment", "AssessmentViewEnvelope")
    impact = _json_data(f"{base_url}/api/v1/opportunities/{OPPORTUNITY_ID}/amendment-impact", "amendment", "AmendmentImpactViewEnvelope")
    verify_api_payloads(opportunities, proof, detail, impact)

def _verify_frontend(base_url: str) -> None:
    """Verify all three rendered routes expose their exact integration markers."""
    routes = (
        ("/", ("Opportunity register", "ODISHA", OPPORTUNITY_ID, RAW_SHA256)),
        (f"/opportunities/{OPPORTUNITY_ID}", ("Odisha Computer Application Centre", "NO_BID", "BID", BASE_SHA256)),
        (f"/opportunities/{OPPORTUNITY_ID}/amendment", ("Amendment impact", "AUTHORITY", "ACCEPTED", BASE_SHA256, AMENDMENT_SHA256)),
    )
    for path, markers in routes:
        status, text = _fetch(f"{base_url}{path}")
        if status != 200: raise SmokeError(f"frontend route returned an unexpected status: {path}")
        require_markers(text, markers, f"frontend route {path}")
def run_smoke(root: Path = ROOT, offline: bool = True, build: bool = True) -> float:
    """Build and smoke both servers, cleaning process groups on every exit path."""
    started = time.monotonic()
    environment = runtime_environment(os.environ, offline)
    backend_process: subprocess.Popen[bytes] | None = None
    frontend_process: subprocess.Popen[bytes] | None = None
    if build and subprocess.run(["pnpm", "build"], cwd=root / "frontend", env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180, check=False).returncode != 0:
        raise SmokeError("frontend production build failed")
    backend_port, frontend_port = _free_port(), _free_port()
    backend_url = f"http://127.0.0.1:{backend_port}"
    frontend_url = f"http://127.0.0.1:{frontend_port}"
    try:
        backend_process = _start(["uv", "run", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", str(backend_port)], root / "backend", environment)
        _wait(f"{backend_url}/health/ready", backend_process)
        frontend_environment = dict(environment)
        frontend_environment["BIDRADAR_API_BASE_URL"] = backend_url
        frontend_process = _start(["pnpm", "start", "--hostname", "127.0.0.1", "--port", str(frontend_port)], root / "frontend", frontend_environment)
        _wait(frontend_url, frontend_process)
        _verify_api(backend_url)
        _verify_frontend(frontend_url)
    finally:
        stop_process(frontend_process)
        stop_process(backend_process)
    elapsed = time.monotonic() - started
    if elapsed >= MAX_SECONDS: raise SmokeError("demo smoke exceeded seven minutes")
    return elapsed

def main() -> int:
    """Run normal or proxy-denied offline smoke and print its bounded duration."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("normal", "offline"), default="offline")
    parser.add_argument("--skip-build", action="store_true")
    arguments = parser.parse_args()
    elapsed = run_smoke(offline=arguments.mode == "offline", build=not arguments.skip_build)
    print(f"{arguments.mode} smoke passed in {elapsed:.2f}s with provider/model credentials absent")
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
