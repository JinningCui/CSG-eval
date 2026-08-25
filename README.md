# CSG-eval

Tools for SVG cleaning, semantic tagging, graph construction, inference, and evaluation.

```text
CSG/
├── cleaning/   SVG normalization and optimization
├── tagging/    Semantic component tagging
└── graph/      Scene graph, dependency graph, and inference

eval/           Evaluation scripts
```

## Installation

```bash
python3 -m pip install lxml cssselect cssutils requests

cd CSG/cleaning
npm install --no-save svgo

cd ../tagging
npm install

cd ../../eval
npm install
```

Set the API configuration before graph construction and inference:

```bash
export OPENAI_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://api.openai.com/v1"
export OPENAI_MODEL="gpt-5.1"
```

## Workflow

```text
SVG → cleaning → tagging → graph construction → inference
```

Run the following commands from the repository root.

### 1. Cleaning

Place the SVG in a separate input directory:

```bash
mkdir -p work/input work/cleaned work/optimized
cp "Path to your SVG" work/input/chart.svg

SVG_DIR="$PWD/work/input" OUTPUT_DIR="$PWD/work/cleaned" \
python3 CSG/cleaning/generate_syntactic_svg.py

SVG_DIR="$PWD/work/cleaned" OUTPUT_DIR="$PWD/work/optimized" \
node CSG/cleaning/svgo_optimizer.js
```

### 2. Tagging

```bash
cp work/optimized/chart.svg CSG/tagging/case/chart.txt
cd CSG/tagging
npm run dev -- --port 5180
```

Open `http://localhost:5180` and click **Download SVGs**. Copy the downloaded `chart.svg` to `CSG/graph/case/chart.svg`.

### 3. Graph construction

Set `input_paths` in `CSG/graph/make_graph.py`:

```python
input_paths = [os.path.join(case_dir, "chart.svg")]
```

Run:

```bash
python3 CSG/graph/make_graph.py
```

### 4. Inference

Set the editing instruction in `CSG/graph/main.py`, then run:

```bash
SVG_PATH="$PWD/CSG/graph/case/chart.svg" \
SCENE_GRAPH_PATH="$PWD/CSG/graph/case/chart_scene_graph.json" \
DEPENDENCIES_PATH="$PWD/CSG/graph/case/chart_dependencies.json" \
python3 CSG/graph/main.py
```

## Evaluation

Start the tagging server, then run the required evaluation:

```bash
cd eval

python3 run_full.py
QUIET=1 python3 compare.py predictions_full.json

python3 run_variants.py
python3 compare_gt.py
```

Evaluation datasets are not included.
