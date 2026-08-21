"""Signed FastAPI endpoint for deterministic runtime eligibility."""

import hashlib
import hmac
import json
import os

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import ValidationError

from backend.runtime_assessment import AssessmentRequest, evaluate_request

router = APIRouter()


def _verified(body: bytes, signature: str | None) -> bool:
    """Verify exact request bytes with configured worker HMAC secret."""
    secret = os.getenv("BIDRADAR_WORKER_HMAC_SECRET")
    if not signature or not secret:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


@router.post("/internal/v1/assessments")
async def create_assessment(request: Request, worker_signature: str | None = Header(default=None, alias="X-Worker-Signature")) -> dict[str, object]:
    """Validate signed tenant inputs and return a closed deterministic result."""
    body = await request.body()
    if not _verified(body, worker_signature):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED"})
    try:
        payload = AssessmentRequest.model_validate(json.loads(body))
    except (json.JSONDecodeError, ValidationError) as error:
        raise HTTPException(status_code=422, detail={"code": "INVALID_ASSESSMENT_INPUT"}) from error
    return evaluate_request(payload).model_dump(mode="json")
