"""Working translations preserving anchors and labeling machine output."""

import re

from pydantic import BaseModel, ConfigDict, Field

NON_AUTHORITATIVE_LABEL = "Machine translation — non-authoritative, original text prevails"
SUPPORTED_LANGS = {"en", "hi", "bn", "te", "ta", "mr", "gu", "kn", "ml"}

_NUMBER = re.compile(r"\d[\d,]*\.?\d*")
_CURRENCY = re.compile(r"(₹|Rs\.?|INR|\$|USD|crore|lakh)", re.IGNORECASE)
_DATE = re.compile(r"\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}")
_REFERENCE = re.compile(r"[A-Z]{2,}[-\/][0-9A-Z\-\/]{3,}")
_ANCHOR = re.compile(r"p\d+|para\s*\d+|#\w+", re.IGNORECASE)


class TranslationParagraph(BaseModel):
    """One paragraph pairing original and translated text with source anchor."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    paragraph_id: str = Field(min_length=1)
    original_text: str = Field(min_length=1)
    translated_text: str = Field(min_length=1)
    document_id: str = Field(min_length=1)
    page_number: int = Field(ge=1)
    document_hash: str = Field(min_length=16)
    anchor: str = Field(min_length=1)


class WorkingTranslation(BaseModel):
    """Working translation bundle labeled as non-authoritative machine output."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    organization_id: str = Field(min_length=1)
    opportunity_id: str = Field(min_length=1)
    language: str = Field(min_length=1)
    paragraphs: list[TranslationParagraph] = Field(min_length=1)
    disclaimer: str = Field(min_length=1)
    is_machine_translation: bool = True


def _extract(pattern: re.Pattern[str], text: str) -> set[str]:
    """Return normalized anchor tokens found by a pattern."""
    return {match.group(0).strip() for match in pattern.finditer(text)}


def _preserved(original: str, translated: str) -> list[str]:
    """Check preservation of numbers, dates, currency, references, and anchors."""
    missing: list[str] = []
    for label, pattern in [
        ("numbers", _NUMBER),
        ("dates", _DATE),
        ("currency", _CURRENCY),
        ("references", _REFERENCE),
    ]:
        orig = _extract(pattern, original)
        trans = _extract(pattern, translated)
        if orig - trans:
            missing.append(label)
    if _extract(_ANCHOR, original) - _extract(_ANCHOR, translated) and "anchors" not in missing:
        missing.append("anchors")
    return missing


def validate_translation(paragraph: TranslationParagraph) -> None:
    """Reject translation that drops anchors, numbers, dates, currency, or references."""
    if paragraph.anchor not in paragraph.translated_text and paragraph.anchor not in paragraph.paragraph_id:
        raise ValueError(f"MISSING_ANCHOR: {paragraph.paragraph_id}")
    missing = _preserved(paragraph.original_text, paragraph.translated_text)
    if missing:
        raise ValueError(f"MISSING_ANCHORS: {','.join(missing)} in {paragraph.paragraph_id}")


def build_translation(
    organization_id: str,
    opportunity_id: str,
    language: str,
    paragraphs: list[TranslationParagraph],
    tenant_chunks: list[dict[str, str]] | None = None,
) -> WorkingTranslation:
    """Validate preservation, tenant scope, and label machine output."""
    if language not in SUPPORTED_LANGS:
        raise ValueError("UNSUPPORTED_LANGUAGE")
    if tenant_chunks is not None:
        allowed_docs = {chunk["document_id"] for chunk in tenant_chunks}
        for paragraph in paragraphs:
            if paragraph.document_id not in allowed_docs:
                raise ValueError("CROSS_TENANT_RETRIEVAL")
    for paragraph in paragraphs:
        validate_translation(paragraph)
    return WorkingTranslation(
        organization_id=organization_id,
        opportunity_id=opportunity_id,
        language=language,
        paragraphs=paragraphs,
        disclaimer=NON_AUTHORITATIVE_LABEL,
        is_machine_translation=True,
    )


def needs_review(error: ValueError) -> bool:
    """Return true when a translation error should route to human review."""
    return "MISSING" in str(error)
