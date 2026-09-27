"""Statewide calibration for the Opportunity Finder's primary minimum score (lib/findings/score.ts).

Runs /api/findings for every active hospital with its default "similar" peer group and no primary minimum (min=0),
then reports the score distribution of all findings and what each candidate minimum would do to the primary tier.

    npm run build && npx next start -p 3100 &
    python3 scripts/calibrate_findings.py --base http://localhost:3100 --out calibration.json
"""

import argparse
import concurrent.futures
import json
import statistics
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_PRIMARY, PER_TYPE = 5, 2


def active_hospitals():
    ids, years, kind = set(), {}, {}
    for ds in ("hafd-selected", "hau"):
        for f in json.loads((ROOT / f"data/processed/{ds}/facilities.json").read_text()):
            ids.add(f["id"])
            years[f["id"]] = max(years.get(f["id"], 0), max(f.get("years") or [0]))
            if f.get("hospitalType"):
                kind[f["id"]] = f["hospitalType"]
    latest = max(years.values())
    return sorted(i for i in ids if years[i] >= latest - 1), kind


def fetch(base, fid):
    with urllib.request.urlopen(f"{base}/api/findings?facility={fid}&min=0", timeout=120) as r:
        d = json.load(r)
    findings = d["primary"] + d["secondary"] + d["overflow"]
    return {
        "id": fid,
        "peers": d["peerGroup"]["count"],
        "findings": [{"family": f["family"], "type": f["type"], "score": f["score"], "level": f["level"], "kind": f["lead"]["kind"], "lead": f["lead"]["id"],
                      "severity": f["lead"]["severity"]["value"], "persistence": f["lead"]["persistence"]["value"],
                      "weight": f["lead"]["weight"], "confidence": f["confidence"], "dollars": (f["dollars"] or {}).get("amount")} for f in findings],
    }


def select(findings, minimum):
    primary, per_type = [], {}
    for f in sorted(findings, key=lambda f: -f["score"]):
        if len(primary) >= MAX_PRIMARY or f["score"] < minimum or f["level"] == "low" or per_type.get(f["type"], 0) >= PER_TYPE:
            continue
        per_type[f["type"]] = per_type.get(f["type"], 0) + 1
        primary.append(f)
    return primary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3100")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    ids, kind = active_hospitals()
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        rows = list(ex.map(lambda i: fetch(args.base, i), ids))
    for r in rows:
        r["type"] = kind.get(r["id"])
    if args.out:
        Path(args.out).write_text(json.dumps(rows))
    print(f"{len(rows)} active hospitals")


if __name__ == "__main__":
    main()
