"""Dump matched pairs + unmatched for one chart to diagnose mismatches."""
import json, sys
from mapping import norm_gt, norm_pred
from compare import iou, gt_elements, match, IOU_THRESH

name = sys.argv[1] if len(sys.argv) > 1 else "BarChart2.svg"
preds = json.load(open("predictions.json"))[name]
gts = gt_elements(name)
pairs, up, ug = match(preds, gts)

def bb(e):
    return f"[{e['xMin']:.0f},{e['yMin']:.0f},{e['xMax']:.0f},{e['yMax']:.0f}]"

print(f"### {name}: {len(preds)} pred, {len(gts)} gt, {len(pairs)} matched\n")
print("--- MATCHED (gt_role / pred_class | iou) ---")
for i, j, v in sorted(pairs, key=lambda x: -x[2]):
    g, p = gts[j], preds[i]
    ok = "OK " if norm_pred(p["cls"]) == g["u"] else "XX "
    print(f"{ok}{g['role']:18s} -> {p['cls']:22s} | iou={v:.2f} "
          f"gt{bb(g)} pr{bb(p)} <{p['tag']}>")

print(f"\n--- GT MISSED ({len(ug)}) ---")
for j in sorted(ug):
    g = gts[j]
    print(f"   {g['role']:18s} ({g['u']}) {bb(g)}")

print(f"\n--- PRED EXTRA ({len(up)}) ---  (class : count)")
import collections
c = collections.Counter(preds[i]["cls"] for i in up)
for k, n in c.most_common():
    print(f"   {k:24s} : {n}")
