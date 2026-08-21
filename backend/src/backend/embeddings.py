"""Multilingual embeddings via intfloat/multilingual-e5-base, 768-d normalized vectors."""

import math

MODEL_NAME = "intfloat/multilingual-e5-base"
MODEL_REVISION = "intfloat/multilingual-e5-base:768-v1"
DIMENSIONS = 768
MAX_QUERY_CHARS = 2000
MAX_PASSAGE_CHARS = 8000
ALLOWED_CATEGORIES = {"CLOUD", "CYBERSECURITY", "SOFTWARE", "DATA_CENTER", "MANAGED_IT", "NETWORKING", "ERP", "DEVOPS", "OTHER"}
ALLOWED_SOURCES = {"CPPP", "WEST_BENGAL", "NTPC", "ODISHA"}
ALLOWED_LIFECYCLE = {"open", "closed", "cancelled", "archived"}

_model = None


class EmbeddingError(ValueError):
    """Report stable embedding initialization, inference, or dimension failure."""

    def __init__(self, code: str) -> None:
        """Store one safe embedding failure code."""
        super().__init__(code)
        self.code = code


def _require_text(text: str) -> str:
    """Validate that input contains non-whitespace characters."""
    if not text or not text.strip():
        raise ValueError("EMPTY_INPUT")
    return text.strip()


def _truncate(text: str, limit: int) -> str:
    """Truncate overlong input deterministically to the model limit."""
    return text[:limit] if len(text) > limit else text


def _l2_normalize(vec: list[float]) -> list[float]:
    """L2-normalize a vector to unit length."""
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0:
        return vec
    return [x / norm for x in vec]


def _encode(texts: list[str]) -> list[list[float]]:
    """Encode text using configured model and fail closed on any model error."""
    global _model
    try:
        from sentence_transformers import SentenceTransformer
    except (ImportError, ModuleNotFoundError) as error:
        raise EmbeddingError("MODEL_UNAVAILABLE") from error
    try:
        if _model is None:
            _model = SentenceTransformer(MODEL_NAME)
        vectors = _model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
    except Exception as error:
        raise EmbeddingError("MODEL_INFERENCE_FAILED") from error
    output = [[float(value) for value in vector] for vector in vectors]
    if len(output) != len(texts) or any(len(vector) != DIMENSIONS for vector in output):
        raise EmbeddingError("MODEL_DIMENSION_MISMATCH")
    return output


def embed_query(text: str) -> list[float]:
    """Embed a query with the required query: prefix and truncation."""
    clean = _truncate(_require_text(text), MAX_QUERY_CHARS)
    prefixed = f"query: {clean}"
    return _encode([prefixed])[0]


def embed_passage(text: str) -> list[float]:
    """Embed a passage with the required passage: prefix and truncation."""
    clean = _truncate(_require_text(text), MAX_PASSAGE_CHARS)
    prefixed = f"passage: {clean}"
    return _encode([prefixed])[0]


def embed_queries(texts: list[str]) -> list[list[float]]:
    """Embed multiple queries with prefix and validation."""
    prefixed = [f"query: {_truncate(_require_text(t), MAX_QUERY_CHARS)}" for t in texts]
    return _encode(prefixed)


def embed_passages(texts: list[str]) -> list[list[float]]:
    """Embed multiple passages with prefix and validation."""
    prefixed = [f"passage: {_truncate(_require_text(t), MAX_PASSAGE_CHARS)}" for t in texts]
    return _encode(prefixed)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity of two normalized vectors."""
    return sum(x * y for x, y in zip(a, b))


def recall_at_k(retrieved: list[str], relevant: set[str], k: int = 10) -> float:
    """Compute recall@k for retrieved ids against relevant set."""
    if not relevant:
        return 0.0
    top_k = set(retrieved[:k])
    hits = len(top_k & relevant)
    return hits / len(relevant)


def parse_opportunity_filters(text: str) -> dict:
    """Parse natural language into a closed OpportunityFilters schema."""
    lower = text.lower()
    filters: dict = {}
    for cat in ALLOWED_CATEGORIES:
        if cat.lower().replace("_", " ") in lower or cat.lower() in lower:
            filters["category"] = cat
            break
    for src in ALLOWED_SOURCES:
        if src.lower().replace("_", " ") in lower or src.lower() in lower:
            filters["source"] = src
            break
    if "odisha" in lower:
        filters["region"] = "ODISHA"
    elif "west bengal" in lower or "bengal" in lower:
        filters["region"] = "WEST_BENGAL"
    if "closed" in lower:
        filters["lifecycle"] = "closed"
    elif "open" in lower:
        filters["lifecycle"] = "open"
    elif "cancelled" in lower or "canceled" in lower:
        filters["lifecycle"] = "cancelled"
    if "closing next month" in lower or "next month" in lower:
        filters["closesAfter"] = "next_month_start"
        filters["closesBefore"] = "next_month_end"
    return filters
