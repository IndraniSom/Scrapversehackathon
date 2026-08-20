"""Filesystem atomicity tests for staged and published source artifacts."""

import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

import backend.source_storage as storage
from backend.source_storage import StorageError, atomic_install


def test_atomic_install_deduplicates_exact_content_concurrently(tmp_path: Path) -> None:
    """Concurrent identical installs expose one complete immutable target."""
    content = b'[{"stable":"bytes"}]'
    with ThreadPoolExecutor(max_workers=8) as pool:
        paths = list(
            pool.map(lambda _: atomic_install(tmp_path, "capture.json", content), range(8))
        )

    assert set(paths) == {tmp_path / "capture.json"}
    assert paths[0].read_bytes() == content
    assert list(tmp_path.glob(".*.tmp")) == []


def test_atomic_install_cleans_temp_after_short_write(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A verified short write publishes nothing and leaves no temporary residue."""

    def write_prefix(file_descriptor: int, content: bytes) -> None:
        """Simulate a successful-looking write that stores only a byte prefix."""
        os.write(file_descriptor, content[:3])

    monkeypatch.setattr(storage, "_write_all", write_prefix)
    with pytest.raises(StorageError, match="temporary content verification failed"):
        atomic_install(tmp_path, "capture.json", b"complete")

    assert not (tmp_path / "capture.json").exists()
    assert list(tmp_path.iterdir()) == []


def test_atomic_install_cleans_temp_after_interruption(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An interruption during install propagates without target or temporary residue."""

    def interrupt_link(_: Path, __: Path) -> None:
        """Interrupt after the verified temporary file is fully durable."""
        raise KeyboardInterrupt

    monkeypatch.setattr(storage.os, "link", interrupt_link)
    with pytest.raises(KeyboardInterrupt):
        atomic_install(tmp_path, "capture.json", b"complete")

    assert not (tmp_path / "capture.json").exists()
    assert list(tmp_path.iterdir()) == []


def test_atomic_install_rejects_different_existing_bytes(tmp_path: Path) -> None:
    """A filename collision never overwrites previously published immutable bytes."""
    atomic_install(tmp_path, "capture.json", b"first")
    with pytest.raises(StorageError, match="immutable target collision"):
        atomic_install(tmp_path, "capture.json", b"second")
    assert (tmp_path / "capture.json").read_bytes() == b"first"
