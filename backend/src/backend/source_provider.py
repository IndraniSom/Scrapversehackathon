"""Closed NTPC provider record contract and deterministic normalization."""

import re
from collections.abc import Mapping
from hashlib import sha256
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    TypeAdapter,
    ValidationError,
    field_validator,
)

from backend.contracts.source import (
    HttpsUrl,
    MetadataText,
    OpportunitySummary,
    RawOpportunity,
)


class ProviderRecordError(ValueError):
    """Report an unsupported completed provider response shape."""


class ProviderInput(BaseModel):
    """Represent the exact source URL echoed by the published collector."""

    model_config = ConfigDict(extra="forbid")
    url: HttpsUrl

    @field_validator("url")
    @classmethod
    def validate_published_input(cls, value: str) -> str:
        """Require the exact no-query input used by the published NTPC collector."""
        if value != "https://ntpctender.ntpc.co.in/Index/Search":
            raise ValueError("provider input URL is unsupported")
        return value


class NtpcProviderRecord(BaseModel):
    """Validate the actual closed camelCase NTPC collector output object."""

    model_config = ConfigDict(extra="forbid")
    source_tender_id: MetadataText = Field(alias="sourceTenderId")
    reference_number: MetadataText | None = Field(alias="referenceNumber")
    authority: MetadataText
    title: MetadataText
    canonical_url: HttpsUrl = Field(alias="canonicalUrl")
    input: ProviderInput

    @field_validator("canonical_url")
    @classmethod
    def validate_ntpc_detail_url(cls, value: str) -> str:
        """Require one credential-free NTPC numeric tender-detail URL."""
        parsed = urlsplit(value)
        if (
            parsed.hostname != "ntpctender.ntpc.co.in"
            or parsed.port is not None
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
            or re.fullmatch(r"/NITDetails/NITs/[1-9]\d*", parsed.path) is None
        ):
            raise ValueError("provider canonical URL is unsupported")
        return value


def normalize_provider_record(
    record: Mapping[str, JsonValue], snapshot_hash: str
) -> OpportunitySummary:
    """Map one supported raw provider record to the frozen opportunity summary."""
    provider = NtpcProviderRecord.model_validate(record)
    stable_digest = sha256(provider.source_tender_id.encode()).hexdigest()[:12]
    return OpportunitySummary(
        source="NTPC",
        source_tender_id=provider.source_tender_id,
        reference_number=provider.reference_number,
        authority=provider.authority,
        title=provider.title,
        category="OTHER",
        published_at=None,
        closes_at=None,
        canonical_url=provider.canonical_url,
        id=f"ntpc-{stable_digest}",
        data_mode="RECORDED_BRIGHT_DATA_SNAPSHOT",
        snapshot_sha256=snapshot_hash,
    )


def normalize_supported_record(
    record: Mapping[str, JsonValue], snapshot_hash: str
) -> OpportunitySummary:
    """Normalize the real NTPC object or the legacy canonical collector test shape."""
    try:
        return normalize_provider_record(record, snapshot_hash)
    except ValidationError:
        raw = RawOpportunity.model_validate(record)
        stable_digest = sha256(raw.source_tender_id.encode()).hexdigest()[:12]
        return OpportunitySummary(
            **raw.model_dump(),
            id=f"{raw.source.lower()}-{stable_digest}",
            data_mode="RECORDED_BRIGHT_DATA_SNAPSHOT",
            snapshot_sha256=snapshot_hash,
        )


def decode_provider_records(raw_bytes: bytes) -> list[dict[str, JsonValue]]:
    """Decode one closed object or non-empty supported record array from exact bytes."""
    try:
        value = TypeAdapter(JsonValue).validate_json(raw_bytes)
    except ValidationError as error:
        raise ProviderRecordError("provider response is not JSON") from error
    candidates = value if isinstance(value, list) else [value]
    if not candidates or not all(isinstance(item, dict) for item in candidates):
        raise ProviderRecordError("provider response has no records")
    records = [dict(item) for item in candidates]
    for record in records:
        if not _is_supported_record(record):
            raise ProviderRecordError("provider response contains an unsupported object")
    return records


def _is_supported_record(record: Mapping[str, JsonValue]) -> bool:
    """Return whether one object matches a closed NTPC or canonical record contract."""
    for model in (NtpcProviderRecord, RawOpportunity):
        try:
            model.model_validate(record)
            return True
        except ValidationError:
            continue
    return False
