import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DIVI="/Users/cjn/Desktop/个人/Project/Vis2026/divi/dist/divi.min.js";
const SVGDIR=process.env.SVGDIR || "/Users/cjn/Desktop/个人/Project/Vis2026/VisAnatomy/charts_svg_cleaned_svgo";
const OUT=process.env.OUT || "predictions_divi.json";
const files=readFileSync("cartesian_list.txt","utf8").split("\n").map(s=>s.trim()).filter(Boolean);
const ROLE2CLS={tick:"tick","orphan-tick":"tick","axis-domain":"domain-x","axis-label":"axis-x label",legend:"legend label",title:"title",mark:"mark-1"};
const diviSrc=readFileSync(DIVI,"utf8");
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setViewport({width:1200,height:1000});
const result={}; let i=0, fails=0;
for(const f of files){
  let svgText;
  try { svgText=readFileSync(`${SVGDIR}/${f}`,"utf8"); } catch { result[f]=[]; continue; }
  let items=[];
  try {
    items=await p.evaluate(async (svgText, ROLE2CLS, diviSrc)=>{
      if(!window.divi){ const s=document.createElement('script'); s.textContent=diviSrc; document.head.appendChild(s); }
      document.body.style.margin='0';
      document.body.innerHTML=`<div id="c">${svgText}</div>`;
      const svg=document.querySelector('#c svg'); if(!svg) return [];
      // 确保有具体渲染尺寸(原始图可能是 100% 或只有 viewBox)
      let w=svg.getAttribute('width'), h=svg.getAttribute('height');
      const vb=svg.getAttribute('viewBox');
      if(!w||w.includes('%')||!h||h.includes('%')){
        if(vb){ const q=vb.split(/[ ,]+/).map(Number); svg.setAttribute('width',q[2]); svg.setAttribute('height',q[3]); }
        else { svg.setAttribute('width','900'); svg.setAttribute('height','700'); }
      }
      try { window.divi.parseChart(window.divi.inspect(svg)); } catch(e){}
      const out=[];
      document.querySelectorAll('#c svg *').forEach(el=>{ const r=el._role_; if(r && ROLE2CLS[r]) out.push({cls:ROLE2CLS[r], tag:el.tagName}); });
      return out;
    }, svgText, ROLE2CLS, diviSrc);
  } catch(e){ fails++; items=[]; }
  result[f]=items; i++;
  if(i%50===0) process.stderr.write(`${i}/${files.length} (fails ${fails})\n`);
}
writeFileSync(OUT, JSON.stringify(result));
console.log("done", Object.keys(result).length, "charts, fails", fails, "->", OUT);
await b.close();
