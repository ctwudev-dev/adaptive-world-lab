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
pages={}
for filename in ("index.html", "transfer.html"):
    page=Page()
    page.feed((DIST/filename).read_text())
    pages[filename]=page
    for link in page.links:
        parts=urlsplit(link)
        if parts.scheme or not parts.path:
            continue
        assert (DIST/parts.path).is_file(),f"Missing linked asset {link} in {filename}"
for script_name,filename in (("app.js","transfer.html"),("business.js","transfer.html"),("robot.js","index.html")):
    for element in set(re.findall(r"(?<!\$)\$\('([^']+)'\)", (DIST/script_name).read_text())):
        assert element in pages[filename].ids,f"Unknown DOM id {element} in {script_name}"
for name in ("engine.js","app.js","business.js","business-case.js","benchmark-worker.js","style.css","mujoco-demo.json","README.md","proposal.md","transfer-pilot-proposal.pdf","business-case-sample.json","adaptive-world-lab.zip"):
    assert (DIST/name).is_file(),name
assert (DIST/"README.md").read_bytes()==(ROOT/"README.md").read_bytes()
for name in ("robot-engine.js","robot-experiment.js","robot-worker.js","robot.js","robot.css","robot-contact-demo.json","robot-method.md","robot-results.md","transfer.html"):
    assert (DIST/name).is_file(),name
assert (DIST/"robot-method.md").read_bytes()==(ROOT/"docs/robot-method.md").read_bytes()
robot_count=0
for suite in ("unseen","shift","close"):
    records=[]
    for engine in ("contact","numerical"):
        path=ROOT/f"results/robot-{engine}-{suite}.json"
        data=json.loads(path.read_text())
        assert data["schema"]=="robot-physics-benchmark-v1" and data["n"]==60 and len(data["cases"])==60
        assert data["suite"]==suite
        records.append(data)
        for filename,expected in data["provenance"]["codeHashes"].items():
            assert hashlib.sha256((ROOT/filename).read_bytes()).hexdigest()==expected,f"Stale robot experiment source: {filename}"
        if engine=="contact":
            assert (DIST/path.name).read_bytes()==path.read_bytes()
        for method in ("fixed","passive","active"):
            rows=data["episodes"][method]
            assert len(rows)==60
            summary=data["summary"][method]
            assert summary["successes"]==sum(r["metrics"]["success"] for r in rows)
            for key in ("actions","probes","time","error","predictionRmse"):
                assert math.isclose(summary[key],sum(r["metrics"][key] for r in rows)/60,abs_tol=1e-10)
            assert summary["successLow"]<=summary["successRate"]<=summary["successHigh"]
            for i,row in enumerate(rows):
                metrics,c=row["metrics"],row["config"]
                assert metrics["actions"]<=c["maxActions"] and metrics["probes"]<=metrics["actions"]
                assert metrics["success"]==(not metrics["boundary"] and metrics["error"]<=c["tolerance"])
                assert metrics["time"]>=metrics["actions"]*c["setupTime"]
                assert not {"mu","mass","shiftMu","shiftAfter"}&c.keys()
                assert c["target"]==data["cases"][i]["target"]
                assert all(isinstance(v,(int,float)) and math.isfinite(v) and v>=0 for v in metrics.values())
                if engine=="contact":
                    assert row["contact"]["normalImpulse"]>0 and row["contact"]["contactSteps"]>0
            robot_count+=len(rows)
    assert records[0]["cases"]==records[1]["cases"]
replay=json.loads((DIST/"robot-contact-demo.json").read_text())
assert replay["schema"]=="robot-physics-session-v1" and replay["engine"]=="mujoco-pusher-contact-2d"
for filename,expected in replay["provenance"]["codeHashes"].items():
    assert hashlib.sha256((ROOT/filename).read_bytes()).hexdigest()==expected
for method in ("fixed","passive","active"):
    for event in replay["episodes"][method]["events"]:
        assert event["actual"]["normalImpulse"]>0 and event["actual"]["contactSteps"]>0
        assert all(math.isfinite(p[k]) for p in event["actual"]["trace"] for k in ("x","y","t"))
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
    for name in ("README.md","awm/core.py","awm/plants.py","dist/index.html","tests/test_core.py","package-lock.json","awm/robot_contact.py","dist/robot-engine.js","dist/transfer.html"):
        assert "adaptive-world-lab/"+name in names,name
print(f"Release integrity verified: {sum(len(p.ids) for p in pages.values())} DOM ids, {robot_count} new robot trials, 1,200 earlier MuJoCo trials, {len(names)} portable source files.")

