# CSG-eval

Evaluation harness for **svg-chart-reuse**, a tool that infers semantic roles
(marks, axes, ticks, gridlines, legend, titles, annotations) of SVG chart
elements. This repo benchmarks the tool against two labeled corpora and reports
per-component accuracy.

## Layout

```
svg-chart-reuse/   The tool under test (Vite + TS). Runs in the browser.
eval/              Evaluation scripts (Node + Python).
```

> `svg-chart-reuse/` is vendored from the upstream project
> [CrMo2001/svg-chart-reuse](https://github.com/CrMo2001/svg-chart-reuse).
> The only local change is one line in `src/main.ts` adding a `data-file`
> attribute so the eval runner can identify each processed chart.

## How it works

The tool relies on `getBBox` / `getComputedStyle` / `getScreenCTM`, so it only
runs in a real browser. The harness drives the tool's actual Vite app in
**headless Chrome** (via `puppeteer-core` + system Chrome), lets the pipeline
tag every element, then reads the tags back out — zero reimplementation of the
tool's logic.

Two evaluation routes:

- **Route A — VisAnatomy** (human-annotated): align tool output to ground-truth
  elements by bounding-box IoU, normalize both label sets to a coarse vocab,
  score. Scripts: `run_full.py`, `runner.mjs`, `compare.py`, `mapping.py`.
- **Route B — generated_variants** (no annotations): inject weak ground-truth
  `data-gt` attributes derived from each generator's native CSS classes; since
  the tool's cleaning preserves `data-*`, every element ends up carrying both
  truth and prediction for a clean 1:1 comparison. Scripts: `inject_gt.py`,
  `run_variants.py`, `runner_gt.mjs`, `compare_gt.py`.

## Requirements

- Node.js (tested v24), Python 3 (stdlib only — no pip deps)
- Google Chrome installed (path is hardcoded for macOS in the `.mjs` runners)
- `cd eval && npm i` to get `puppeteer-core`
- `cd svg-chart-reuse && npm i` to get `vite`

## Running

```bash
# 1. start the tool's dev server
cd svg-chart-reuse && npm run dev -- --port 5180

# 2a. Route A (VisAnatomy)
cd eval && python3 run_full.py && QUIET=1 python3 compare.py predictions_full.json

# 2b. Route B (generated_variants)
cd eval && python3 run_variants.py && python3 compare_gt.py
```

The two test corpora (VisAnatomy, generated_variants) are not included here.
