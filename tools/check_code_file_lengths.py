"""Enforce the repository's below-200-line policy for authored code files."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

CODE_SUFFIXES = frozenset({".js", ".mjs", ".py", ".ts", ".tsx"})
EXCLUDED_PARTS = frozenset(
    {
        ".git",
        ".mypy_cache",
        ".next",
        ".pytest_cache",
        ".ruff_cache",
        ".venv",
        "__pycache__",
        "coverage",
        "node_modules",
        "out",
    }
)
EXCLUDED_PATHS = (
    ("backend", "data", "generated"),
    ("backend", "data", "preparation"),
    ("backend", "data", "private-demo"),
    ("backend", "data", "snapshots"),
)


@dataclass(frozen=True, slots=True)
class Violation:
    """Describe a code file whose physical line count exceeds the policy limit."""

    path: Path
    line_count: int


def _is_excluded(path: Path) -> bool:
    """Return whether a path belongs to dependencies, caches, or generated data."""
    if EXCLUDED_PARTS.intersection(path.parts):
        return True
    return any(
        excluded == path.parts[index : index + len(excluded)]
        for excluded in EXCLUDED_PATHS
        for index in range(len(path.parts) - len(excluded) + 1)
    )


def _iter_code_files(paths: Sequence[Path]) -> Iterable[Path]:
    """Yield unique supported files from explicit files or recursively scanned roots."""
    discovered: set[Path] = set()
    for candidate in paths:
        if candidate.is_file():
            files = (candidate,)
        elif candidate.is_dir():
            files = candidate.rglob("*")
        else:
            raise FileNotFoundError(candidate)
        for file_path in files:
            if (
                file_path.is_file()
                and file_path.suffix in CODE_SUFFIXES
                and not _is_excluded(file_path)
            ):
                discovered.add(file_path)
    yield from sorted(discovered)


def check_paths(paths: Sequence[Path], limit: int = 199) -> list[Violation]:
    """Return deterministic violations for code files with more than ``limit`` lines."""
    if limit < 0:
        raise ValueError("limit must be non-negative")
    violations = []
    for file_path in _iter_code_files(paths):
        line_count = len(file_path.read_text(encoding="utf-8").splitlines())
        if line_count > limit:
            violations.append(Violation(path=file_path, line_count=line_count))
    return violations


def main() -> int:
    """Scan the repository root and print each violation for command-line use."""
    repository_root = Path(__file__).resolve().parents[1]
    violations = check_paths([repository_root])
    for violation in violations:
        relative_path = violation.path.relative_to(repository_root)
        print(f"{relative_path}: {violation.line_count} lines (maximum: 199)")
    return 1 if violations else 0


if __name__ == "__main__":
    raise SystemExit(main())
