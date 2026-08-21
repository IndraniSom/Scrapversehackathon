"""Runtime DeepSeek extraction with JSON mode and bounded retries."""

import json
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any

from pydantic import ValidationError

from backend.contracts.extraction import ExtractionEnvelope, ProposedExtraction
from backend.documents import PageText
from backend.extraction_requests import INSTRUCTIONS

FLASH_MODEL = "deepseek-v4-flash"
PRO_MODEL = "deepseek-v4-pro"
TEMPERATURE = 0.0
MAX_TOKENS = 4096
MAX_RETRIES = 2
class DeepSeekClientError(ValueError):
    """Report a safe DeepSeek failure."""
    def __init__(self, code: str) -> None:
        """Store a safe failure code."""
        super().__init__(code)
        self.code = code
def _example() -> dict[str, Any]:
    """Return a minimal closed example for JSON mode."""
    return {
        "document_sha256": "a" * 64,
        "processed_page_numbers": [1],
        "revision": 1,
        "extraction_state": "PROPOSED",
        "review_state": "UNREVIEWED",
        "requirements": {
            "node_type": "GROUP",
            "id": "root",
            "operator": "ALL",
            "minimum_matches": None,
            "children": [
                {
                    "node_type": "LEAF",
                    "id": "turnover",
                    "kind": "TURNOVER_AVERAGE",
                    "title": "Average IT turnover",
                    "hardness": "HARD",
                    "predicate": {
                        "kind": "TURNOVER_AVERAGE",
                        "required_financial_years": ["2022-23", "2023-24", "2024-25"],
                        "minimum_average_inr": "120000000.00",
                        "audited_only": True,
                        "legal_entity_scope": "BIDDER_ONLY",
                    },
                    "evidence": [
                        {
                            "physical_page_number": 1,
                            "printed_page_label": "18",
                            "section_heading": "Turn Over",
                            "excerpt": "Average sales turnover must be Rs. 12 Crores.",
                        }
                    ],
                }
            ],
        },
        "authority_statement": None,
    }


def _messages(pages: list[PageText]) -> list[dict[str, str]]:
    """Build system and user messages with untrusted pages as data."""
    schema = ProposedExtraction.model_json_schema()
    system = f"{INSTRUCTIONS}\nSchema:{json.dumps(schema, sort_keys=True)}\nExample:{json.dumps(_example(), sort_keys=True)}"
    user = "\n\n".join(f"[Page {p.physical_page_number}]\n{p.text}" for p in pages)
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]
def _fail(code: str) -> ExtractionEnvelope:
    """Return a closed failure envelope."""
    return ExtractionEnvelope(request_sha256="b"*64, provider="DEEPSEEK", model=FLASH_MODEL, prompt_version="ocac-v1", prompt_sha256=sha256(INSTRUCTIONS.encode()).hexdigest(), schema_version="rules-v1", generated_at=datetime.now(UTC), output=None, refusal=None, failure_code=code)
def _refusal(text: str) -> ExtractionEnvelope:
    """Return a closed refusal envelope."""
    return ExtractionEnvelope(request_sha256="b"*64, provider="DEEPSEEK", model=FLASH_MODEL, prompt_version="ocac-v1", prompt_sha256=sha256(INSTRUCTIONS.encode()).hexdigest(), schema_version="rules-v1", generated_at=datetime.now(UTC), output=None, refusal=text, failure_code=None)


class DeepSeekClient:
    """Call DeepSeek with JSON mode, deterministic temp, bounded tokens, no tools."""

    def __init__(
        self,
        model: str = FLASH_MODEL,
        api_key: str | None = None,
        timeout: float = 30.0,
        max_retries: int = MAX_RETRIES,
        client: Any | None = None,
    ) -> None:
        """Configure model and retry budget without persisting secrets."""
        if model not in (FLASH_MODEL, PRO_MODEL):
            raise DeepSeekClientError("INVALID_MODEL")
        self.model = model
        self.timeout = timeout
        self.max_retries = max_retries
        self._api_key = api_key
        self.last_usage: dict[str, Any] | None = None
        self.last_prompt_sha256: str | None = None
        self.last_request_sha256: str | None = None
        self.last_output_digest: str | None = None
        if client is not None:
            self._client = client
        else:
            try:
                from openai import OpenAI

                self._client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com", timeout=timeout)
            except Exception as error:
                raise DeepSeekClientError("CLIENT_INIT_FAILED") from error

    def extract(self, pages: list[PageText]) -> ExtractionEnvelope:
        """Return one envelope after retrying only empty/malformed content."""
        prompt_sha = sha256(INSTRUCTIONS.encode()).hexdigest()
        self.last_prompt_sha256 = prompt_sha
        msgs = _messages(pages)
        if self._api_key and self._api_key in json.dumps(msgs):
            raise DeepSeekClientError("CREDENTIALS_IN_PROMPT")
        attempt = 0
        while attempt <= self.max_retries:
            try:
                resp = self._client.chat.completions.create(
                    model=self.model,
                    messages=msgs,
                    temperature=TEMPERATURE,
                    max_tokens=MAX_TOKENS,
                    response_format={"type": "json_object"},
                    timeout=self.timeout,
                )
            except Exception as error:
                name = error.__class__.__name__
                msg = str(error).lower()
                if name == "APITimeoutError" or "timeout" in msg:
                    return _fail("TIMEOUT")
                if name == "RateLimitError" or ("rate" in msg and "limit" in msg):
                    return _fail("RATE_LIMITED")
                return _fail("PROVIDER_ERROR")
            choice = resp.choices[0]
            refusal = getattr(choice.message, "refusal", None)
            if refusal:
                return _refusal(str(refusal))
            if getattr(choice, "finish_reason", None) == "content_filter":
                return _refusal("content_filter")
            content = choice.message.content
            if not content or not content.strip():
                attempt += 1
                if attempt > self.max_retries:
                    return _fail("EMPTY_CONTENT")
                continue
            if getattr(choice, "finish_reason", None) == "length":
                attempt += 1
                if attempt > self.max_retries:
                    return _fail("TRUNCATED_JSON")
                continue
            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                attempt += 1
                if attempt > self.max_retries:
                    return _fail("MALFORMED_JSON")
                continue
            try:
                proposed = ProposedExtraction.model_validate(data)
            except ValidationError:
                return _fail("SCHEMA_VALIDATION_FAILED")
            usage = getattr(resp, "usage", None)
            out_digest = sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
            req_sha = sha256(json.dumps({"pages": [p.model_dump(mode="json") for p in pages], "prompt_sha": prompt_sha}, sort_keys=True).encode()).hexdigest()
            self.last_usage = {
                "prompt_tokens": getattr(usage, "prompt_tokens", None) if usage else None,
                "completion_tokens": getattr(usage, "completion_tokens", None) if usage else None,
                "total_tokens": getattr(usage, "total_tokens", None) if usage else None,
            }
            self.last_request_sha256 = req_sha
            self.last_output_digest = out_digest
            return ExtractionEnvelope(
                request_sha256=req_sha,
                provider="DEEPSEEK",
                model=self.model,
                prompt_version="ocac-v1",
                prompt_sha256=prompt_sha,
                schema_version="rules-v1",
                generated_at=datetime.now(UTC),
                output=proposed,
                refusal=None,
                failure_code=None,
            )
        return _fail("EMPTY_CONTENT")
