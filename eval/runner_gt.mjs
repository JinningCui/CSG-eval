// Like runner.mjs but extracts BOTH data-gt (weak truth) and class (tool pred)
// for every element carrying either. No geometry needed.
import puppeteer from "puppeteer-core";
import { writeFileSync } from "fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.env.APP_URL || "http://localhost:5180";
const OUT = process.env.OUT || "preds_gt.json";

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--no-sandbox", "--window-size=1200,1000"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 1000 });
await page.goto(URL, { waitUntil: "networkidle0", timeout: 90000 });
await new Promise((r) => setTimeout(r, Number(process.env.WAIT || 2500)));

const result = await page.evaluate(() => {
  const out = {};
  for (const container of document.querySelectorAll("[data-file]")) {
    const file = container.getAttribute("data-file");
    const svg = container.querySelector("svg");
    if (!svg) { out[file] = []; continue; }
    const items = [];
    for (const el of svg.querySelectorAll("[data-gt],[class]")) {
      const gt = el.getAttribute("data-gt");
      const cls = el.getAttribute("class");
      if (!gt && !cls) continue;
      items.push({ gt: gt || "", cls: cls || "", tag: el.tagName });
    }
    out[file] = items;
  }
  return out;
});

writeFileSync(OUT, JSON.stringify(result, null, 2));
const n = Object.entries(result).map(([k, v]) => `${k}:${v.length}`).join("  ");
console.log("extracted ->", OUT, "|", n);
await browser.close();
