"""
Per-chart-type component-extraction report -> CSV.

For each (chart_type, component_type):
  TYPE recognition (presence-based): per chart, does it HAVE this component type
    in pred vs GT -> precision / recall / F1 across charts of that type.
  COUNT recognition: per chart count pred vs GT -> count-acc (1-|p-g|/max),
    exact-match rate, averages.

Usage: python3 generate_report_csv.py <predictions.json> [out.csv]
"""
import json, sys, os, csv, collections, re
from mapping import norm_gt as _ngt, norm_pred as _npred

PRED = sys.argv[1] if len(sys.argv) > 1 else "predictions_svgo3.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else "component_report.csv"
ANN_DIR = "../VisAnatomy/annotations"
TYPES = ["mark", "axis-label", "axis-tick", "axis-line", "gridline",
         "legend", "title", "annotation"]
TEXT_TYPES = {"axis-label", "title", "annotation", "legend"}


def ngt(role):
    u = _ngt(role)
    return "legend" if u in ("legend-label", "legend-mark") else u


def npred(cls):
    u = _npred(cls)
    return "legend" if u in ("legend-label", "legend-mark") else u


def gt_counts(name):
    p = os.path.join(ANN_DIR, name.replace(".svg", ".json"))
    if not os.path.exists(p):
        return None
    c = collections.Counter()
    for el in json.load(open(p)).get("allElements", {}).values():
        if "role" in el:
            u = ngt(el["role"])
            if u in TYPES:
                c[u] += 1
    return c


def f1(p, r):
    return 2 * p * r / (p + r) if (p + r) else 0.0


def main():
    preds_all = json.load(open(PRED))
    # rows[(ctype, comp)] = list of (gt_count, pred_count)
    rows = collections.defaultdict(list)
    ctypes = set()
    for name, preds in preds_all.items():
        gt = gt_counts(name)
        if gt is None:
            continue
        ctype = re.sub(r"[0-9]+\.svg$", "", name)
        ctypes.add(ctype)
        pc = collections.Counter()
        for x in preds:
            u = npred(x["cls"])
            if u in TYPES:
                pc[u] += 1
        for comp in TYPES:
            rows[(ctype, comp)].append((gt.get(comp, 0), pc.get(comp, 0)))

    out_rows = []
    for ctype in sorted(ctypes):
        for comp in TYPES:
            pairs = rows[(ctype, comp)]
            if not pairs:
                continue
            tp = sum(1 for g, p in pairs if g > 0 and p > 0)
            fp = sum(1 for g, p in pairs if g == 0 and p > 0)
            fn = sum(1 for g, p in pairs if g > 0 and p == 0)
            prec = tp / (tp + fp) if (tp + fp) else 0.0
            rec = tp / (tp + fn) if (tp + fn) else 0.0
            present = [(g, p) for g, p in pairs if g > 0 or p > 0]
            n = len(present)
            if n == 0:
                continue
            cnt_acc = sum(1 - abs(g - p) / max(g, p, 1) for g, p in present) / n
            exact = sum(1 for g, p in present if g == p) / n
            gavg = sum(g for g, _ in present) / n
            pavg = sum(p for _, p in present) / n
            out_rows.append({
                "chart_type": ctype, "component": comp,
                "n_charts": len(pairs), "gt_has": tp + fn,
                "type_precision": round(prec, 3), "type_recall": round(rec, 3),
                "type_f1": round(f1(prec, rec), 3),
                "count_acc": round(cnt_acc, 3), "count_exact": round(exact, 3),
                "gt_avg": round(gavg, 1), "pred_avg": round(pavg, 1),
                "text_caveat": comp in TEXT_TYPES,
            })

    cols = ["chart_type", "component", "n_charts", "gt_has",
            "type_precision", "type_recall", "type_f1",
            "count_acc", "count_exact", "gt_avg", "pred_avg", "text_caveat"]
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(out_rows)
    print(f"wrote {len(out_rows)} rows -> {OUT}")

    # console summary: per chart type, macro over components
    print(f"\n{'chart_type':26s} {'type-F1':>8s} {'count-acc':>10s}  (macro over components)")
    by_ct = collections.defaultdict(list)
    for r in out_rows:
        by_ct[r["chart_type"]].append(r)
    g_tf, g_ca, g_n = 0.0, 0.0, 0
    for ct in sorted(by_ct):
        rs = by_ct[ct]
        tf = sum(r["type_f1"] for r in rs) / len(rs)
        ca = sum(r["count_acc"] for r in rs) / len(rs)
        print(f"{ct:26s} {tf:8.1%} {ca:10.1%}")
        g_tf += tf; g_ca += ca; g_n += 1
    print(f"{'OVERALL (avg of types)':26s} {g_tf/g_n:8.1%} {g_ca/g_n:10.1%}")


if __name__ == "__main__":
    main()
