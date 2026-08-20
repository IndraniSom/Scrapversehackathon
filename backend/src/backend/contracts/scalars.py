"""Shared runtime validators with frozen public JSON Schema representations."""

from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BeforeValidator,
    HttpUrl,
    JsonValue,
    StringConstraints,
    TypeAdapter,
    WithJsonSchema,
)


def _validate_https_url(value: str) -> str:
    """Return a normalized credential-free HTTPS URL with a real host."""
    url = TypeAdapter(HttpUrl).validate_python(value)
    if url.scheme != "https" or url.username or url.password:
        raise ValueError("URL must be credential-free HTTPS")
    return str(url)


def _validate_opportunity_id(value: str) -> str:
    """Reject only exact route dot segments without transforming other IDs."""
    if value in {".", ".."}:
        raise ValueError("opportunity ID cannot be a dot segment")
    return value


Sha256 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
HttpsUrl = Annotated[
    str,
    BeforeValidator(_validate_https_url),
    WithJsonSchema({"type": "string", "format": "uri", "pattern": "^https://"}),
]
NonEmpty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
MetadataText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=256)
]
OpportunityId = Annotated[
    str,
    StringConstraints(min_length=1, max_length=160),
    AfterValidator(_validate_opportunity_id),
    WithJsonSchema(
        {
            "type": "string",
            "minLength": 1,
            "maxLength": 160,
            "not": {"enum": [".", ".."]},
        }
    ),
]
DataMode = Literal["LIVE", "RECORDED_BRIGHT_DATA_SNAPSHOT", "MANUAL_FIXTURE"]
JsonObject = Annotated[dict[str, JsonValue], WithJsonSchema({"type": "object"})]
