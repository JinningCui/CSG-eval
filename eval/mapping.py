"""
Label normalization between VisAnatomy `role` and svg-chart-reuse `class`.

Both sides are collapsed to a small COARSE role vocabulary so they are
comparable. The user asked for role-level matching only ("不用太细"), so finer
distinctions VisAnatomy makes (axis-N, polar/angular variants, chart vs axis vs
legend title) are folded together where svg-chart-reuse cannot express them.
"""

# Unified coarse vocabulary
MARK        = "mark"
AXIS_LABEL  = "axis-label"
AXIS_TICK   = "axis-tick"
AXIS_LINE   = "axis-line"
GRIDLINE    = "gridline"
LEGEND_LABEL = "legend-label"
LEGEND_MARK  = "legend-mark"
TITLE       = "title"        # chart / axis / legend titles all collapse here
ANNOTATION  = "annotation"   # in-plot data labels / annotations
OTHER       = "other"        # background, noise, none, unmatched

UNIFIED = [MARK, AXIS_LABEL, AXIS_TICK, AXIS_LINE, GRIDLINE,
           LEGEND_LABEL, LEGEND_MARK, TITLE, ANNOTATION, OTHER]


def norm_gt(role: str) -> str:
    """VisAnatomy role -> unified coarse role."""
    if not role:
        return OTHER
    r = role.strip().lower()
    if "main chart mark" in r:
        return MARK
    if "gridline" in r:
        return GRIDLINE
    if "legend" in r:
        if "label" in r:
            return LEGEND_LABEL
        if "mark" in r:
            return LEGEND_MARK
        if "title" in r:
            return TITLE
        if "tick" in r:
            return LEGEND_MARK   # legend ticks -> fold into legend-mark (coarse)
        return LEGEND_MARK
    if "axis" in r:
        if "title" in r:
            return TITLE
        if "label" in r:
            return AXIS_LABEL
        if "tick" in r:
            return AXIS_TICK
        if "line" in r or "path" in r:
            return AXIS_LINE
        return AXIS_LABEL
    if "chart title" in r or r == "title":
        return TITLE
    if "annotation" in r:
        return ANNOTATION
    if r in ("none", "noise"):
        return OTHER
    return OTHER


def norm_pred(class_str: str) -> str:
    """svg-chart-reuse class attribute -> unified coarse role."""
    if not class_str:
        return OTHER
    classes = class_str.strip().lower().split()
    cs = set(classes)
    # legend first (legend marks also carry 'mark')
    if "legend" in cs:
        if "label" in cs:
            return LEGEND_LABEL
        if "mark" in cs:
            return LEGEND_MARK
        return LEGEND_MARK
    if any(c.startswith("mark-") or c == "mark" for c in classes):
        return MARK
    if "tick" in cs:
        return AXIS_TICK
    # axis labels carry "axis-x"/"axis-y" + "label"
    if ("axis-x" in cs or "axis-y" in cs) and "label" in cs:
        return AXIS_LABEL
    if any(c.startswith("domain-") for c in classes):
        return AXIS_LINE
    if any(c.startswith("grid-") for c in classes):
        return GRIDLINE
    if "title" in cs:
        return TITLE
    if "label" in cs:            # generic in-plot text
        return ANNOTATION
    if "background" in cs:
        return OTHER
    return OTHER


if __name__ == "__main__":
    # quick smoke test of the vocab coverage
    import json, glob, collections
    c = collections.Counter()
    for f in glob.glob("../VisAnatomy/annotations/*.json")[:200]:
        try:
            d = json.load(open(f))
        except Exception:
            continue
        for el in d.get("allElements", {}).values():
            if "role" in el:
                c[norm_gt(el["role"])] += 1
    for k, v in c.most_common():
        print(f"{v:7d}  {k}")
