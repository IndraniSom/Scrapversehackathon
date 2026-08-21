"""Closed NTPC provider record contract and deterministic normalization."""

import json
import re
from collections.abc import Mapping
from hashlib import sha256
from urllib.parse import urlsplit

# Hosts permitted for official document fetch and version lineage.
ALLOWED_DOCUMENT_HOSTS = frozenset({
    "www.eprocure.gov.in",
    "eprocure.gov.in",
    "wbtenders.gov.in",
    "www.wbtenders.gov.in",
    "ntpctender.ntpc.co.in",
    "odisha.gov.in",
    "www.odisha.gov.in",
})

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


def stable_source_key(source: str, source_tender_id: str) -> str:
    """Return the stable source key used for deduplication and version lookup."""
    return f"{source}:{source_tender_id}"


def canonical_opportunity_digest(fields: Mapping[str, JsonValue]) -> str:
    """Compute an immutable version digest from canonical normalized fields."""
    canonical = json.dumps(fields, sort_keys=True, separators=(",", ":"))
    return sha256(canonical.encode()).hexdigest()


def opportunity_version_digest(summary: OpportunitySummary, document_hashes: list[str] | None = None) -> str:
    """Derive a version digest covering all fields that should trigger a new version."""
    payload: dict[str, JsonValue] = {
        "authority": summary.authority,
        "canonical_url": summary.canonical_url,
        "category": summary.category,
        "closes_at": summary.closes_at.isoformat() if summary.closes_at else None,
        "document_hashes": sorted(document_hashes or []),
        "published_at": summary.published_at.isoformat() if summary.published_at else None,
        "reference_number": summary.reference_number,
        "source": summary.source,
        "source_tender_id": summary.source_tender_id,
        "title": summary.title,
    }
    return canonical_opportunity_digest(payload)


def should_create_new_version(existing_digest: str | None, new_digest: str) -> bool:
    """Return true only when the digest changes, preserving immutable history."""
    if not existing_digest:
        return True
    return existing_digest != new_digest


def is_allowlisted_document_url(url: str) -> bool:
    """Return true when the URL is credential-free https and host-allowlisted."""
    try:
        parsed = urlsplit(url)
        if parsed.scheme != "https":
            return False
        if parsed.username or parsed.password or parsed.port:
            return False
        if parsed.fragment:
            return False
        return parsed.hostname in ALLOWED_DOCUMENT_HOSTS
    except ValueError:
        return False
