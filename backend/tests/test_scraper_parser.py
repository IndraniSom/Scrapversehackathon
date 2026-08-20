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
