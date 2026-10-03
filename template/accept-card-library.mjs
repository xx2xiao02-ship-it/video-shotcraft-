import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import {GRAPHIC_CONTRACTS} from '../director/graphic-contracts.mjs';

// Preserve historical refresh commands; default acceptance now covers exact gallery variants.
const historical=process.argv.some(arg=>['--legacy-card-sampling','--integration-only','--refresh-graphics'].includes(arg));
if (!historical) {
  await import('./accept-card-variants.mjs');
} else {
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'template','out','card-acceptance-20260930-v3');
fs.mkdirSync(out,{recursive:true});
const hash=filename=>crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const source=fs.readFileSync(path.join(root,'template/src/DynamicVideo.tsx'),'utf8');
const begin=source.indexOf('export const COMPONENT_MAP');
const mapped=[...source.slice(begin,source.indexOf('\n};',begin)).matchAll(/'([^']+\/[^']+)'\s*:/g)].map(match=>match[1]);
const index=JSON.parse(fs.readFileSync(path.join(root,'director/card-capability-index.json')));
const report={createdAt:new Date().toISOString(),scope:'157-card mapping + two-aspect representative-frame smoke; not production acceptance',
  sourceHashes:Object.fromEntries(['template/src/DynamicVideo.tsx','template/src/TemplateAdapter.tsx','director/graphic-contracts.mjs',
    'demos/data/hatch-depth/HatchDepth.tsx','demos/ui-entrance/bezier-source-converge-merge/BezierSourceConvergeMerge.tsx',
    'demos/typography/brace-expand/BraceExpand.tsx','demos/typography/lead-word-zoom-assemble/LeadWordZoomAssemble.tsx',
    'template/src/CardAcceptance.tsx'].map(file=>[file,hash(path.join(root,file))])),cards:[],businessCases:[]};
const refreshGraphics=process.argv.includes('--refresh-graphics');
if(process.argv.includes('--integration-only') || refreshGraphics){
  const previous=JSON.parse(fs.readFileSync(path.join(out,'acceptance.json')));
  const graphicSources=['demos/data/hatch-depth/HatchDepth.tsx','demos/ui-entrance/bezier-source-converge-merge/BezierSourceConvergeMerge.tsx'];
  for(const [file,sha] of Object.entries(report.sourceHashes))if(previous.sourceHashes[file]!==sha && !(refreshGraphics && graphicSources.includes(file)))throw new Error(`验收源码已变化：${file}`);
  report.cards=previous.cards;
  if(!refreshGraphics)report.businessCases=previous.businessCases;
}
const chrome='C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const serveUrl=await bundle({entryPoint:path.join(root,'template/src/index.ts'),publicDir:path.join(root,'template/public')});
const browser=await openBrowser('chrome',{browserExecutable:chrome});
const base=await selectComposition({serveUrl,id:'CardAcceptance',puppeteerInstance:browser,inputProps:{card:'typography/brace-expand'}});
const save=()=>fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));
const pixelCheck=file=>{
  const pixels=execFileSync('ffmpeg',['-v','error','-i',file,'-vf','scale=32:32','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,maxBuffer:1024*1024});
  const unique=new Set();for(let i=0;i<pixels.length;i+=3)unique.add(pixels.subarray(i,i+3).toString('hex'));
  return {nonblank:unique.size>8,sampledColors:unique.size};
};
async function still(card,aspect,props,tag,frame=100){
  const filename=path.join(out,`${tag}-${aspect}.png`);
  await renderStill({serveUrl,composition:{...base,width:aspect==='portrait'?1080:1920,height:aspect==='portrait'?1920:1080,props},
    inputProps:props,puppeteerInstance:browser,frame,scale:0.5,output:filename,timeoutInMilliseconds:15000,logLevel:'error'});
  return {file:filename,frame,...pixelCheck(filename)};
}
try {
  for(const [i,card] of (process.argv.includes('--integration-only') ? [] : index.cards).entries()){
    if(refreshGraphics && !GRAPHIC_CONTRACTS[card.id])continue;
    const variants=mapped.filter(id=>id===card.id||id.startsWith(card.id+'/'));
    const entry={id:card.id,componentVariants:variants,parameterContract:card.runtime,productionAccepted:false,results:[]};
    if(!variants.length)entry.blocker='missing-component-map';
    else {
      const selected=variants[0];
      for(const aspect of ['landscape','portrait']){
        try{let result=await still(selected,aspect,{card:selected},`card-${String(i+1).padStart(3,'0')}`);
          if(!result.nonblank)result={...await still(selected,aspect,{card:selected},`card-${String(i+1).padStart(3,'0')}-early`,45),initialSampleBlank:true};
          entry.results.push({aspect,...result});}
        catch(error){entry.results.push({aspect,error:String(error.message).slice(0,700)});}
      }
      entry.blocker=entry.results.some(result=>result.error)?'render-error':entry.results.some(result=>!result.nonblank)?'sampled-frames-blank-review-required':'business-parameters-and-layout-review-required';
    }
    if(refreshGraphics)report.cards[report.cards.findIndex(item=>item.id===card.id)]=entry;
    else report.cards.push(entry);
    save();console.log(`CARD ${i+1}/157 ${card.id} ${entry.blocker}`);
  }
  const cases=[{card:'typography/brace-expand',lines:['三件事避开多数理财坑']},
    {card:'typography/brace-expand',lines:['赚钱难度显著攀升']},
    {card:'typography/lead-word-zoom-assemble',lines:['严守本金','摒弃暴富妄念','远离高风险投资']},
    ...Object.entries(GRAPHIC_CONTRACTS).map(([card,contract])=>({card,lines:[card.startsWith('data/')?'资产不等于活钱':'三项行动汇成现金底气'],templateParams:contract.fixture}))];
  const boundaryCases=[{card:'data/hatch-depth',lines:['五项数据比较'],templateParams:{unit:'万',rows:[
    {label:'第一项资产',value:100},{label:'第二项资产',value:80},{label:'第三项资产',value:60},{label:'第四项资产',value:40},{label:'第五项资产',value:20}]}},
    {card:'ui-entrance/bezier-source-converge-merge',lines:['四类行动共同形成结果'],templateParams:{sources:['稳定现金收入','合理控制消费','及时偿还负债','保持应急储备'],target:'形成长期现金底气'}}];
  const businessFixtures=[...cases,...boundaryCases];
  for(const [i,fixture] of (process.argv.includes('--integration-only') ? [] : businessFixtures).entries()){
    const props={...fixture,injected:true};const entry={...fixture,results:[]};
    for(const aspect of ['landscape','portrait'])for(const frame of [54,100,158]){
      entry.results.push({aspect,...await still(fixture.card,aspect,props,`business-${i+1}-f${frame}`,frame)});
    }
    const filename=path.join(out,`business-${i+1}-portrait.mp4`);
    await renderMedia({serveUrl,composition:{...base,width:1080,height:1920,props},inputProps:props,
      puppeteerInstance:browser,codec:'h264',outputLocation:filename,concurrency:1,logLevel:'error'});
    entry.video=filename;report.businessCases.push(entry);save();console.log(`BUSINESS ${i+1}/${cases.length}`);
  }
  const original=JSON.parse(fs.readFileSync(path.join(root,'director/a-mode-runs/e9ee6d35-8303-46c1-a2a3-d55e4bb77bb0/storyboard.json')));
  const narration=['普通人做好三件事，就能避开大部分坑。','赚钱难度显著攀升。','严守本金，摒弃暴富妄念，远离高风险投资。','收入、节流、还债共同形成现金底气。','账面资产100万，可用现金10万。'];
  const storyboard={fps:30,aspectRatio:'9:16',mode:'A',style:original.style,theme:original.theme,
    shots:cases.map((fixture,i)=>({type:'content',text:narration[i],displayLines:fixture.lines,displayText:fixture.lines.join('\n'),
      shotCard:fixture.card,templateParams:fixture.templateParams,durationInFrames:180,
      material:original.shots[i].material || original.shots[0].material,materialRole:'backdrop'}))};
  const props={storyboard,materialApiBaseUrl:'http://127.0.0.1:8769'};
  const composition=await selectComposition({serveUrl,id:'DynamicVideo',puppeteerInstance:browser,inputProps:props});
  const video=path.join(out,'integrated-portrait.mp4');
  let progressBucket=-1;
  await renderMedia({serveUrl,composition,inputProps:props,puppeteerInstance:browser,codec:'h264',outputLocation:video,concurrency:1,logLevel:'error',
    onProgress:({renderedFrames})=>{const bucket=Math.floor(renderedFrames / 90);if(bucket!==progressBucket){progressBucket=bucket;console.log(`INTEGRATION ${renderedFrames}/${composition.durationInFrames}`);}}});
  execFileSync('ffmpeg',['-v','error','-i',video,'-f','null','-'],{windowsHide:true});
  report.integration={video,sha256:hash(video),frames:composition.durationInFrames,width:composition.width,height:composition.height,
    fixtureOnly:true,usesExistingBackgrounds:true,fullDecodePassed:true};save();
}finally{save();await browser.close({silent:true});}
console.log(JSON.stringify({cards:report.cards.length,businessCases:report.businessCases.length,out}));
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const statusLabels={'missing-component-map':'缺少组件映射','render-error':'渲染异常，禁止开放',
  'sampled-frames-blank-review-required':'样帧空白，待人工检查','business-parameters-and-layout-review-required':'样帧通过，业务参数与排版尚待验收'};
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>模板治理验收</title>
<style>body{margin:0;background:#101820;color:#f4f6f7;font:14px/1.6 'Microsoft YaHei',sans-serif}main{max-width:1100px;margin:auto;padding:24px}h1{font-size:24px}h2{font-size:18px}section{border-top:1px solid #4c5963;padding:18px 0}.images{display:flex;gap:12px;flex-wrap:wrap}img{height:240px;max-width:100%;object-fit:contain}video{width:200px;max-width:100%}table{width:100%;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid #35434e;padding:8px;overflow-wrap:anywhere}a{color:#ffb078}</style><main><h1>模板治理验收</h1><p>157 张卡逐卡检查。组件样帧检查不等于业务验收；未验收卡不开放。图形样板使用固定测试数据，本轮未调用收费模型。</p>
<section><h2>实际合成链样板（固定测试文案，含原素材背景）</h2><video controls preload="metadata" src="integrated-portrait.mp4"></video></section>
${report.businessCases.map((item,i)=>`<section><h2>${escape(item.card)}</h2><p>${escape(item.lines.join(' / '))}</p><div class="images">${item.results.filter(r=>r.aspect==='portrait').map(r=>`<a href="${escape(path.basename(r.file))}"><img src="${escape(path.basename(r.file))}" alt="第${r.frame}帧"></a>`).join('')}<video controls preload="metadata" src="${escape(path.basename(item.video))}"></video></div></section>`).join('')}
<section><h2>157 张卡检查记录</h2><table><thead><tr><th>镜头卡</th><th>组件映射</th><th>验收状态</th></tr></thead><tbody>${report.cards.map(item=>`<tr><td>${escape(item.id)}</td><td>${item.componentVariants.length}</td><td>${escape(statusLabels[item.blocker] || item.blocker)}</td></tr>`).join('')}</tbody></table></section><p><a href="acceptance.json">完整检查记录</a></p></main></html>`);
}
