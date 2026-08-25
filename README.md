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

Install the cleaning and tagging dependencies:

```bash
python3 -m pip install lxml cssselect cssutils

cd CSG/cleaning
npm install --no-save svgo

cd ../tagging
npm install

cd ../..
```

The graph construction and inference scripts use an OpenAI-compatible API:

```bash
export OPENAI_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://api.openai.com/v1"
export OPENAI_MODEL="gpt-5.1"
```

## End-to-end workflow

The processing order for one SVG chart is:

```text
SVG → cleaning → tagging → graph construction → inference
```

Run all commands below from the repository root unless otherwise noted.

### 1. Clean the SVG

The cleaning scripts process every `.svg` file in the input directory. To process one chart, place only that chart in a temporary input directory:

```bash
mkdir -p work/input work/cleaned work/optimized
cp "Path to your SVG" work/input/chart.svg

SVG_DIR="$PWD/work/input" \
OUTPUT_DIR="$PWD/work/cleaned" \
python3 CSG/cleaning/generate_syntactic_svg.py

SVG_DIR="$PWD/work/cleaned" \
OUTPUT_DIR="$PWD/work/optimized" \
node CSG/cleaning/svgo_optimizer.js
```

The cleaned and optimized SVG is written to `work/optimized/chart.svg`.

### 2. Tag the SVG components

The tagging application loads `.txt` files from `CSG/tagging/case/`. Copy the optimized SVG there and change its extension to `.txt`:

```bash
cp work/optimized/chart.svg CSG/tagging/case/chart.txt

cd CSG/tagging
npm run dev -- --port 5180
```

Open `http://localhost:5180` in Google Chrome. After the chart is processed, click **Download SVGs**. The downloaded `chart.svg` contains semantic classes for marks, axes, ticks, gridlines, legends, titles, annotations, and backgrounds.

Copy the tagged SVG into the graph cases directory:

```bash
cd ../..
cp "Path to the downloaded tagged SVG" CSG/graph/case/chart.svg
```

### 3. Build the scene graph and dependency graph

In `CSG/graph/make_graph.py`, set `input_paths` to:

```python
input_paths = [os.path.join(case_dir, "chart.svg")]
```

Then run:

```bash
python3 CSG/graph/make_graph.py
```

This creates:

```text
CSG/graph/case/chart_scene_graph.json
CSG/graph/case/chart_dependencies.json
```

### 4. Run structure-aware SVG inference

Set the editing instruction in `CSG/graph/main.py`, then run:

```bash
SVG_PATH="$PWD/CSG/graph/case/chart.svg" \
SCENE_GRAPH_PATH="$PWD/CSG/graph/case/chart_scene_graph.json" \
DEPENDENCIES_PATH="$PWD/CSG/graph/case/chart_dependencies.json" \
python3 CSG/graph/main.py
```

The script prints the modified SVG and asks for an output path. Enter a path such as `CSG/graph/case/chart_modified.svg`, or leave it empty to skip saving.

## Evaluation

Install the evaluation dependency and start the tagging application before running the evaluation scripts:

```bash
cd eval
npm install

# VisAnatomy evaluation
python3 run_full.py
QUIET=1 python3 compare.py predictions_full.json

# Generated-variant weak-GT evaluation
python3 run_variants.py
python3 compare_gt.py
```

The evaluation corpora are not included in this repository.
