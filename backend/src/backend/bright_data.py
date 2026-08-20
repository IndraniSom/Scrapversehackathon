"""HTTP adapter for Bright Data's two-operation Scraper Studio API."""

from collections.abc import Callable, Mapping, Sequence
from http import HTTPStatus
from time import sleep

import httpx
from pydantic import JsonValue, TypeAdapter, ValidationError

from backend.contracts.source import (
    SnapshotBuilding,
    SnapshotFailure,
    SnapshotPoll,
    SnapshotReady,
    SnapshotRef,
    TriggerResponse,
)

_RECORDS = TypeAdapter(list[dict[str, JsonValue]])


class ProviderRequestError(RuntimeError):
    """Report a safe trigger failure code without provider response content."""

    def __init__(self, code: str) -> None:
        """Store only the non-secret failure classification."""
        super().__init__(code)
        self.code = code


class BrightDataScraperStudioClient:
    """Call a published collector without owning or receiving its API token."""

    def __init__(
        self,
        http: httpx.Client,
        collector_id: str,
        max_attempts: int = 3,
        sleeper: Callable[[float], None] = sleep,
    ) -> None:
        """Bind an authenticated HTTP client and a non-secret collector ID."""
        self._http = http
        self._collector_id = collector_id
        self._max_attempts = max_attempts
        self._sleeper = sleeper

    def trigger(self, inputs: Sequence[Mapping[str, str]]) -> SnapshotRef:
        """Queue validated collector inputs and return the provider snapshot ID."""
        response = self._request(
            "POST",
            "/dca/trigger",
            params={"collector": self._collector_id, "queue_next": "1"},
            json=list(inputs),
        )
        if response is None:
            raise ProviderRequestError("TRANSIENT_RETRIES_EXHAUSTED")
        if response.status_code >= HTTPStatus.BAD_REQUEST:
            raise ProviderRequestError(f"HTTP_{response.status_code}")
        try:
            provider = TriggerResponse.model_validate_json(response.content)
            return SnapshotRef(snapshot_id=provider.collection_id)
        except ValidationError as error:
            raise ProviderRequestError("MALFORMED_RESPONSE") from error

    def fetch(self, snapshot_id: str) -> SnapshotPoll:
        """Fetch one snapshot state while preserving completed response bytes."""
        response = self._request("GET", "/dca/dataset", params={"id": snapshot_id})
        if response is None:
            return SnapshotFailure(code="TRANSIENT_RETRIES_EXHAUSTED")
        if response.status_code >= HTTPStatus.BAD_REQUEST:
            return SnapshotFailure(code=f"HTTP_{response.status_code}")
        try:
            records = _RECORDS.validate_json(response.content)
            return SnapshotReady(records=records, raw_bytes=response.content)
        except ValidationError:
            try:
                return SnapshotBuilding.model_validate_json(response.content)
            except ValidationError:
                return SnapshotFailure(code="MALFORMED_RESPONSE")

    def _request(self, method: str, path: str, **kwargs: object) -> httpx.Response | None:
        """Retry network, rate-limit, and server failures within a fixed budget."""
        for attempt in range(self._max_attempts):
            try:
                response = self._http.request(method, path, **kwargs)
            except httpx.TransportError:
                response = None
            if (
                response is not None
                and response.status_code != HTTPStatus.TOO_MANY_REQUESTS
                and response.status_code < HTTPStatus.INTERNAL_SERVER_ERROR
            ):
                return response
            if attempt + 1 < self._max_attempts:
                self._sleeper(2**attempt)
        return None
