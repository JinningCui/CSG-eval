"""
Orchestrate the full Cartesian-subset eval:
  for each batch -> swap infer_results, run runner.mjs (fresh browser), merge.
Assumes the svg-chart-reuse dev server is already running on $APP_URL (5180).
"""
import os, json, shutil, subprocess, math

ROOT = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(ROOT, "..", "svg-chart-reuse")
INFER = os.path.join(TOOL, "infer_results")
SVG_DIR = os.path.join(ROOT, "..", "VisAnatomy", "charts_svg")
BATCH = int(os.environ.get("BATCH", "40"))

files = [l.strip() for l in open(os.path.join(ROOT, "cartesian_list.txt")) if l.strip()]
n_batches = math.ceil(len(files) / BATCH)
print(f"{len(files)} charts, {n_batches} batches of {BATCH}")

merged = {}
for b in range(n_batches):
    batch = files[b * BATCH:(b + 1) * BATCH]
    # swap infer_results
    for f in os.listdir(INFER):
        os.remove(os.path.join(INFER, f))
    for f in batch:
        shutil.copy(os.path.join(SVG_DIR, f),
                    os.path.join(INFER, f.replace(".svg", ".txt")))
    out = os.path.join(ROOT, f"_preds_batch{b}.json")
    # wait scales with batch size
    wait = str(2000 + 120 * len(batch))
    env = {**os.environ, "OUT": out, "WAIT": wait,
           "APP_URL": os.environ.get("APP_URL", "http://localhost:5180")}
    print(f"[batch {b+1}/{n_batches}] {len(batch)} charts, wait={wait}ms ...", flush=True)
    r = subprocess.run(["node", "runner.mjs"], cwd=ROOT, env=env,
                       capture_output=True, text=True)
    if r.returncode != 0:
        print("  runner FAILED:", r.stderr[-500:])
        continue
    print("  " + r.stdout.strip().splitlines()[-1])
    merged.update(json.load(open(out)))

with open(os.path.join(ROOT, "predictions_full.json"), "w") as f:
    json.dump(merged, f)
print(f"\nmerged {len(merged)} charts -> predictions_full.json")
