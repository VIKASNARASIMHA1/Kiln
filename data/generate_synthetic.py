"""Writes simulated learner data used for seeding the database.

Run from repo root:  python data/generate_synthetic.py [count]
Output: data/generated/learners.json  (all data is simulated)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "ai-service"))

from app.synthetic import build_learner_records  # noqa: E402

if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 120
    out = ROOT / "generated"
    out.mkdir(exist_ok=True)
    records = build_learner_records(n)
    (out / "learners.json").write_text(json.dumps(records, indent=1))
    print(f"Wrote {len(records)} simulated learners to {out / 'learners.json'}")
