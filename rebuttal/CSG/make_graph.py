import json
import os
import random
import re
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def extract_svg(text):
    match = re.search(r"<svg[\s\S]*?</svg>", text, re.IGNORECASE)
    return match.group(0) if match else text


def read_text(path):
    with open(path, "r", encoding="utf-8") as file:
        return file.read()


def read_json_template(path):
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def parse_json_response(content):
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    json_text = extract_first_json_object(content)
    if not json_text:
        raise ValueError("Invalid JSON response")
    json_text = re.sub(r",\s*([}\]])", r"\1", json_text)
    return json.loads(json_text)


def extract_first_json_object(text):
    start = text.find("{")
    if start == -1:
        return None
    in_string = False
    escape = False
    depth = 0
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
        else:
            if ch == '"':
                in_string = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
    return None


def call_api(prompt, model=None):
    api_key = os.environ["OPENAI_API_KEY"]
    url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    url = f"{url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    data = {
        "model": model or os.getenv("OPENAI_MODEL", "gpt-5.1"),
        "messages": [
            {"role": "system", "content": "You are an expert SVG scene graph generator."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
    }
    timeout = float(os.getenv("OPENAI_TIMEOUT", "600"))
    retries = int(os.getenv("OPENAI_RETRIES", "3"))
    backoff = float(os.getenv("OPENAI_BACKOFF", "1.0"))
    retry = Retry(
        total=retries,
        connect=retries,
        read=retries,
        status=retries,
        backoff_factor=backoff,
        status_forcelist=[408, 429, 500, 502, 503, 504],
        allowed_methods=["POST"],
    )
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    sleep_base = float(os.getenv("OPENAI_RETRY_SLEEP_BASE", "2"))
    last_error = None
    for attempt in range(retries + 1):
        try:
            response = session.post(url, headers=headers, json=data, timeout=timeout)
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]
        except requests.exceptions.RequestException as error:
            last_error = error
            if attempt < retries:
                delay = sleep_base * (2 ** attempt) + random.random()
                time.sleep(delay)
            else:
                break
    raise RuntimeError(f"Request failed: {last_error}") from last_error


def build_scene_graph_prompt(svg_text, scene_graph_template):
    return (
    "You are given an SVG string and a Scene Graph JSON template.\n"
    "Your task is to analyze the SVG and populate the template with concrete values.\n\n"

    "Requirements:\n"
    "1. Strictly follow the provided JSON schema. Do NOT change field names or structure.\n"
    "2. You MAY expand list-type fields (e.g., marks, ticks, legend items) to include multiple instances if needed.\n"
    "3. Do NOT add new keys that are not defined in the templates.\n"
    "4. Only fill in values that can be directly inferred from the SVG.\n"
    "5. If a value cannot be determined, set it to null.\n"
    "6. Preserve all hierarchical relationships and nesting.\n"
    "Output Format:\n"
    "- Return ONLY a valid JSON object for the scene graph.\n"
    "- Do NOT include any explanations, comments, or extra text.\n\n"

    "SVG:\n"
    f"{svg_text}\n\n"

    "SceneGraph Template:\n"
    f"{json.dumps(scene_graph_template, ensure_ascii=False, indent=2)}\n"
)


def build_dependencies_prompt(svg_text, scene_graph, dependencies_template):
    return (
    "You are given an SVG string, a Scene Graph JSON, and a Dependencies JSON template.\n"
    "Your task is to analyze the SVG and the Scene Graph, then populate the Dependencies template.\n\n"

    "Requirements:\n"
    "1. Strictly follow the provided JSON schema, but you MAY add optional fields if they help explicit reasoning (e.g., element_id, element_path, svg_selector, hierarchy_path, source_value, target_value).\n"
    "2. For each dependency, locate the corresponding SVG element pair and extract concrete attributes and values from the SVG (positions, sizes, domains, transforms).\n"
    "3. Populate dependencies with these concrete element references and values so the relationships are explicit and traceable.\n"
    "4. You MAY adapt the dependencies content to make global-edit reasoning easier, as long as the JSON remains valid and consistent.\n"
    "5. Only include relationships that are clearly supported by the SVG.\n"
    "6. Ensure all referenced elements exist in the provided scene_graph.\n"
    "7. Avoid redundant or duplicated dependencies.\n\n"

    "Output Format:\n"
    "- Return ONLY a valid JSON object for dependencies.\n"
    "- Do NOT include any explanations, comments, or extra text.\n\n"

    "SVG:\n"
    f"{svg_text}\n\n"
    "SceneGraph:\n"
    f"{json.dumps(scene_graph, ensure_ascii=False, indent=2)}\n\n"
    "Dependencies Template:\n"
    f"{json.dumps(dependencies_template, ensure_ascii=False, indent=2)}\n"
)


def build_repair_prompt(name, json_text, json_template):
    return (
    f"You are given a JSON response for {name}, but it is invalid.\n"
    "Fix it to be valid JSON that strictly matches the provided template structure.\n"
    "Do NOT add explanations or extra text. Return ONLY the repaired JSON.\n\n"
    "Invalid JSON:\n"
    f"{json_text}\n\n"
    "Template:\n"
    f"{json.dumps(json_template, ensure_ascii=False, indent=2)}\n"
)


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    input_paths = [
    #    "infer_results/bar1.svg",
    #    "infer_results/donut.svg",
    #    "infer_results/area.svg",
    #    "infer_results/Gantt.svg",
    #    "infer_results/group_bar.svg",
    #    "infer_results/group_bar2.svg",
    #    "infer_results/group_bar3.svg",
    #    "infer_results/line.svg",
    #    "infer_results/line3.svg",
    #    "infer_results/pie.svg",
    #    "infer_results/rangechart.svg",
    #    "infer_results/scatter.svg",
        "infer_results/stacked_bar1.svg",
    ]
    scene_graph_template = read_json_template(os.path.join(script_dir, "scene_graph.json"))
    dependencies_template = read_json_template(os.path.join(script_dir, "dependencies.json"))
    for input_path in input_paths:
        if not input_path:
            continue
        try:
            raw_text = read_text(input_path)
            svg_text = extract_svg(raw_text)
            base_dir = os.path.dirname(input_path) or "."
            scene_graph_prompt = build_scene_graph_prompt(svg_text, scene_graph_template)
            scene_graph_text = call_api(scene_graph_prompt)
            try:
                scene_graph = parse_json_response(scene_graph_text)
            except Exception:
                repair_prompt = build_repair_prompt("scene_graph", scene_graph_text, scene_graph_template)
                repaired_text = call_api(repair_prompt)
                try:
                    scene_graph = parse_json_response(repaired_text)
                except Exception as error:
                    raise RuntimeError(f"Failed to repair scene_graph JSON: {error}") from error
            dependencies_prompt = build_dependencies_prompt(svg_text, scene_graph, dependencies_template)
            dependencies_text = call_api(dependencies_prompt)
            try:
                dependencies = parse_json_response(dependencies_text)
            except Exception:
                repair_prompt = build_repair_prompt("dependencies", dependencies_text, dependencies_template)
                repaired_text = call_api(repair_prompt)
                try:
                    dependencies = parse_json_response(repaired_text)
                except Exception as error:
                    raise RuntimeError(f"Failed to repair dependencies JSON: {error}") from error
            base_name = os.path.splitext(os.path.basename(input_path))[0]
            scene_graph_path = os.path.join(base_dir, f"{base_name}_scene_graph.json")
            dependencies_path = os.path.join(base_dir, f"{base_name}_dependencies.json")
            write_json(scene_graph_path, scene_graph)
            write_json(dependencies_path, dependencies)
            print(scene_graph_path)
            print(dependencies_path)
        except RuntimeError as error:
            print(f"Failed: {input_path}")
            print(error)


if __name__ == "__main__":
    main()
