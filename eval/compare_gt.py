"""Score the data-gt weak-GT eval per generator source."""
import json, glob, os, collections
from mapping import norm_pred, UNIFIED

SOURCES = ["plotly_export", "chartblocks", "fusion_clean"]


def score(path):
    d = json.load(open(path))
    confusion = collections.Counter()      # (gt, pred)
    gt_tot = collections.Counter()
    correct = collections.Counter()
    untagged = collections.Counter()
    charts = 0
    for items in d.values():
        charts += 1
        for x in items:
            if not x["gt"]:
                continue
            g = x["gt"]
            p = norm_pred(x["cls"]) if x["cls"] else "(untagged)"
            gt_tot[g] += 1
            confusion[(g, p)] += 1
            if p == g:
                correct[g] += 1
            elif p == "(untagged)":
                untagged[g] += 1
    return charts, gt_tot, correct, untagged, confusion


for src in SOURCES:
    path = f"preds_gt_{src}.json"
    if not os.path.exists(path):
        continue
    charts, gt_tot, correct, untagged, confusion = score(path)
    total = sum(gt_tot.values())
    corr = sum(correct.values())
    print(f"\n{'='*56}\n{src}  ({charts} charts, {total} GT-labeled elements)")
    print(f"  overall label accuracy: {corr/total:.1%}" if total else "  no GT")
    print(f"  {'class':14s} {'GT':>6s} {'correct':>8s} {'acc':>7s} {'untagged':>9s}")
    for c in UNIFIED:
        if gt_tot[c]:
            print(f"  {c:14s} {gt_tot[c]:6d} {correct[c]:8d} "
                  f"{correct[c]/gt_tot[c]:7.1%} {untagged[c]:9d}")
    print("  top confusions (gt -> pred):")
    shown = 0
    for (g, p), n in sorted(confusion.items(), key=lambda t: -t[1]):
        if g != p and p != "(untagged)" and shown < 8:
            print(f"     {g:13s} -> {p:13s} : {n}")
            shown += 1
