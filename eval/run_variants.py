"""
Run the data-gt weak-GT eval over generated_variants (3 generators).
For each source: inject GT -> batch through the tool -> collect (gt, class) pairs.
Assumes dev server running on $APP_URL (5180).
"""
import os, json, subprocess, math
from inject_gt import inject

ROOT = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(ROOT, "..", "CSG", "tagging")
INFER = os.path.join(TOOL, "case")
DATA = os.path.join(ROOT, "..", "generated_variants")
SOURCES = ["plotly_export", "chartblocks", "fusion_clean"]
BATCH = 30

for src in SOURCES:
    cdir = os.path.join(DATA, src, "charts")
    files = sorted(f for f in os.listdir(cdir) if f.endswith(".svg"))
    n_b = math.ceil(len(files) / BATCH)
    print(f"\n### {src}: {len(files)} charts, {n_b} batches")
    merged = {}
    for b in range(n_b):
        batch = files[b * BATCH:(b + 1) * BATCH]
        for f in os.listdir(INFER):
            os.remove(os.path.join(INFER, f))
        for f in batch:
            try:
                inject(os.path.join(cdir, f),
                       os.path.join(INFER, f.replace(".svg", ".txt")), src)
            except Exception as e:
                print(f"   inject fail {f}: {e}")
        out = os.path.join(ROOT, "_vb.json")
        wait = str(2000 + 130 * len(batch))
        env = {**os.environ, "OUT": out, "WAIT": wait,
               "APP_URL": os.environ.get("APP_URL", "http://localhost:5180")}
        r = subprocess.run(["node", "runner_gt.mjs"], cwd=ROOT, env=env,
                           capture_output=True, text=True)
        if r.returncode != 0:
            print(f"   batch {b} FAIL:", r.stderr[-300:]); continue
        merged.update(json.load(open(out)))
        print(f"   batch {b+1}/{n_b} done ({len(batch)})", flush=True)
    with open(os.path.join(ROOT, f"preds_gt_{src}.json"), "w") as fh:
        json.dump(merged, fh)
    print(f"   -> preds_gt_{src}.json ({len(merged)} charts)")
