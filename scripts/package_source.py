"""Build a source ZIP from an explicit set of project files."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
import shutil

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "dist/adaptive-world-lab.zip"
TOP_FILES = {
    "README.md", ".gitignore", "package.json", "package-lock.json",
    "pyproject.toml", "requirements-repro.txt",
}
TOP_DIRS = {"awm", "tests", "scripts", "results", "dist", "docs", ".github"}
EXCLUDED = {"__pycache__", ".pytest_cache", "node_modules"}

shutil.copy2(ROOT / "README.md", ROOT / "dist/README.md")
count = 0
with ZipFile(DEST, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(ROOT.rglob("*")):
        rel = path.relative_to(ROOT)
        if not path.is_file() or not (str(rel) in TOP_FILES or rel.parts[0] in TOP_DIRS):
            continue
        if any(part in EXCLUDED for part in rel.parts):
            continue
        if path.name.startswith(".env") or path.suffix in {".zip", ".pyc", ".tgz", ".log", ".pem", ".key"}:
            continue
        info = ZipInfo(str(Path("adaptive-world-lab") / rel), (1980, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
        count += 1
print(f"Built {DEST.name}: {count} files, {DEST.stat().st_size:,} bytes.")

