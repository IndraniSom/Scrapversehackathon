"""Opportunity path-converter and hostile route identifier tests."""

import asyncio
import json
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Protocol
from urllib.parse import quote

import pytest
from api_helpers import client_for, copied_demo

AsgiMessage = dict[str, object]


class AsgiApp(Protocol):
    """Describe the narrow ASGI callable used for exact decoded-path tests."""

    def __call__(
        self,
        scope: AsgiMessage,
        receive: Callable[[], Awaitable[AsgiMessage]],
        send: Callable[[AsgiMessage], Awaitable[None]],
    ) -> Awaitable[None]:
        """Handle one ASGI HTTP request."""


@pytest.mark.parametrize(
    "identifier",
    ["with/slash", "with?query", "with#fragment", "with%percent", " with spaces ", " . "],
)
def test_both_typed_routes_retain_contract_valid_hostile_id(
    tmp_path: Path, identifier: str
) -> None:
    """Both endpoints receive one decoded ID including encoded slash and whitespace."""
    encoded = quote(identifier, safe="")
    with client_for(copied_demo(tmp_path)) as client:
        original = client.app.state.bundle.manifest.opportunity_id
        client.app.state.bundle.manifest.opportunity_id = identifier
        try:
            detail = client.get(f"/api/v1/opportunities/{encoded}")
            amendment = client.get(
                f"/api/v1/opportunities/{encoded}/amendment-impact"
            )
        finally:
            client.app.state.bundle.manifest.opportunity_id = original
        assert detail.status_code == 200
        assert "base_assessment" in detail.json()["data"]
        assert amendment.status_code == 200
        assert amendment.json()["data"]["changed_rule_id"] == "turnover-average"


async def call_asgi_path(app: AsgiApp, path: str) -> tuple[int, dict[str, object]]:
    """Call the ASGI router with an exact decoded path, bypassing URL dot cleanup."""
    messages: list[AsgiMessage] = []
    received = False

    async def receive() -> AsgiMessage:
        """Send one empty request body followed by a disconnect."""
        nonlocal received
        if received:
            return {"type": "http.disconnect"}
        received = True
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: AsgiMessage) -> None:
        """Collect ASGI response-start and response-body messages."""
        messages.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [],
        "client": ("127.0.0.1", 1),
        "server": ("testserver", 80),
    }
    await app(scope, receive, send)
    start = next(item for item in messages if item["type"] == "http.response.start")
    body_parts = [
        item.get("body", b"")
        for item in messages
        if item["type"] == "http.response.body"
    ]
    body = b"".join(part for part in body_parts if isinstance(part, bytes))
    return int(start["status"]), json.loads(body)


@pytest.mark.parametrize("identifier", [".", ".."])
@pytest.mark.parametrize("suffix", ["", "/amendment-impact"])
def test_both_routes_reject_exact_dot_segments(
    tmp_path: Path, identifier: str, suffix: str
) -> None:
    """Exact decoded dot segments fail shared OpportunityId validation on both routes."""
    with client_for(copied_demo(tmp_path)) as client:
        status, payload = asyncio.run(
            call_asgi_path(
                client.app,
                f"/api/v1/opportunities/{identifier}{suffix}",
            )
        )
    assert status == 422
    assert payload["error"] == {
        "code": "CONTRACT_VALIDATION_FAILED",
        "message": "Request did not match the API contract.",
    }
