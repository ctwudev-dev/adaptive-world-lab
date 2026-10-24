"""Check shared source files for common private data and non-English text."""

from pathlib import Path
import re
import subprocess
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {
    ".git", ".venv", "venv", "node_modules", "__pycache__", ".pytest_cache",
    ".openai", ".sites-runtime", ".agents", ".codex", "build",
}
RULES = {
    "non-English interface text": re.compile(r"[\u3400-\u9fff]"),
    "local machine path": re.compile(r"/(?:workspace/scratch|root|home)/[A-Za-z0-9_.-]+"),
    "private hosting address": re.compile(r"(?:chatgpt\.site|git\.chatgpt-team\.site)"),
    "internal project identifier": re.compile(r"(?:appgprj|oaiapp)_[A-Za-z0-9_-]{8,}"),
    "internal account identifier": re.compile(r"\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b"),
    "access token": re.compile(r"\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b"),
    "cloud access key": re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "email address": re.compile(r"\b[A-Za-z0-9.!#$%&'*+/=?^_{}|~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
}


def included(path):
    return not any(part in EXCLUDED or part.endswith(".egg-info") or part.startswith("pip-") for part in path.parts)


def inspect(name, raw, errors):
    path = Path(name)
    if any(part in EXCLUDED or part.endswith(".egg-info") for part in path.parts):
        errors.append((name, "excluded directory"))
    if path.name.startswith(".env") or path.suffix in {".pem", ".key", ".log", ".pyc"}:
        errors.append((name, "private or generated file type"))
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        if path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".pdf"}:
            errors.append((name, "unreviewed binary file"))
        return
    for label, rule in RULES.items():
        if rule.search(content):
            errors.append((name, label))


def main():
    listed = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, text=True,
    )
    if listed.returncode == 0 and listed.stdout:
        paths = [ROOT / name for name in listed.stdout.split("\0") if name]
    else:
        paths = [p for p in ROOT.rglob("*") if p.is_file() and included(p.relative_to(ROOT))]
    errors = []
    checked = 0
    for path in paths:
        if not path.is_file():
            continue
        name = str(path.relative_to(ROOT))
        if path.suffix == ".zip":
            continue
        inspect(name, path.read_bytes(), errors)
        checked += 1
    archive = ROOT / "dist/adaptive-world-lab.zip"
    if archive.is_file():
        with ZipFile(archive) as zipped:
            for info in zipped.infolist():
                if info.is_dir():
                    continue
                inspect("archive/" + info.filename, zipped.read(info), errors)
    if errors:
        for name, reason in errors:
            print(f"Check failed: {name}: {reason}")
        raise SystemExit(1)
    print(f"Public-source check passed for {checked} files and the source archive, when present.")


if __name__ == "__main__":
    main()
