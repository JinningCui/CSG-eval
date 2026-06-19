"""
Inject weak ground-truth role into each SVG leaf as a data-gt attribute,
derived from the generator-native class of the nearest meaningful ancestor.
The tool's cleaning strips `class`/`style` but NOT `data-*`, and keeps the same
nodes, so after processing each element carries both data-gt (truth) and the
tool's inferred `class` (prediction) -> 1:1 pairing, no geometric alignment.

Roles use the coarse unified vocab from mapping.py.
GT is WEAK/NOISY (class-name heuristics); plotly is cleanest, fusion/chartblocks
are indicative.
"""
import sys, os, re
import xml.etree.ElementTree as ET

SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")

TEXT_TAGS = {"text"}
SHAPE_TAGS = {"path", "rect", "circle", "line", "polygon", "polyline",
              "ellipse", "use", "image"}


def tag(e):
    return re.sub(r"\{[^}]*\}", "", e.tag)


def _first(chain, rules):
    """chain: list of class strings nearest->farthest. rules: list of (regex, role)."""
    for cls in chain:
        for rgx, role in rules:
            if re.search(rgx, cls, re.I):
                return role
    return None


PLOTLY = [
    (r"\bpoints\b|\btrace\b|\bbars\b|scatterlayer|barlayer|\bfills\b|\blines\b(?!.*axis)", "mark"),
    (r"legendtext", "legend-label"),
    (r"legendsymbols|legendbar|legendpoints|legendtoggle", "legend-mark"),
    (r"gtitle|xtitle|ytitle", "title"),
    (r"xtick|ytick", "axis-label"),
    (r"annotation", "annotation"),
    (r"gridlayer|\bgrid\b", "gridline"),
    (r"\bbg\b|bglayer|\bbackground\b", "other"),
]

CHARTBLOCKS = [
    (r"data-label", "annotation"),
    (r"\barc\b|\bshape\b|\bseries\b|\bbar\b|\bpoint\b|\bcolumn\b|\bslice\b", "mark"),
    (r"legend|\bkey\b", "legend-label"),
    (r"\baxis\b|tick", "axis-label"),
    (r"\bgrid\b", "gridline"),
    (r"\btitle\b|\blabel\b", "title"),
]

FUSION = [
    (r"datalabel", "annotation"),
    (r"\bcolumns?\b|dataset-?[A-Za-z]*-?group|anchor|\bpie\b|\bdataset\b(?!-axis)", "mark"),
    (r"axis-?name|caption|subcaption", "title"),
    (r"axis-line-tick|\btick\b", "axis-tick"),
    (r"axis-lines|divline|\bgrid\b", "gridline"),
    (r"axis-line", "axis-line"),
    (r"dataset-axis|\baxis\b", "axis-label"),
    (r"legend", "legend-label"),
    (r"background|\bcanvas\b|\bbg\b", "other"),
]

RULES = {"plotly_export": PLOTLY, "chartblocks": CHARTBLOCKS,
         "fusion_clean": FUSION}


def fusion_norm(cls):
    return re.sub(r"raphael-group-[0-9]+-", "", re.sub(r"raphael-", "", cls))


def inject(infile, outfile, source):
    rules = RULES[source]
    tree = ET.parse(infile)
    root = tree.getroot()
    parent = {c: p for p in root.iter() for c in p}

    def chain(e):
        out = []
        cur = e
        while cur is not None:
            c = cur.get("class", "")
            if source == "fusion_clean":
                c = fusion_norm(c)
            if c:
                out.append(c)
            cur = parent.get(cur)
        return out

    n = 0
    for e in root.iter():
        t = tag(e)
        if t in TEXT_TAGS or t in SHAPE_TAGS:
            role = _first(chain(e), rules)
            if role:
                e.set("data-gt", role)
                n += 1
    tree.write(outfile, encoding="unicode", xml_declaration=False)
    return n


if __name__ == "__main__":
    src = sys.argv[1]
    inp = sys.argv[2]
    out = sys.argv[3]
    print("injected", inject(inp, out, src), "data-gt attrs")
