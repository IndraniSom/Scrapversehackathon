"""Trusted preparation and demo roots for source capture storage."""

from pathlib import Path

from pydantic import BaseModel, ConfigDict


class StorageBoundaryError(ValueError):
    """Report staging outside the trusted preparation boundary."""


class SourceStorageRoots(BaseModel):
    """Carry trusted roots independently from operator-selected finalization paths."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    preparation_root: Path
    demo_root: Path


def repository_source_roots() -> SourceStorageRoots:
    """Return canonical backend preparation and demo roots derived from this module."""
    backend_root = Path(__file__).resolve().parents[2]
    return SourceStorageRoots(
        preparation_root=backend_root / "data" / "preparation",
        demo_root=backend_root / "data" / "demo",
    )


def validate_staging_directory(
    staging_directory: Path, roots: SourceStorageRoots
) -> Path:
    """Require staging inside trusted preparation and outside trusted demo storage."""
    staging = staging_directory.resolve()
    preparation = roots.preparation_root.resolve()
    demo = roots.demo_root.resolve()
    if staging.is_relative_to(demo) or not staging.is_relative_to(preparation):
        raise StorageBoundaryError("staging must be inside trusted preparation storage")
    return staging
