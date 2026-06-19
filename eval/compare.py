"""
Compare svg-chart-reuse predictions (predictions.json from runner.mjs) against
VisAnatomy ground-truth roles. Elements are aligned by bounding-box IoU, then
both labels are normalized to the coarse vocab (mapping.py) and scored.
"""
import json, sys, glob, os, collections
from mapping import norm_gt, norm_pred, UNIFIED

ANN_DIR = "../VisAnatomy/annotations"
PRED = sys.argv[1] if len(sys.argv) > 1 else "predictions.json"
IOU_THRESH = 0.5


def pad(box, t=3.0):
    """Give zero-area (thin line/tick) boxes a minimum thickness so IoU works."""
    xMin, xMax, yMin, yMax = box["xMin"], box["xMax"], box["yMin"], box["yMax"]
    if xMax - xMin < t:
        c = (xMin + xMax) / 2; xMin, xMax = c - t / 2, c + t / 2
    if yMax - yMin < t:
        c = (yMin + yMax) / 2; yMin, yMax = c - t / 2, c + t / 2
    return {"xMin": xMin, "xMax": xMax, "yMin": yMin, "yMax": yMax}


def iou(a, b):
    a = pad(a); b = pad(b)
    xA = max(a["xMin"], b["xMin"]); yA = max(a["yMin"], b["yMin"])
    xB = min(a["xMax"], b["xMax"]); yB = min(a["yMax"], b["yMax"])
    iw = max(0.0, xB - xA); ih = max(0.0, yB - yA)
    inter = iw * ih
    areaA = (a["xMax"] - a["xMin"]) * (a["yMax"] - a["yMin"])
    areaB = (b["xMax"] - b["xMin"]) * (b["yMax"] - b["yMin"])
    union = areaA + areaB - inter
    return inter / union if union > 0 else 0.0


def gt_elements(name):
    path = os.path.join(ANN_DIR, name.replace(".svg", ".json"))
    d = json.load(open(path))
    out = []
    for el in d.get("allElements", {}).values():
        if "role" not in el:
            continue
        try:
            L = float(el["left"]); T = float(el["top"])
            W = float(el["width"]); H = float(el["height"])
        except (KeyError, ValueError):
            continue
        out.append({
            "xMin": L, "yMin": T, "xMax": L + W, "yMax": T + H,
            "role": el["role"], "u": norm_gt(el["role"]),
            "tag": str(el.get("tagName", "")).lower(),
        })
    return out


def _is_text(tag):
    return str(tag).lower() in ("text", "tspan")


def match(preds, gts):
    """Greedy IoU matching, text<->text and shape<->shape only.
    Returns (pairs, unmatched_pred, unmatched_gt)."""
    cand = []
    for i, p in enumerate(preds):
        for j, g in enumerate(gts):
            if _is_text(p["tag"]) != _is_text(g["tag"]):
                continue   # don't let a small text box steal an overlapping shape
            v = iou(p, g)
            if v >= IOU_THRESH:
                cand.append((v, i, j))
    cand.sort(reverse=True)
    up, ug = set(range(len(preds))), set(range(len(gts)))
    pairs = []
    for v, i, j in cand:
        if i in up and j in ug:
            pairs.append((i, j, v))
            up.discard(i); ug.discard(j)
    return pairs, up, ug


def main():
    import re
    QUIET = os.environ.get("QUIET")
    preds_all = json.load(open(PRED))
    confusion = collections.Counter()   # (gt_u, pred_u)
    tot_match = tot_correct = 0
    tot_gt = tot_pred = tot_miss = tot_extra = 0
    by_type = collections.defaultdict(lambda: [0, 0, 0, 0])  # match,correct,miss,gt

    for name, preds in preds_all.items():
        ann = os.path.join(ANN_DIR, name.replace(".svg", ".json"))
        if not os.path.exists(ann):
            continue
        gts = gt_elements(name)
        pairs, up, ug = match(preds, gts)
        correct = sum(1 for i, j, _ in pairs
                      if norm_pred(preds[i]["cls"]) == gts[j]["u"])
        for i, j, _ in pairs:
            confusion[(gts[j]["u"], norm_pred(preds[i]["cls"]))] += 1
        tot_match += len(pairs); tot_correct += correct
        tot_gt += len(gts); tot_pred += len(preds)
        tot_miss += len(ug); tot_extra += len(up)
        ctype = re.sub(r"[0-9]+\.svg$", "", name)
        t = by_type[ctype]
        t[0] += len(pairs); t[1] += correct; t[2] += len(ug); t[3] += len(gts)
        acc = correct / len(pairs) if pairs else 0.0
        if not QUIET:
            print(f"\n=== {name} ===")
            print(f"  GT labeled: {len(gts):4d}   tool tagged: {len(preds):4d}")
            print(f"  matched(IoU>={IOU_THRESH}): {len(pairs):4d}   "
                  f"correct: {correct:4d}   label-acc: {acc:.1%}")
            print(f"  tool MISSED (GT unmatched): {len(ug):4d}   "
                  f"tool EXTRA (pred unmatched): {len(up):4d}")

    print("\nPER CHART-TYPE:")
    print(f"  {'type':28s} {'charts':>6s} {'matched':>8s} {'lbl-acc':>8s} {'recall':>7s}")
    for ct in sorted(by_type):
        m, c, miss, gt = by_type[ct]
        la = c / m if m else 0
        rc = c / gt if gt else 0   # correct / all GT-labeled (end-to-end recall)
        print(f"  {ct:28s} {'':>6s} {m:8d} {la:8.1%} {rc:7.1%}")

    print("\n" + "=" * 50)
    print("AGGREGATE")
    print(f"  GT labeled elements      : {tot_gt}")
    print(f"  tool tagged elements     : {tot_pred}")
    print(f"  matched pairs            : {tot_match}")
    print(f"  label accuracy on matched: "
          f"{tot_correct/tot_match:.1%}" if tot_match else "  no matches")
    print(f"  tool missed (unmatched GT): {tot_miss}  "
          f"({tot_miss/tot_gt:.1%} of GT)" if tot_gt else "")
    print(f"  tool extra (unmatched pred): {tot_extra}")

    # per-class precision/recall over matched+unmatched
    print("\nPER-CLASS (on matched pairs, GT perspective):")
    gt_tot = collections.Counter(); correct_c = collections.Counter()
    for (g, p), n in confusion.items():
        gt_tot[g] += n
        if g == p:
            correct_c[g] += n
    print(f"  {'class':14s} {'matched':>8s} {'recall*':>8s}")
    for c in UNIFIED:
        if gt_tot[c]:
            print(f"  {c:14s} {gt_tot[c]:8d} {correct_c[c]/gt_tot[c]:8.1%}")
    print("  (*recall here = correct label among matched GT of that class)")

    print("\nTOP CONFUSIONS (gt -> pred : count), excluding correct:")
    for (g, p), n in sorted(confusion.items(), key=lambda x: -x[1]):
        if g != p:
            print(f"  {g:14s} -> {p:14s} : {n}")


if __name__ == "__main__":
    main()
