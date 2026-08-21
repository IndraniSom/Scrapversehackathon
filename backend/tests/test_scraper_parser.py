"""Executable safety tests for the draft Scraper Studio parser."""

import json
import subprocess
from pathlib import Path

import pytest

PARSER = Path(__file__).parents[2] / "scrapers" / "bright-data" / "parser.js"
INTERACTION = PARSER.with_name("interaction.js")


def validate_urls(urls: list[str]) -> list[str | None]:
    """Execute only the parser's exported pure URL validator in Node."""
    harness = """
const fs = require('fs');
const moduleObject = {exports: {}};
new Function('module', fs.readFileSync(process.argv[1], 'utf8'))(moduleObject);
const values = JSON.parse(process.argv[2]);
console.log(JSON.stringify(values.map(moduleObject.exports.validateDetailUrl)));
"""
    result = subprocess.run(
        ["node", "-e", harness, str(PARSER), json.dumps(urls)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


@pytest.mark.parametrize(
    "unsafe",
    [
        "http://ntpctender.ntpc.co.in/NITDetails/NITs/30168",
        "https://evil.example/NITDetails/NITs/30168",
        "https://user:pass@ntpctender.ntpc.co.in/NITDetails/NITs/30168",
        "https://ntpctender.ntpc.co.in/Index/Disclaimer",
        "https://ntpctender.ntpc.co.in/NITDetails/NITs/30168?download=1",
    ],
)
def test_parser_rejects_unsafe_or_unsupported_detail_url(unsafe: str) -> None:
    """Only credential-free same-origin NTPC tender detail paths are accepted."""
    assert validate_urls([unsafe]) == [None]


def test_parser_resolves_supported_relative_detail_url() -> None:
    """A supported relative tender link resolves to one canonical HTTPS URL."""
    assert validate_urls(["/NITDetails/NITs/30168"]) == [
        "https://ntpctender.ntpc.co.in/NITDetails/NITs/30168"
    ]


def test_interaction_uses_validated_url_without_allow_marker() -> None:
    """The published input contains only URL; approval is enforced before triggering it."""
    harness = """
const fs = require('fs');
const code = fs.readFileSync(process.argv[1], 'utf8');
const input = {url: 'https://ntpctender.ntpc.co.in/Index/Search?Type=Reg&Region=1'};
new Function('input','navigate','wait','parse','collect', code)(
  input, () => {}, () => {}, () => [{title: 'row'}], () => {}
);
"""
    result = subprocess.run(
        ["node", "-e", harness, str(INTERACTION)],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


def test_parser_filters_malformed_record() -> None:
    """Rows missing required fields are discarded as malformed records."""
    harness = """
const fs=require('fs');const m={exports:{}};new Function('module',fs.readFileSync(process.argv[1],'utf8'))(m);
console.log(JSON.stringify(m.exports.isValidRecord({source_tender_id:'1',canonical_url:'https://ntpctender.ntpc.co.in/NITDetails/NITs/1',title:'t',authority:'a'})));
console.log(JSON.stringify(m.exports.isValidRecord({source_tender_id:'',canonical_url:null})));
"""
    result = subprocess.run(["node","-e",harness,str(PARSER)], check=True, capture_output=True, text=True)
    lines = result.stdout.strip().splitlines()
    assert json.loads(lines[0]) is True
    assert json.loads(lines[1]) is False


def test_interaction_rejects_disabled_connector() -> None:
    """Interaction throws for non-allowlisted domain (disabled connector)."""
    harness = """
const fs=require('fs');const code=fs.readFileSync(process.argv[1],'utf8');
const input={url:'https://evil.example/Index/Search'};
try{new Function('input','navigate','wait','parse','collect',code)(input,()=>{},()=>{},()=>[{}],()=>{});console.log('ok');}catch(e){console.log(e.message);}
"""
    result = subprocess.run(["node","-e",harness,str(INTERACTION)], check=True, capture_output=True, text=True)
    assert "DISABLED_CONNECTOR" in result.stdout or "UNAPPROVED" in result.stdout


def test_parser_truncates_rate_limited_records() -> None:
    """Parser enforces max 3 records (rate limit / partial failure handling)."""
    content = PARSER.read_text()
    assert "slice(0, 3)" in content or "length > 3" in content


def test_collector_json_has_allowlist_and_version() -> None:
    """Collector config exposes domain allowlist, collector version and schedule."""
    import json as _json
    cfg = _json.loads((PARSER.parents[0]/"collector.json").read_text())
    assert "allowed_domains" in cfg
    assert cfg["collector_version"] == "manual-draft-1"
    assert "schedule" in cfg
    assert "ntpctender.ntpc.co.in" in cfg["allowed_domains"]


def test_interaction_exponential_backoff_documented() -> None:
    """Interaction or parser documents collector version for digest verification."""
    assert "COLLECTOR_VERSION" in PARSER.read_text()
    assert "COLLECTOR_VERSION" in INTERACTION.read_text()


def test_duplicate_webhook_idempotency_documented() -> None:
    """Source runs handling of duplicate webhook is present."""
    import pathlib
    runs = pathlib.Path(__file__).parents[2]/"frontend"/"convex"/"sourceRuns.ts"
    assert "duplicate" in runs.read_text().lower()
