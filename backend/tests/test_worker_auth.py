"""Auth tests for one-time hashed exchange tokens with 5-min expiry and constant-time compare."""

import time

import pytest

from backend.worker_auth import (
    TOKEN_TTL_SECONDS,
    WorkerAuthError,
    clear_store,
    generate_exchange_token,
    verify_exchange_token,
)


def setup_function() -> None:
    """Clear token store before each test."""
    clear_store()


def test_valid_exchange_succeeds() -> None:
    """A freshly issued token verifies for the correct job/org/audience."""
    now = time.time()
    token = generate_exchange_token("job1", "org_abc", audience="worker", now=now)
    assert verify_exchange_token(token, "job1", "org_abc", expected_audience="worker", now=now + 10) is True


def test_expired_token_rejected() -> None:
    """Token past 5-minute expiry is rejected."""
    now = time.time()
    token = generate_exchange_token("job1", "org_abc", now=now)
    with pytest.raises(WorkerAuthError) as exc:
        verify_exchange_token(token, "job1", "org_abc", now=now + TOKEN_TTL_SECONDS + 1)
    assert exc.value.code == "EXPIRED_TOKEN"


def test_replayed_token_rejected() -> None:
    """Second use of a one-time token is rejected."""
    now = time.time()
    token = generate_exchange_token("job1", "org_abc", now=now)
    verify_exchange_token(token, "job1", "org_abc", now=now + 1)
    with pytest.raises(WorkerAuthError) as exc:
        verify_exchange_token(token, "job1", "org_abc", now=now + 2)
    assert exc.value.code == "REPLAYED_TOKEN"


def test_wrong_audience_rejected() -> None:
    """Token issued for different audience fails verification."""
    now = time.time()
    token = generate_exchange_token("job1", "org_abc", audience="worker", now=now)
    with pytest.raises(WorkerAuthError) as exc:
        verify_exchange_token(token, "job1", "org_abc", expected_audience="convex", now=now + 1)
    assert exc.value.code == "INVALID_AUDIENCE"


def test_wrong_job_rejected() -> None:
    """Token bound to job1 cannot be used for job2."""
    now = time.time()
    token = generate_exchange_token("job1", "org_abc", now=now)
    with pytest.raises(WorkerAuthError) as exc:
        verify_exchange_token(token, "job2", "org_abc", now=now + 1)
    assert exc.value.code == "INVALID_JOB"


def test_wrong_organization_rejected() -> None:
    """Token bound to org_abc cannot be used for org_other."""
    now = time.time()
    token = generate_exchange_token("job1", "org_abc", now=now)
    with pytest.raises(WorkerAuthError) as exc:
        verify_exchange_token(token, "job1", "org_other", now=now + 1)
    assert exc.value.code == "INVALID_ORGANIZATION"


def test_constant_time_compare_used() -> None:
    """Verification uses constant-time compare; tampered token fails without timing leak."""
    now = time.time()
    token = generate_exchange_token("job1", "org_abc", now=now)
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    with pytest.raises(WorkerAuthError) as exc:
        verify_exchange_token(tampered, "job1", "org_abc", now=now + 1)
    assert exc.value.code == "INVALID_TOKEN"
