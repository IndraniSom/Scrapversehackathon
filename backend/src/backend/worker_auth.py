"""One-time hashed exchange tokens with 5-minute expiry and constant-time verification."""

import hashlib
import hmac
import secrets
import time

_TOKEN_STORE: dict[str, dict[str, object]] = {}

TOKEN_TTL_SECONDS = 300


class WorkerAuthError(ValueError):
    """Report a safe worker authentication failure with a stable code."""

    def __init__(self, code: str, message: str) -> None:
        """Store a stable failure code and human message."""
        super().__init__(message)
        self.code = code


def _hash_token(token: str) -> str:
    """Hash the opaque token for storage using SHA-256.

    Args:
        token: Opaque bearer token.

    Returns:
        Hex-encoded SHA-256 digest; original token is never persisted.
    """
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> float:
    """Return current epoch seconds; isolated for test injection.

    Returns:
        Current time as seconds since epoch.
    """
    return time.time()


def clear_store() -> None:
    """Clear all stored tokens; used only in tests."""
    _TOKEN_STORE.clear()


def generate_exchange_token(
    job_id: str,
    organization_id: str,
    *,
    audience: str = "worker",
    ttl_seconds: int = TOKEN_TTL_SECONDS,
    now: float | None = None,
) -> str:
    """Create a one-time opaque token and store its hash with expiry.

    Args:
        job_id: Job identifier bound to the token.
        organization_id: Tenant owner of the job.
        audience: Expected audience claim.
        ttl_seconds: Time to live in seconds (default 300).
        now: Injectable clock for deterministic tests.

    Returns:
        Opaque token string; only its SHA-256 hash is stored.
    """
    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    expires_at = (now if now is not None else _now()) + ttl_seconds
    _TOKEN_STORE[token_hash] = {
        "jobId": job_id,
        "organizationId": organization_id,
        "audience": audience,
        "expiresAt": expires_at,
        "used": False,
    }
    return token


def verify_exchange_token(
    token: str,
    expected_job_id: str,
    expected_organization_id: str,
    *,
    expected_audience: str = "worker",
    now: float | None = None,
) -> bool:
    """Verify token hash constant-time, expiry, one-time use, and binding.

    Args:
        token: Presented opaque token.
        expected_job_id: Job identifier the token must be bound to.
        expected_organization_id: Tenant the token must belong to.
        expected_audience: Audience claim to match.
        now: Injectable clock for deterministic tests.

    Returns:
        True when the token is valid; never returns False on failure.

    Raises:
        WorkerAuthError: On expired, replayed, or mismatched tokens.
    """
    current = now if now is not None else _now()
    token_hash = _hash_token(token)
    matched_key: str | None = None
    matched_record: dict[str, object] | None = None
    # Constant-time lookup: scan all entries with compare_digest to avoid timing leak.
    for stored_hash, record in list(_TOKEN_STORE.items()):
        is_match = hmac.compare_digest(stored_hash, token_hash)
        if is_match and matched_key is None:
            matched_key = stored_hash
            matched_record = record
    if matched_record is None or matched_key is None:
        raise WorkerAuthError("INVALID_TOKEN", "Token not found.")
    expires_at = float(matched_record["expiresAt"])  # type: ignore[arg-type]
    if current > expires_at:
        _TOKEN_STORE.pop(matched_key, None)
        raise WorkerAuthError("EXPIRED_TOKEN", "Token has expired.")
    if bool(matched_record["used"]):
        raise WorkerAuthError("REPLAYED_TOKEN", "Token already used.")
    stored_audience = str(matched_record["audience"])
    stored_job = str(matched_record["jobId"])
    stored_org = str(matched_record["organizationId"])
    if not hmac.compare_digest(stored_audience, expected_audience):
        raise WorkerAuthError("INVALID_AUDIENCE", "Audience mismatch.")
    if not hmac.compare_digest(stored_job, expected_job_id):
        raise WorkerAuthError("INVALID_JOB", "Job binding mismatch.")
    if not hmac.compare_digest(stored_org, expected_organization_id):
        raise WorkerAuthError("INVALID_ORGANIZATION", "Organization mismatch.")
    matched_record["used"] = True
    return True
