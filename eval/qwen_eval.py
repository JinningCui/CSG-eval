"""
Evaluate Qwen `semantic_svg` regeneration vs VisAnatomy ground-truth at the
COMPONENT-TYPE level (element-level F1 is impossible: Qwen redraws with its own
coords/ids, no element correspondence).

Two metrics, each reported for all-385 and for the labeled subset (charts where
Qwen actually emitted semantic classes):
  A. component-type presence F1  (per-chart macro + per-type micro)
  B. component count comparison   (per type: exact-count rate, MAE)

GT roles -> unified via mapping.norm_gt (legend-* collapsed to 'legend').
Qwen free-form classes -> unified via norm_qwen (regex; WEAK/noisy mapping).
"""
import json, glob, os, re, collections
from mapping import norm_gt as _norm_gt

QWEN_DIR = "../rebuttal/visanatomy_test385_qwen_inference_results"
GT_DIR = "../VisAnatomy/annotations"

TYPES = ["mark", "axis-label", "axis-tick", "axis-line", "gridline",
         "legend", "title", "annotation"]


def norm_gt(role):
    u = _norm_gt(role)
    return "legend" if u in ("legend-label", "legend-mark") else u


QWEN_RULES = [
    (r"tick-?label", "axis-label"),
    (r"axis-?title", "title"),
    (r"axis-?line|^axis$|axis-group", "axis-line"),
    (r"grid", "gridline"),
    (r"^tick", "axis-tick"),
    (r"legend", "legend"),
    (r"sub-?title|^title", "title"),
    (r"bar|dot|point|slice|box|whisker|outlier|median|wave|bubble|"
     r"^line$|area|marker|data-?point|column|wedge|segment|node|"
     r"candle|funnel|petal|arc|ring|cell|stem|lollipop", "mark"),
    (r"axis-?label|category|tick", "axis-label"),
    (r"label|value|percent|annotation|^text$|datalabel|caption", "annotation"),
]


def norm_qwen(token):
    t = token.strip().lower()
    for rgx, role in QWEN_RULES:
        if re.search(rgx, t):
            return role
    return "other"


def qwen_counts(sem_svg):
    """Count Qwen elements per unified type (excludes <style> defs)."""
    body = re.sub(r"<style.*?</style>", "", sem_svg, flags=re.S)
    c = collections.Counter()
    for cls in re.findall(r'class="([^"]+)"', body):
        for tok in cls.split():
            u = norm_qwen(tok)
            if u in TYPES:
                c[u] += 1
                break  # one element -> one type (first matching token)
    return c


def gt_counts(name):
    p = os.path.join(GT_DIR, name + ".json")
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
    rows = []  # (name, gt_counter, pred_counter, labeled_bool)
    for f in sorted(glob.glob(os.path.join(QWEN_DIR, "*.json"))):
        name = os.path.basename(f).replace("_normalized.json", "")
        try:
            sem = json.load(open(f))[0].get("semantic_svg", "") or ""
        except Exception:
            sem = ""
        gt = gt_counts(name)
        if gt is None:
            continue
        pred = qwen_counts(sem)
        labeled = sum(pred.values()) > 0
        rows.append((name, gt, pred, labeled))

    def report(scope_rows, title):
        n = len(scope_rows)
        # A. presence F1
        macro_p = macro_r = macro_f = 0.0
        micro = {t: [0, 0, 0] for t in TYPES}   # TP, FP, FN
        for _, gt, pred, _ in scope_rows:
            gset = {t for t in TYPES if gt.get(t, 0) > 0}
            pset = {t for t in TYPES if pred.get(t, 0) > 0}
            tp = len(gset & pset); fp = len(pset - gset); fn = len(gset - pset)
            p = tp / (tp + fp) if tp + fp else (1.0 if not gset else 0.0)
            r = tp / (tp + fn) if tp + fn else 1.0
            f = 2 * p * r / (p + r) if p + r else 0.0
            macro_p += p; macro_r += r; macro_f += f
            for t in TYPES:
                g = t in gset; pr = t in pset
                if g and pr: micro[t][0] += 1
                elif pr and not g: micro[t][1] += 1
                elif g and not pr: micro[t][2] += 1
        print(f"\n{'='*60}\n{title}  ({n} charts)")
        print("A. COMPONENT-TYPE PRESENCE")
        print(f"   macro (per-chart avg):  P={macro_p/n:.1%}  "
              f"R={macro_r/n:.1%}  F1={macro_f/n:.1%}")
        print(f"   {'type':12s} {'P':>6s} {'R':>6s} {'F1':>6s}  (charts: gt∩p / gt)")
        for t in TYPES:
            tp, fp, fn = micro[t]
            p = tp / (tp + fp) if tp + fp else 0.0
            r = tp / (tp + fn) if tp + fn else 0.0
            f = 2 * p * r / (p + r) if p + r else 0.0
            print(f"   {t:12s} {p:6.1%} {r:6.1%} {f:6.1%}  ({tp}/{tp+fn})")

        # B. count comparison (only charts where GT has that type)
        print("B. COMPONENT COUNT (where GT has the type)")
        print(f"   {'type':12s} {'n':>4s} {'exact%':>7s} {'MAE':>6s} "
              f"{'gt_avg':>7s} {'pred_avg':>8s}")
        for t in TYPES:
            gs, ps, exact, cnt = 0, 0, 0, 0
            for _, gt, pred, _ in scope_rows:
                if gt.get(t, 0) > 0:
                    cnt += 1
                    g, pv = gt.get(t, 0), pred.get(t, 0)
                    gs += g; ps += pv
                    if g == pv:
                        exact += 1
            if cnt:
                mae = sum(abs(gt.get(t, 0) - pred.get(t, 0))
                          for _, gt, pred, _ in scope_rows if gt.get(t, 0) > 0) / cnt
                print(f"   {t:12s} {cnt:4d} {exact/cnt:7.1%} {mae:6.1f} "
                      f"{gs/cnt:7.1f} {ps/cnt:8.1f}")

    labeled_rows = [r for r in rows if r[3]]
    report(rows, "ALL 385 CHARTS (137 unlabeled count as zero-extraction)")
    report(labeled_rows, f"LABELED SUBSET ({len(labeled_rows)} charts Qwen tagged)")


if __name__ == "__main__":
    main()
