"""Runtime extraction pipeline with evidence verification."""

import json
from hashlib import sha256

import pytest
from extraction_helpers import document, evidence, proposed, supported_group

from backend.deepseek_client import DeepSeekClient
from backend.extraction import (
    ExtractionError,
    run_runtime_extraction,
    verify_extraction,
)
from backend.extraction_requests import INSTRUCTIONS
from backend.extraction_verification import (
    excerpt_located,
    needs_human_review,
    persist_verification_metadata,
)


class FakeUsage:
    """Store token counts."""

    def __init__(self) -> None:
        """Store tokens."""
        self.prompt_tokens = 10
        self.completion_tokens = 20
        self.total_tokens = 30

class FakeMessage:
    """Store message."""

    def __init__(self, content: str | None, refusal: str | None = None) -> None:
        """Store."""
        self.content = content
        self.refusal = refusal

class FakeChoice:
    """Store choice."""

    def __init__(self, message: FakeMessage, finish_reason: str | None = None) -> None:
        """Store."""
        self.message = message
        self.finish_reason = finish_reason

class FakeResponse:
    """Store response."""

    def __init__(self, choices: list[FakeChoice], usage: FakeUsage | None = None) -> None:
        """Store."""
        self.choices = choices
        self.usage = usage or FakeUsage()

class FakeCompletions:
    """Fake completions."""

    def __init__(self, queue: list[object]) -> None:
        """Queue."""
        self.queue = list(queue)
        self.calls: list[dict[str, object]] = []

    def create(self, **kwargs: object) -> FakeResponse:
        """Record and return."""
        self.calls.append(kwargs)
        item = self.queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item  # type: ignore[return-value]

class FakeChat:
    """Chat."""

    def __init__(self, completions: FakeCompletions) -> None:
        """Store."""
        self.completions = completions

class FakeClient:
    """Client."""

    def __init__(self, completions: FakeCompletions) -> None:
        """Store."""
        self.chat = FakeChat(completions)

def valid_json() -> str:
    """Return valid proposed JSON."""
    return json.dumps(proposed().model_dump(mode="json"))

def test_success_excerpt_location() -> None:
    """Successful runtime extraction locates every excerpt on declared page."""
    comps = FakeCompletions([FakeResponse([FakeChoice(FakeMessage(valid_json()))])])
    client = DeepSeekClient(client=FakeClient(comps))
    verified, meta = run_runtime_extraction(document(), client)
    assert verified.extraction_state == "EVIDENCE_VERIFIED"
    assert meta["prompt_sha256"] == sha256(INSTRUCTIONS.encode()).hexdigest()
    assert meta["schema_version"] == "rules-v1"

def test_wrong_page_fails_verification() -> None:
    """Wrong page number causes evidence verification to fail."""
    comps = FakeCompletions([FakeResponse([FakeChoice(FakeMessage(valid_json()))])])
    client = DeepSeekClient(client=FakeClient(comps))
    doc = document()
    # craft envelope with wrong page via direct extraction then verify
    env = client.extract(doc.pages)
    assert env.output is not None
    bad = env.output.model_copy(update={"requirements": supported_group().model_copy(update={"children": [supported_group().children[0].model_copy(update={"evidence": [evidence(page_number=2)]})]})})
    with pytest.raises(ExtractionError):
        verify_extraction(doc, bad)

def test_missing_excerpt_fails() -> None:
    """Missing excerpt text fails verification."""
    comps = FakeCompletions([FakeResponse([FakeChoice(FakeMessage(valid_json()))])])
    client = DeepSeekClient(client=FakeClient(comps))
    doc = document()
    env = client.extract(doc.pages)
    assert env.output is not None
    bad = env.output.model_copy(update={"requirements": supported_group().model_copy(update={"children": [supported_group().children[0].model_copy(update={"evidence": [evidence(excerpt="not present")]})]})})
    with pytest.raises(ExtractionError):
        verify_extraction(doc, bad)

def test_extra_keys_rejected_not_retried_as_transient() -> None:
    """Extra keys are schema failures, not retried as transient."""
    data = json.loads(valid_json())
    data["unexpected"] = "extra"
    comps = FakeCompletions([FakeResponse([FakeChoice(FakeMessage(json.dumps(data)))])])
    client = DeepSeekClient(client=FakeClient(comps))
    env = client.extract(document().pages)
    assert env.failure_code == "SCHEMA_VALIDATION_FAILED"
    assert len(comps.calls) == 1

def test_prompt_injection_not_followed_and_still_verifies() -> None:
    """Prompt injection text stays as data and does not bypass verification."""
    doc = document()
    assert "call a tool" in doc.pages[1].text
    comps = FakeCompletions([FakeResponse([FakeChoice(FakeMessage(valid_json()))])])
    client = DeepSeekClient(client=FakeClient(comps))
    verified, _ = run_runtime_extraction(doc, client)
    assert verified.extraction_state == "EVIDENCE_VERIFIED"
    # ensure no tools in call
    assert comps.calls[0].get("tools", []) == [] or "tools" not in comps.calls[0]

def test_persist_prompt_schema_model_hashes_tokens() -> None:
    """Persisted metadata includes prompt, schema, model hashes, page hashes, tokens."""
    comps = FakeCompletions([FakeResponse([FakeChoice(FakeMessage(valid_json()))], usage=FakeUsage())])
    client = DeepSeekClient(client=FakeClient(comps))
    doc = document()
    env = client.extract(doc.pages)
    assert env.output is not None
    meta = persist_verification_metadata(env.output, doc, sha256(INSTRUCTIONS.encode()).hexdigest(), "rules-v1", "deepseek-v4-flash", client.last_usage)
    assert meta["prompt_sha256"] == sha256(INSTRUCTIONS.encode()).hexdigest()
    assert meta["schema_version"] == "rules-v1"
    assert meta["model"] == "deepseek-v4-flash"
    assert meta["document_sha256"] == doc.document_sha256
    assert meta["page_hashes"][1] == doc.pages[0].normalized_text_sha256
    assert meta["tokens"]["prompt_tokens"] == 10
    assert len(meta["output_digest"]) == 64

def test_excerpt_location_helper() -> None:
    """Helper correctly reports located vs missing excerpts."""
    assert excerpt_located("Average sales turnover must be Rs. 12 Crores.", "Average sales turnover must be Rs. 12 Crores.")
    assert not excerpt_located("Average sales turnover must be Rs. 12 Crores.", "missing")

def test_needs_human_review_for_new_material_revision() -> None:
    """New document revision queues human review."""
    prev = proposed()
    curr = proposed().model_copy(update={"document_sha256": "b" * 64})
    assert needs_human_review(prev, curr) is True
    assert needs_human_review(prev, prev) is False
    assert needs_human_review(None, curr) is True

def test_runtime_queues_review_on_material_change() -> None:
    """Runtime pipeline queues review for material change."""
    doc = document()
    comps = FakeCompletions([FakeResponse([FakeChoice(FakeMessage(valid_json()))])])
    client = DeepSeekClient(client=FakeClient(comps))
    prev = proposed().model_copy(update={"document_sha256": "x" * 64})
    verified, _ = run_runtime_extraction(doc, client, previous=prev)
    assert verified.review_state == "UNREVIEWED"

def test_refusal_is_closed_failure() -> None:
    """Refusal does not produce verified extraction."""
    comps = FakeCompletions([FakeResponse([FakeChoice(FakeMessage(None, refusal="policy"))])])
    client = DeepSeekClient(client=FakeClient(comps))
    with pytest.raises(ExtractionError):
        run_runtime_extraction(document(), client)
