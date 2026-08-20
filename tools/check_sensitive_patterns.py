"""Scan tracked text for sensitive or dangerous patterns without echoing values."""

import re
import subprocess
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CODE_SUFFIXES = frozenset({".js", ".mjs", ".py", ".ts", ".tsx"})
BINARY_SUFFIXES = frozenset(
    {".ico", ".jpg", ".jpeg", ".pdf", ".png", ".pyc", ".woff", ".woff2"}
)
EXCLUDED_PARTS = frozenset(
    {
        ".git",
        ".mypy_cache",
        ".next",
        ".pytest_cache",
        ".ruff_cache",
        ".venv",
        "__pycache__",
        "node_modules",
    }
)
EXCLUDED_PATHS = (
    ("backend", "data", "private-demo"),
    ("backend", "data", "preparation"),
    ("backend", "data", "generated"),
    ("frontend", "out"),
)
LOCK_NAMES = frozenset({"pnpm-lock.yaml", "uv.lock"})
SECRET_RULES = (
    (
        "AWS_ACCESS_KEY",
        re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    ),
    (
        "OPENAI_API_KEY",
        re.compile(r"(?i)\bOPENAI_API_KEY\s*=\s*['\"]?sk-[A-Za-z0-9_-]{20,}"),
    ),
    (
        "DEEPSEEK_API_KEY",
        re.compile(r"(?im)^[ \t]*DEEPSEEK_API_KEY[ \t]*=[ \t]*['\"]?[^ \t\r\n'\"#][^\r\n]*"),
    ),
    (
        "BRIGHT_DATA_API_TOKEN",
        re.compile(r"(?im)^[ \t]*BRIGHT_DATA_API_TOKEN[ \t]*=[ \t]*['\"]?[^ \t\r\n'\"#][^\r\n]*"),
    ),
    (
        "PRIVATE_KEY",
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    ),
    (
        "BEARER_TOKEN",
        re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~-]{24,}"),
    ),
    (
        "CREDENTIAL_URL",
        re.compile(r"(?i)\b(?:postgres(?:ql)?|mysql|mongodb)://[^\s:/]+:[^\s@]+@"),
    ),
)
CODE_RULES = (
    ("UNSAFE_HTML", re.compile(r"\bdangerouslySetInnerHTML\b")),
    ("DYNAMIC_EVAL", re.compile(r"\b(?:eval|exec)\s*\(")),
    ("SHELL_EXECUTION", re.compile(r"\bshell\s*=\s*True\b|\bos\.system\s*\(")),
    ("UNSAFE_PICKLE", re.compile(r"\bpickle\.loads?\s*\(")),
    ("UNSAFE_YAML", re.compile(r"\byaml\.load\s*\(")),
    (
        "STRING_BUILT_SQL",
        re.compile(r"(?i)(?:f['\"]|\.format\()[^\n]*(?:SELECT|INSERT|UPDATE|DELETE)\s"),
    ),
)


@dataclass(frozen=True, slots=True)
class Finding:
    """Identify one matched rule and file path without retaining matched text."""

    rule: str
    path: Path


def _contains_sequence(parts: tuple[str, ...], sequence: tuple[str, ...]) -> bool:
    """Return whether path parts contain one exact excluded directory sequence."""
    return any(
        parts[index : index + len(sequence)] == sequence
        for index in range(len(parts) - len(sequence) + 1)
    )


def is_excluded(path: Path, root: Path) -> bool:
    """Exclude only locks, binaries, dependencies, caches, and exact generated roots."""
    try:
        relative = path.resolve().relative_to(root.resolve())
    except ValueError:
        relative = path
    parts = relative.parts
    return (
        path.name in LOCK_NAMES
        or path.suffix in BINARY_SUFFIXES
        or bool(EXCLUDED_PARTS.intersection(parts))
        or any(_contains_sequence(parts, sequence) for sequence in EXCLUDED_PATHS)
    )


def scan_paths(paths: Sequence[Path], root: Path = ROOT) -> list[Finding]:
    """Return sorted path/rule findings without storing or returning matched values."""
    findings: set[Finding] = set()
    for path in paths:
        if not path.is_file() or is_excluded(path, root):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        rules = SECRET_RULES + (CODE_RULES if path.suffix in CODE_SUFFIXES else ())
        for rule, pattern in rules:
            if pattern.search(text):
                findings.add(Finding(rule=rule, path=path))
    return sorted(findings, key=lambda item: (str(item.path), item.rule))


def format_findings(findings: Sequence[Finding], root: Path | None = None) -> str:
    """Render only rule names and paths, optionally relative to a repository root."""
    lines = []
    for finding in findings:
        path = finding.path
        if root is not None:
            try:
                path = path.resolve().relative_to(root.resolve())
            except ValueError:
                pass
        lines.append(f"{finding.rule} {path}")
    return "\n".join(lines)


def tracked_paths(root: Path = ROOT) -> list[Path]:
    """Return Git-tracked repository paths without shell parsing or glob expansion."""
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=root,
        check=True,
        capture_output=True,
    )
    return [root / value.decode() for value in result.stdout.split(b"\0") if value]


def main() -> int:
    """Scan tracked text and print only safe path/rule findings or a pass summary."""
    paths = tracked_paths()
    findings = scan_paths(paths)
    if findings:
        print(format_findings(findings, ROOT))
        return 1
    print(f"sensitive pattern scan passed ({len(paths)} tracked paths considered)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
