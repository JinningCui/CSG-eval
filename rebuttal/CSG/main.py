import json
import os
import random
import re
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def get_chat_gpt_response(svg_text, instruction, scene_graph_text=None, dependencies_text=None, model=None):
    api_key = os.environ["OPENAI_API_KEY"]
    url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    url = f"{url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    prompt = (
        "You are given:\n"
        "1. An SVG chart\n"
        "2. The dependency schema representing the relationships between elements\n"
        "3. An editing instruction\n\n"
        "## Task\n"
        "Perform a **global, structure-aware edit** of the SVG.\n\n"
        "---\n\n"
        "## Process (MANDATORY)\n"
        "1. Identify directly affected elements and their original values according to the svg code and scene graph.\n"
        "2. Trace dependencies using the provided JSONs (Pay special attention to `layout_cascade`).\n"
        "3. CALCULATE the new quantitative values. If mark width/height changes and padding is fixed, mathematically deduce the new axis length and viewBox dimensions.\n"
        "4. Apply edits in a consistent order: element → layout → axis → dependent elements.\n"
        "Do not skip dependency reasoning.\n\n"
        "## CRITICAL CONSTRAINTS (DO NOT VIOLATE)\n"
        "1. **ZERO DELETION**: You MUST preserve EVERY single element from the original SVG (axes, text labels, legends, ALL segments and colors of stacked bars). Do NOT delete any nodes unless explicitly requested.\n"
        "2. **NO SHORTCUTS**: Do NOT use comments like `<!-- rest of the code -->` or `...`. You MUST output the complete, fully renderable SVG code.\n"
        "3. **COORDINATE SHIFTING**: If you change the thickness/size of an element, you MUST mathematically recalculate and shift the position (e.g., `x` or `y` attribute) of ALL subsequent elements and groups. You must manually add the size difference to their coordinates to maintain the original padding/gap. Elements MUST NOT overlap.\n"
        "4. **CANVAS EXPANSION**: If the total computed layout size increases, you MUST expand the `<svg viewBox=\"...\">` and axis lines accordingly so nothing is clipped.\n\n"
        "## Requirements\n"
        "1. Preserve stacking, alignment, and spacing constraints.\n"
        "2. Maintain consistent gaps and proportions.\n"
        "3. Ensure all elements remain within valid axis ranges.\n\n"
        "## Output Format (STRICT)\n"
        "Output the COMPLETE modified SVG inside an ```xml code block.\n\n"
        "## Goal\n"
        "Modify the SVG while preserving all structural relationships defined by the provided JSONs.\n\n"
    )
    if scene_graph_text:
        prompt += f"SceneGraph:\n{scene_graph_text}\n\n"
    if dependencies_text:
        prompt += f"Dependencies:\n{dependencies_text}\n\n"
    prompt += f"Instruction:\n{instruction}\n\nSVG:\n{svg_text}"
    data = {
        "model": model or os.getenv("OPENAI_MODEL", "gpt-5.1"),
        "messages": [
            {"role": "system", "content": "You are an expert SVG editor."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "max_tokens": int(os.getenv("OPENAI_MAX_TOKENS", "162384")),
    }
    connect_timeout = float(os.getenv("OPENAI_CONNECT_TIMEOUT", "10"))
    read_timeout = float(os.getenv("OPENAI_READ_TIMEOUT", os.getenv("OPENAI_TIMEOUT", "180")))
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
            response = session.post(url, headers=headers, json=data, timeout=(connect_timeout, read_timeout))
            response.raise_for_status()
            result = response.json()
            content = result["choices"][0]["message"]["content"]
            return extract_svg_from_response(content)
        except KeyboardInterrupt as error:
            raise RuntimeError("Request cancelled by user.") from error
        except requests.exceptions.HTTPError as error:
            if error.response is not None:
                raise RuntimeError(f"Request failed: {error} | {error.response.text}") from error
            last_error = error
            break
        except requests.exceptions.RequestException as error:
            last_error = error
            if attempt < retries:
                delay = sleep_base * (2 ** attempt) + random.random()
                time.sleep(delay)
            else:
                break
    raise RuntimeError(f"Request failed: {last_error}") from last_error


def read_text(path):
    with open(path, "r", encoding="utf-8") as file:
        return file.read()


def read_json_text(path):
    with open(path, "r", encoding="utf-8") as file:
        data = json.load(file)
    return json.dumps(data, ensure_ascii=False, indent=2)


def extract_svg_from_response(text):
    match = re.search(r"```xml\s*([\s\S]*?)```", text, re.IGNORECASE)
    if match:
        text = match.group(1).strip()
    match = re.search(r"<svg[\s\S]*?</svg>", text, re.IGNORECASE)
    return match.group(0) if match else text


def write_svg(path, content):
    with open(path, "w", encoding="utf-8") as file:
        file.write(content)


def main():
    svg_path = os.getenv("SVG_PATH", "Path to your SVG")
    scene_graph_path = os.getenv("SCENE_GRAPH_PATH", "")
    dependencies_path = os.getenv("DEPENDENCIES_PATH", "Path to your dependencies JSON")
    instruction = "Raise each stacked bar a little wider along the x-axis. However, the original bar spacing remains unchanged. Also, be sure to adjust the vertical axis and the subscripts as necessary."
    # instruction = "I would like the axis-y range to be from 0 to 1000, with each 200 representing a tick mark."
    svg_text = read_text(svg_path)
    scene_graph_text = read_json_text(scene_graph_path) if scene_graph_path else None
    dependencies_text = read_json_text(dependencies_path) if dependencies_path else None
    modified_svg = get_chat_gpt_response(svg_text, instruction, scene_graph_text, dependencies_text)
    print(modified_svg)
    output_path = input("输出文件路径(留空不保存): ").strip().strip('"')
    if output_path:
        write_svg(output_path, modified_svg)


if __name__ == "__main__":
    main()
