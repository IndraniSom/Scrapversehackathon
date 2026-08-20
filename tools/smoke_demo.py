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
from collections.abc import Mapping, Sequence
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from smoke_assertions import (
    AMENDMENT_SHA256,
    BASE_SHA256,
    OPPORTUNITY_ID,
    RAW_SHA256,
    SmokeAssertionError,
    verify_api_payloads,
)

ROOT = Path(__file__).resolve().parents[1]
MAX_SECONDS = 420.0
CONTRACT = json.loads((ROOT / "contracts/api-v1.openapi.json").read_text())

SmokeError = SmokeAssertionError

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
        (f"/opportunities/{OPPORTUNITY_ID}", ("Odisha Computer Application Centre", "NO_BID", "REVIEW", BASE_SHA256)),
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
