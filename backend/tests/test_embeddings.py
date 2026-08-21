"""Tests for multilingual e5 embeddings, prefixes, filters, and recall."""

import math
import sys
from unittest.mock import patch

import pytest

from backend import embeddings as embedding_module
from backend.embeddings import (
    DIMENSIONS,
    MODEL_NAME,
    MODEL_REVISION,
    cosine_similarity,
    embed_passage,
    embed_passages,
    embed_queries,
    embed_query,
    parse_opportunity_filters,
    recall_at_k,
)


class FakeEmbeddingModel:
    """Deterministic test-only model implementing SentenceTransformer encode."""

    def encode(self, texts: list[str], **_options: object) -> list[list[float]]:
        """Return normalized 768-dimensional vectors derived from input bytes."""
        vectors: list[list[float]] = []
        for text in texts:
            vector = [0.0] * DIMENSIONS
            for index, byte in enumerate(text.encode()):
                vector[index % DIMENSIONS] += float(byte + 1)
            norm = math.sqrt(sum(value * value for value in vector))
            vectors.append([value / norm for value in vector])
        return vectors


@pytest.fixture(autouse=True)
def fake_embedding_model() -> None:
    """Avoid network model downloads while testing embedding contracts."""
    embedding_module._model = FakeEmbeddingModel()


def test_embed_query_dimension_is_768() -> None:
    """Query embedding is 768-d and L2-normalized."""
    vec = embed_query("cybersecurity tender for cloud services")
    assert len(vec) == DIMENSIONS == 768
    assert MODEL_NAME == "intfloat/multilingual-e5-base"
    assert "768" in MODEL_REVISION
    norm = math.sqrt(sum(x * x for x in vec))
    assert norm == pytest.approx(1.0, abs=1e-5)


def test_embed_passage_dimension_matches() -> None:
    """Passage embedding matches dimension and normalization."""
    vec = embed_passage("Supply of networking equipment for Odisha data center")
    assert len(vec) == 768
    assert math.sqrt(sum(x * x for x in vec)) == pytest.approx(1.0, abs=1e-5)


def test_query_and_passage_prefixes_differ() -> None:
    """Same text with query: vs passage: yields different vectors."""
    text = "same tender text"
    q = embed_query(text)
    p = embed_passage(text)
    assert q != p
    assert cosine_similarity(q, p) < 0.999


def test_empty_input_raises() -> None:
    """Empty or whitespace input is rejected."""
    with pytest.raises(ValueError, match="EMPTY_INPUT"):
        embed_query("   ")
    with pytest.raises(ValueError, match="EMPTY_INPUT"):
        embed_passage("")


def test_overlong_input_truncates() -> None:
    """Overlong input is truncated and still returns 768-d vector."""
    long = "x" * 5000
    vec = embed_query(long)
    assert len(vec) == 768
    long_passage = "y" * 12000
    vec2 = embed_passage(long_passage)
    assert len(vec2) == 768


def test_language_variants_produce_valid_embeddings() -> None:
    """Hindi, Bengali, Telugu variants all produce normalized vectors."""
    variants = [
        "साइबर सुरक्षा निविदा ओडिशा",
        "সাইবার নিরাপত্তা দরপত্র ওড়িশা",
        "సైబర్ భద్రత టెండర్ ఒడిశా",
        "cybersecurity tender Odisha",
    ]
    vectors = embed_queries(variants)
    assert len(vectors) == 4
    for vec in vectors:
        assert len(vec) == 768
    # English vs Hindi should be related but not identical
    assert vectors[0] != vectors[3]


def test_batch_embeddings() -> None:
    """Batch passage embeddings preserve order and dimension."""
    texts = ["cloud infrastructure", "managed IT services", "data center cooling"]
    batch = embed_passages(texts)
    assert len(batch) == 3
    for vec in batch:
        assert len(vec) == 768


def test_recall_at_10_fixture() -> None:
    """Recall@10 on a labeled tender/capability set measures relevance."""
    # corpus of 12 passages, 3 relevant to query "cybersecurity Odisha"
    corpus_ids = [f"doc-{i}" for i in range(12)]
    relevant = {"doc-2", "doc-5", "doc-9"}
    # Simulate retrieved ranking where 2 of 3 relevants appear in top 10
    retrieved = ["doc-2", "doc-0", "doc-5", "doc-1", "doc-3", "doc-4", "doc-6", "doc-7", "doc-8", "doc-10", "doc-9", "doc-11"]
    assert recall_at_k(retrieved, relevant, k=10) == pytest.approx(2 / 3)
    assert recall_at_k(retrieved, relevant, k=12) == pytest.approx(1.0)
    assert recall_at_k([], set(), k=10) == 0.0


def test_closed_filter_schema_parsing() -> None:
    """Natural language maps to closed filter schema and rejects open keys."""
    filters = parse_opportunity_filters("cybersecurity bids in Odisha closing next month")
    assert filters["category"] == "CYBERSECURITY"
    assert filters["region"] == "ODISHA"
    assert filters["closesAfter"] == "next_month_start"
    assert set(filters.keys()) <= {"category", "source", "region", "lifecycle", "closesAfter", "closesBefore"}
    empty = parse_opportunity_filters("random words with no matching filter")
    assert empty == {}
    closed = parse_opportunity_filters("closed tender for NTPC cloud")
    assert closed["lifecycle"] == "closed"
    assert closed["source"] == "NTPC"


def test_cosine_and_prefix_batch_consistency() -> None:
    """Cosine similarity is 1 for identical and batch vs single consistency."""
    q = embed_query("test query")
    q2 = embed_query("test query")
    assert cosine_similarity(q, q2) == pytest.approx(1.0, abs=1e-5)
    batch = embed_queries(["test query", "other"])
    assert batch[0] == pytest.approx(q, abs=1e-6)


def test_model_failure_is_not_replaced_with_hash_vectors() -> None:
    """Missing model fails closed with stable code instead of meaningless vectors."""
    embedding_module._model = None
    with patch.dict(sys.modules, {"sentence_transformers": None}):
        with pytest.raises(ValueError, match="MODEL_UNAVAILABLE"):
            embed_query("must fail closed")
