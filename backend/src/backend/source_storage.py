"""Atomic immutable-file installation for source capture artifacts."""

import os
import tempfile
from hashlib import sha256
from pathlib import Path


class StorageError(OSError):
    """Report a safe immutable-storage integrity failure."""


def _write_all(file_descriptor: int, content: bytes) -> None:
    """Write every content byte or raise on a non-progressing descriptor."""
    view = memoryview(content)
    written = 0
    while written < len(view):
        count = os.write(file_descriptor, view[written:])
        if count <= 0:
            raise StorageError("temporary write made no progress")
        written += count


def atomic_install(directory: Path, filename: str, content: bytes) -> Path:
    """Durably install exact bytes without exposing or overwriting a partial target."""
    if not filename or Path(filename).name != filename:
        raise StorageError("target filename must be a basename")
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / filename
    descriptor, temporary_name = tempfile.mkstemp(
        dir=directory, prefix=f".{filename}.", suffix=".tmp"
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as file:
            _write_all(file.fileno(), content)
            file.flush()
            os.fsync(file.fileno())
        if (
            temporary.stat().st_size != len(content)
            or sha256(temporary.read_bytes()).digest() != sha256(content).digest()
        ):
            raise StorageError("temporary content verification failed")
        try:
            os.link(temporary, target)
            _sync_directory(directory)
        except FileExistsError:
            if target.read_bytes() != content:
                raise StorageError("immutable target collision") from None
        return target
    finally:
        temporary.unlink(missing_ok=True)


def _sync_directory(directory: Path) -> None:
    """Persist a newly installed directory entry before reporting success."""
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
