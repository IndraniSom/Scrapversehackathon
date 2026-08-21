"""Signed worker API for cited tender Q&A and executive briefs."""

import hashlib
import hmac
import json
import os
import re
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from backend.tender_brief import BriefCitation, build_brief
from backend.tender_qa import AnswerParagraph, Citation, RetrievedChunk, build_answer

router = APIRouter()


class IntelligenceRequest(BaseModel):
    """Closed signed request for one tenant and opportunity."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    kind: Literal["qa", "brief", "translation"]
    organizationId: str = Field(min_length=1)
    opportunityId: str = Field(min_length=1)
    question: str | None = None
    language: str | None = None
    chunks: list[RetrievedChunk]


def _verify(body: bytes, signature: str | None, secret: str | None) -> bool:
    """Verify exact-body worker HMAC in constant time."""
    if not signature or not secret:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


def _citation(chunk: RetrievedChunk) -> Citation:
    """Build one exact citation from an authorized chunk."""
    return Citation(
        chunk_id=chunk.chunk_id,
        document_id=chunk.document_id,
        page_number=chunk.page_number,
        document_hash=chunk.document_hash,
    )


def _answer(payload: IntelligenceRequest) -> dict[str, object]:
    """Build extractive cited answer or explicit abstention."""
    question = payload.question or ""
    terms = {term for term in re.findall(r"[a-z0-9]+", question.lower()) if len(term) >= 3}
    supporting = next(
        (chunk for chunk in payload.chunks if any(term in chunk.text.lower() for term in terms)),
        None,
    )
    paragraphs = None if supporting is None else [
        AnswerParagraph(text=supporting.text, citations=[_citation(supporting)])
    ]
    return build_answer(
        payload.organizationId,
        payload.opportunityId,
        question,
        payload.chunks,
        paragraphs,
        model_name="extractive-evidence-v1",
    ).model_dump(mode="json")


def _brief(payload: IntelligenceRequest) -> dict[str, object]:
    """Build minimal cited brief while abstaining on unavailable facts."""
    first = payload.chunks[0] if payload.chunks else None
    citations = [] if first is None else [BriefCitation(**_citation(first).model_dump())]
    return build_brief(
        payload.organizationId,
        payload.opportunityId,
        payload.chunks,
        first.text if first else None,
        citations,
        None,
        [],
        None,
        [],
        None,
        [],
        None,
        [],
        None,
        [],
        None,
        [],
        None,
        [],
        None,
        [],
    ).model_dump(mode="json")


@router.post("/internal/v1/tender-intelligence")
async def tender_intelligence(
    request: Request,
    worker_signature: str | None = Header(default=None, alias="X-Worker-Signature"),
) -> dict[str, object]:
    """Return verified intelligence without crossing supplied tenant chunks."""
    body = await request.body()
    if not _verify(body, worker_signature, os.getenv("BIDRADAR_WORKER_HMAC_SECRET")):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED"})
    try:
        payload = IntelligenceRequest.model_validate(json.loads(body))
    except (json.JSONDecodeError, ValidationError) as error:
        raise HTTPException(status_code=422, detail={"code": "INVALID_INTELLIGENCE_INPUT"}) from error
    if payload.kind == "translation":
        raise HTTPException(status_code=422, detail={"code": "TRANSLATION_PROVIDER_REQUIRED"})
    try:
        result = _answer(payload) if payload.kind == "qa" else _brief(payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail={"code": str(error)}) from error
    return {"kind": payload.kind, "result": result}
