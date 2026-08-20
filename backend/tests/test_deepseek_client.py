"""Runtime DeepSeek client tests."""

import json
from hashlib import sha256

import pytest
from extraction_helpers import document, proposed

from backend.deepseek_client import FLASH_MODEL, PRO_MODEL, DeepSeekClient
from backend.extraction import verify_extraction
from backend.extraction_requests import INSTRUCTIONS


class FakeUsage:
    def __init__(self): self.prompt_tokens=123; self.completion_tokens=456; self.total_tokens=579
class FakeMessage:
    def __init__(self, content, refusal=None): self.content=content; self.refusal=refusal
class FakeChoice:
    def __init__(self, message, finish_reason=None): self.message=message; self.finish_reason=finish_reason
class FakeResponse:
    def __init__(self, choices, usage=None): self.choices=choices; self.usage=usage or FakeUsage()
class FakeCompletions:
    def __init__(self, queue): self.queue=list(queue); self.calls=[]
    def create(self, **kwargs):
        self.calls.append(kwargs)
        item=self.queue.pop(0)
        if isinstance(item, Exception): raise item
        return item
class FakeChat:
    def __init__(self, completions): self.completions=completions
class FakeClient:
    def __init__(self, completions): self.chat=FakeChat(completions)

def valid_json(): return json.dumps(proposed().model_dump(mode="json"))
def fake_success(): return FakeResponse([FakeChoice(FakeMessage(valid_json()))])

def test_flash_and_pro_models():
    """Routine flash and reviewed pro fallback are valid."""
    c1=DeepSeekClient(model=FLASH_MODEL, client=FakeClient(FakeCompletions([fake_success()])))
    c2=DeepSeekClient(model=PRO_MODEL, client=FakeClient(FakeCompletions([fake_success()])))
    assert c1.model==FLASH_MODEL and c2.model==PRO_MODEL
    with pytest.raises(ValueError): DeepSeekClient(model="deepseek-chat", client=FakeClient(FakeCompletions([])))

def test_json_mode_temp_tokens_no_tools_no_credentials():
    """JSON mode, deterministic temp, bounded tokens, no tools, no credentials."""
    comps=FakeCompletions([fake_success()])
    client=DeepSeekClient(model=FLASH_MODEL, api_key="secret-123", client=FakeClient(comps))
    env=client.extract(document().pages)
    assert env.output is not None
    call=comps.calls[0]
    assert call["temperature"]==0.0 and call["max_tokens"]==4096 and call["response_format"]=={"type":"json_object"}
    assert call.get("tools",[])==[] or "tools" not in call
    assert "secret-123" not in json.dumps(call["messages"])

def test_refusal():
    """Provider refusal maps to envelope refusal."""
    comps=FakeCompletions([FakeResponse([FakeChoice(FakeMessage(None, refusal="refused"))])])
    env=DeepSeekClient(client=FakeClient(comps)).extract(document().pages)
    assert env.refusal=="refused" and env.output is None

def test_empty_retried_then_failed():
    """Empty content retried then fails."""
    comps=FakeCompletions([FakeResponse([FakeChoice(FakeMessage(""))]),FakeResponse([FakeChoice(FakeMessage("   "))]),FakeResponse([FakeChoice(FakeMessage(None))])])
    env=DeepSeekClient(max_retries=2, client=FakeClient(comps)).extract(document().pages)
    assert env.failure_code=="EMPTY_CONTENT" and len(comps.calls)==3

def test_empty_recovers():
    """Empty then valid recovers."""
    comps=FakeCompletions([FakeResponse([FakeChoice(FakeMessage(""))]), fake_success()])
    env=DeepSeekClient(max_retries=2, client=FakeClient(comps)).extract(document().pages)
    assert env.output is not None and len(comps.calls)==2

def test_malformed_retried_and_exhausted():
    """Malformed JSON retried and exhausted."""
    comps=FakeCompletions([FakeResponse([FakeChoice(FakeMessage("{bad"))]), fake_success()])
    env=DeepSeekClient(max_retries=2, client=FakeClient(comps)).extract(document().pages)
    assert env.output is not None
    comps2=FakeCompletions([FakeResponse([FakeChoice(FakeMessage("{bad"))])]*3)
    env2=DeepSeekClient(max_retries=2, client=FakeClient(comps2)).extract(document().pages)
    assert env2.failure_code=="MALFORMED_JSON"

def test_truncated_retried():
    """Truncated length finish retried."""
    comps=FakeCompletions([FakeResponse([FakeChoice(FakeMessage(valid_json()), finish_reason="length")]), fake_success()])
    env=DeepSeekClient(max_retries=2, client=FakeClient(comps)).extract(document().pages)
    assert env.output is not None

def test_extra_keys_not_retried():
    """Extra keys cause schema failure without retry."""
    data=json.loads(valid_json()); data["extra"]="x"
    comps=FakeCompletions([FakeResponse([FakeChoice(FakeMessage(json.dumps(data)))])])
    env=DeepSeekClient(max_retries=2, client=FakeClient(comps)).extract(document().pages)
    assert env.failure_code=="SCHEMA_VALIDATION_FAILED" and len(comps.calls)==1

def test_timeout_not_retried():
    """Timeout maps to TIMEOUT without retry."""
    err=type("APITimeoutError",(Exception,),{})("timeout"); err.__class__.__name__="APITimeoutError"
    comps=FakeCompletions([err])
    env=DeepSeekClient(max_retries=2, client=FakeClient(comps)).extract(document().pages)
    assert env.failure_code=="TIMEOUT" and len(comps.calls)==1

def test_rate_limit_not_retried():
    """Rate limit maps to RATE_LIMITED."""
    err=type("RateLimitError",(Exception,),{})("rate limit"); err.__class__.__name__="RateLimitError"
    comps=FakeCompletions([err])
    env=DeepSeekClient(max_retries=2, client=FakeClient(comps)).extract(document().pages)
    assert env.failure_code=="RATE_LIMITED"

def test_prompt_injection_as_data_no_tools():
    """Injection stays as data, no tools sent."""
    comps=FakeCompletions([fake_success()])
    env=DeepSeekClient(client=FakeClient(comps)).extract(document().pages)
    assert env.output is not None
    assert comps.calls[0].get("tools",[])==[] or "tools" not in comps.calls[0]

def test_persist_hashes_tokens():
    """Success persists prompt, schema, model hashes and tokens."""
    comps=FakeCompletions([FakeResponse([FakeChoice(FakeMessage(valid_json()))], usage=FakeUsage())])
    client=DeepSeekClient(client=FakeClient(comps))
    env=client.extract(document().pages)
    assert env.prompt_sha256==sha256(INSTRUCTIONS.encode()).hexdigest()
    assert env.prompt_version=="ocac-v1" and env.schema_version=="rules-v1" and env.model==FLASH_MODEL
    assert client.last_prompt_sha256==sha256(INSTRUCTIONS.encode()).hexdigest()
    assert client.last_request_sha256 and len(client.last_request_sha256)==64
    assert client.last_output_digest and len(client.last_output_digest)==64
    assert client.last_usage["prompt_tokens"]==123

def test_excerpt_location_verified():
    """Extraction output verifies excerpt location."""
    comps=FakeCompletions([fake_success()])
    env=DeepSeekClient(client=FakeClient(comps)).extract(document().pages)
    assert env.output is not None
    verified=verify_extraction(document(), env.output)
    assert verified.extraction_state=="EVIDENCE_VERIFIED"
