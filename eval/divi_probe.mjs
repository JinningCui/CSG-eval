import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
const CHROME=process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DIVI=process.env.DIVI_PATH || "Path to the DIVI bundle";
const svgText=readFileSync(process.argv[2],"utf8");
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(e.message));
await p.setViewport({width:900,height:900});
await p.setContent(`<!doctype html><html><body><div id="c">${svgText}</div></body></html>`);
await p.addScriptTag({path:DIVI});
const out=await p.evaluate(async ()=>{
  const svg=document.querySelector('#c svg');
  if(!svg) return {err:'no svg'};
  if(!svg.getAttribute('width')) svg.setAttribute('width','512');
  if(!svg.getAttribute('height')) svg.setAttribute('height','512');
  let st;
  try { st = window.divi.parseChart(window.divi.inspect(svg)); }
  catch(e){ return {err:'parseChart threw: '+e.message}; }
  const roleCount={};
  document.querySelectorAll('#c svg *').forEach(el=>{ const r=el._role_; if(r) roleCount[r]=(roleCount[r]||0)+1; });
  return {
    axes:(st.axes||[]).map(a=>({nTicks:(a.ticks||[]).length})),
    legends:(st.legends||[]).length,
    svgMarks:(st.svgMarks||[]).length,
    roleCount, dataError: st.dataError||null
  };
});
console.log("pageerrors:", errs.slice(0,2));
console.log(JSON.stringify(out,null,2));
await b.close();
