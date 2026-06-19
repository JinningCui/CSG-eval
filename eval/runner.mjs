// Drives the real svg-chart-reuse vite app in headless Chrome, lets its
// pipeline tag every element, then dumps {file -> [{class, tag, bbox}]} in
// SVG userspace coordinates (matching VisAnatomy annotation bbox space).
import puppeteer from "puppeteer-core";
import { writeFileSync } from "fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.env.APP_URL || "http://localhost:5180";
const OUT = process.env.OUT || "predictions.json";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--window-size=1200,1000"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 1000 });
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

await page.goto(URL, { waitUntil: "networkidle0", timeout: 90000 });
// pipeline runs in setTimeout(0); give it a moment (scale with batch size)
await new Promise((r) => setTimeout(r, Number(process.env.WAIT || 2500)));

const result = await page.evaluate(() => {
  // element coords in SVG userspace (cancels the 100% -> px screen scaling),
  // mirrors getElementCoordinates() in the tool.
  function coords(svg, el) {
    const b = el.getBBox();
    const s = svg.getScreenCTM();
    const e = el.getScreenCTM();
    if (!s || !e) {
      return { xMin: b.x, yMin: b.y, xMax: b.x + b.width, yMax: b.y + b.height };
    }
    const m = s.inverse().multiply(e);
    const pts = [
      new DOMPoint(b.x, b.y).matrixTransform(m),
      new DOMPoint(b.x + b.width, b.y).matrixTransform(m),
      new DOMPoint(b.x, b.y + b.height).matrixTransform(m),
      new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(m),
    ];
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return {
      xMin: Math.min(...xs), xMax: Math.max(...xs),
      yMin: Math.min(...ys), yMax: Math.max(...ys),
    };
  }
  const out = {};
  for (const container of document.querySelectorAll("[data-file]")) {
    const file = container.getAttribute("data-file");
    const svg = container.querySelector("svg");
    if (!svg) { out[file] = []; continue; }
    const items = [];
    for (const el of svg.querySelectorAll("[class]")) {
      const cls = el.getAttribute("class") || "";
      let c;
      try { c = coords(svg, el); } catch { continue; }
      items.push({ cls, tag: el.tagName, ...c });
    }
    out[file] = items;
  }
  return out;
});

writeFileSync(OUT, JSON.stringify(result, null, 2));
const n = Object.entries(result).map(([k, v]) => `${k}:${v.length}`).join("  ");
console.log("extracted ->", OUT, "|", n);
await browser.close();
