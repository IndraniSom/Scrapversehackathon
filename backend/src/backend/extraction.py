"""Public provider-independent extraction orchestration interface."""

from collections.abc import Sequence
from typing import Protocol

from backend.contracts.extraction import (
    ExtractionEnvelope,
    ExtractionRequestArtifact,
    ExtractionRequestConfig,
    ExtractionSelection,
    ProposedExtraction,
    VerifiedExtraction,
)
from backend.documents import PageText, ParsedDocument
from backend.extraction_requests import build_extraction_request
from backend.extraction_verification import (
    EvidenceVerificationError,
    reset_review_for_material_change,
)
from backend.extraction_verification import (
    verify_extraction as _verify_extraction,
)


class ExtractionError(ValueError):
    """Report a safe provider, schema, or evidence verification failure."""


class ExtractionClient(Protocol):
    """Describe a provider-independent tool-free extraction boundary."""

    def extract(self, pages: list[PageText]) -> ExtractionEnvelope:
        """Return one closed response without exposing provider credentials."""


def extract_requirements(
    pages: Sequence[PageText], client: ExtractionClient
) -> ProposedExtraction:
    """Return a closed successful proposal or reject refusal/provider failure."""
    envelope = client.extract(list(pages))
    if envelope.output is None:
        raise ExtractionError("PROVIDER_OUTPUT_UNAVAILABLE")
    return envelope.output


def verify_extraction(
    document: ParsedDocument, proposed: ProposedExtraction
) -> VerifiedExtraction:
    """Expose local verification through the stable extraction error boundary."""
    try:
        return _verify_extraction(document, proposed)
    except EvidenceVerificationError as error:
        raise ExtractionError(str(error)) from error


__all__ = [
    "ExtractionClient",
    "ExtractionEnvelope",
    "ExtractionError",
    "ExtractionRequestArtifact",
    "ExtractionRequestConfig",
    "ExtractionSelection",
    "ProposedExtraction",
    "VerifiedExtraction",
    "build_extraction_request",
    "extract_requirements",
    "reset_review_for_material_change",
    "verify_extraction",
]
