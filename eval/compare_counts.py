"""
Count-based component-extraction accuracy (NO geometric alignment).
Per chart, count each component type from the tool's predictions and from GT,
then compare counts.

  prediction = svg-chart-reuse output on cleaned_svgo (predictions_svgo.json),
               element classes -> unified type via norm_pred.
  GT         = VisAnatomy annotation roles -> unified type via norm_gt.

Metrics per type & overall:
  exact%       fraction of charts where pred_count == gt_count
  count-acc    mean of 1 - |pred-gt| / max(pred, gt)   (1.0 = perfect)
  MAE          mean |pred - gt|
"""
import json, sys, os, collections
from mapping import norm_gt as _ngt, norm_pred as _npred

PRED = sys.argv[1] if len(sys.argv) > 1 else "predictions_svgo.json"
ANN_DIR = "../VisAnatomy/annotations"
TYPES = ["mark", "axis-label", "axis-tick", "axis-line", "gridline",
         "legend", "title", "annotation"]
TEXT_TYPES = {"axis-label", "title", "annotation", "legend"}  # glyph-count caveat


def norm_gt(role):
    u = _ngt(role)
    return "legend" if u in ("legend-label", "legend-mark") else u


def norm_pred(cls):
    u = _npred(cls)
    return "legend" if u in ("legend-label", "legend-mark") else u


def gt_counts(name):
    p = os.path.join(ANN_DIR, name.replace(".svg", ".json"))
    if not os.path.exists(p):
        return None
    d = json.load(open(p))
    c = collections.Counter()
    for el in d.get("allElements", {}).values():
        if "role" in el:
            u = norm_gt(el["role"])
            if u in TYPES:
                c[u] += 1
    return c


def main():
    preds_all = json.load(open(PRED))
    # per type: list of (gt, pred) over charts where gt>0 or pred>0
    pairs = collections.defaultdict(list)
    n_charts = 0
    for name, preds in preds_all.items():
        gt = gt_counts(name)
        if gt is None:
            continue
        n_charts += 1
        pc = collections.Counter()
        for x in preds:
            u = norm_pred(x["cls"])
            if u in TYPES:
                pc[u] += 1
        for t in TYPES:
            g, p = gt.get(t, 0), pc.get(t, 0)
            if g > 0 or p > 0:
                pairs[t].append((g, p))

    print(f"Count-based component accuracy  ({n_charts} charts, {PRED})")
    print(f"  {'type':12s} {'n':>4s} {'exact%':>7s} {'cnt-acc':>8s} {'MAE':>6s} "
          f"{'gt_avg':>7s} {'pred_avg':>8s}")
    all_acc, all_exact, all_n = 0.0, 0, 0
    shape_acc, shape_n = 0.0, 0
    for t in TYPES:
        ps = pairs[t]
        if not ps:
            continue
        n = len(ps)
        exact = sum(1 for g, p in ps if g == p)
        acc = sum(1 - abs(g - p) / max(g, p, 1) for g, p in ps) / n
        mae = sum(abs(g - p) for g, p in ps) / n
        gavg = sum(g for g, _ in ps) / n
        pavg = sum(p for _, p in ps) / n
        tag = " (text:glyph-count caveat)" if t in TEXT_TYPES else ""
        print(f"  {t:12s} {n:4d} {exact/n:7.1%} {acc:8.1%} {mae:6.1f} "
              f"{gavg:7.1f} {pavg:8.1f}{tag}")
        all_acc += acc * n; all_exact += exact; all_n += n
        if t not in TEXT_TYPES:
            shape_acc += acc * n; shape_n += n
    print(f"\n  OVERALL (all types)      count-acc={all_acc/all_n:.1%}  "
          f"exact={all_exact/all_n:.1%}  (n={all_n})")
    print(f"  SHAPE-ONLY (mark/grid/tick/axis-line)  count-acc="
          f"{shape_acc/shape_n:.1%}  (n={shape_n})")
    print("\n  注: text 类(title/axis-label/annotation/legend)GT 按字形 path 计数、"
          "工具按整个 text 计数,单位不一致,数值仅供参考;shape 类才直接可比。")


if __name__ == "__main__":
    main()
