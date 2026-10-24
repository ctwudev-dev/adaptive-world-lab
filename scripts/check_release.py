"""Release integrity checks; no external service and no browser renderer."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
from zipfile import ZipFile
import hashlib
import json
import math
import re

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/"dist"
class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=set()
        self.links=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if "id" in a:
            assert a["id"] not in self.ids,f"Duplicate id {a['id']}"
            self.ids.add(a["id"])
        for k in ("href","src"):
            if k in a:
                self.links.append(a[k])
page=Page()
page.feed((DIST/"index.html").read_text())
for link in page.links:
    parts=urlsplit(link)
    if parts.scheme or not parts.path:
        continue
    assert (DIST/parts.path).is_file(),f"Missing linked asset {link}"
for element in set(re.findall(r"(?<!\$)\$\('([^']+)'\)",(DIST/"app.js").read_text())):
    assert element in page.ids,f"Unknown DOM id {element}"
for name in ("engine.js","app.js","benchmark-worker.js","style.css","mujoco-demo.json","README.md","adaptive-world-lab.zip"):
    assert (DIST/name).is_file(),name
assert (DIST/"README.md").read_bytes()==(ROOT/"README.md").read_bytes()
for filename in ("verified-benchmark.json","verified-shift.json","verified-mismatch.json"):
    data=json.loads((DIST/filename).read_text())
    assert data["schema"]=="awm-benchmark-v1" and data["n"]==100
    for path,expected in data["provenance"]["codeHashes"].items():
        assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==expected,f"Stale experiment code: {path}"
    assert data["engine"]=="mujoco"
    for method in ("fixed","passive","active","robust"):
        rows=data["episodes"][method]
        assert len(rows)==100
        count=sum(row["metrics"]["success"] for row in rows)
        assert count==data["summary"][method]["successes"]
        for i,row in enumerate(rows):
            assert row["config"]==data["scenarios"][i]
            m=row["metrics"]
            assert m["actions"]<=row["config"]["maxActions"]
            assert m["success"]==(not m["boundary"] and m["error"]<=row["config"]["tolerance"])
            for k,v in m.items():
                assert isinstance(v,(int,float)) and math.isfinite(v) and v>=0,(k,v)
with ZipFile(DIST/"adaptive-world-lab.zip") as z:
    names=z.namelist()
    for name in names:
        parts=Path(name).parts
        assert not set(parts)&{".git",".openai","node_modules",".venv","__pycache__"}
        assert not name.endswith(".zip")
    for name in ("README.md","awm/core.py","awm/plants.py","dist/index.html","tests/test_core.py","package-lock.json"):
        assert "adaptive-world-lab/"+name in names,name
print(f"Release integrity verified: {len(page.ids)} DOM ids, 3 x 400 MuJoCo trials, {len(names)} portable source files.")

