# CSG-eval

Evaluation and supporting tools for CSG-based SVG chart understanding. The repository includes SVG cleaning, semantic component tagging, scene-graph construction, and evaluation against labeled chart corpora.

## Repository structure

```text
CSG/
├── cleaning/   SVG normalization and SVGO optimization
├── tagging/    Browser-based semantic component recognition
│   └── case/   SVG cases loaded by the tagging application
└── graph/      Scene-graph and dependency-graph construction
    └── case/   Example SVGs and generated graph cases

eval/           Evaluation runners, mappings, comparisons, and reports
```

The tagging tool recognizes marks, axes, ticks, gridlines, legends, titles, annotations, and backgrounds. It runs in a real browser because it relies on `getBBox`, `getComputedStyle`, and `getScreenCTM`.

## Main components

- `CSG/cleaning/generate_syntactic_svg.py`: normalizes source SVGs and removes redundant content.
- `CSG/cleaning/svgo_optimizer.js`: applies SVGO optimization while retaining chart primitives needed by the tagger.
- `CSG/tagging/src/main.ts`: cleans the SVG DOM, infers component roles, and assigns semantic classes.
- `CSG/graph/make_graph.py`: constructs scene graphs and dependency graphs from SVG charts.
- `CSG/graph/main.py`: performs structure-aware SVG editing with the generated graph information.
- `eval/`: contains all evaluation orchestration, label mapping, comparison, and reporting code.

## Requirements

- Python 3
- Node.js
- Google Chrome

Install the JavaScript dependencies:

```bash
cd CSG/tagging
npm install

cd ../../eval
npm install
```

The graph scripts read API configuration from environment variables:

```bash
export OPENAI_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://api.openai.com/v1"
```

## Running the tagger and evaluation

Start the tagging application:

```bash
cd CSG/tagging
npm run dev -- --port 5180
```

Run either evaluation route from another terminal:

```bash
cd eval

# VisAnatomy evaluation
python3 run_full.py
QUIET=1 python3 compare.py predictions_full.json

# Generated-variant weak-GT evaluation
python3 run_variants.py
python3 compare_gt.py
```

The evaluation corpora are not included in this repository.
