import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
import {buildSourceAudit} from '../director/card-source-audit.mjs';
import {cardAcceptancePlan} from '../director/card-acceptance-plan.mjs';
import {ffmpegPath} from '../director/packaging-media.mjs';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'template/out/card-variant-smoke-batch003-v2');
const plan=cardAcceptancePlan(buildSourceAudit(root));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex');
const sources=[...new Set(['template/src/DynamicVideo.tsx','template/src/TemplateAdapter.tsx','template/src/CardAcceptance.tsx',
  'demos/_fixtures/Fixtures.tsx','demos/_fixtures/Motion.tsx','demos/_fixtures/TemplateSkin.ts',
  'director/card-source-audit.mjs','director/card-variant-aliases.mjs','director/card-runtime-choice.mjs',
  'director/card-acceptance-plan.mjs','template/accept-card-variants.mjs','gallery/api/library.json',
  ...plan.flatMap(item=>[item.reference,...(item.component ? [item.component.file] : [])])])];
const report={schema:'card-variant-frame-smoke-v1',scope:'214 gallery variants, exact IDs, native default frame smoke only; no business admission',
  sourceHashes:Object.fromEntries(sources.map(file=>[file,hash(file)])),fps:30,durationInFrames:180,
  actualModelValidated:false,userAcceptance:'pending',localVisualReview:'pending',results:[]};
const previousFile=path.join(out,'acceptance.json');
if (fs.existsSync(previousFile)) throw new Error('Existing variant evidence is preserved; use a new batch output for another source revision');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'plan.json'),JSON.stringify(plan,null,2)+'\n');
const save=()=>fs.writeFileSync(previousFile,JSON.stringify(report,null,2)+'\n');
const pixelCheck=file=>{
  const pixels=execFileSync(ffmpegPath(),['-v','error','-i',file,'-vf','scale=32:32','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true});
  const colors=new Set();for(let i=0;i<pixels.length;i+=3)colors.add(pixels.subarray(i,i+3).toString('hex'));
  return {nonblank:colors.size>8,sampledColors:colors.size};
};
const url=await bundle({entryPoint:path.join(root,'template/src/index.ts'),publicDir:path.join(root,'template/public'),outDir:path.join(out,'bundle')});
const browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
try {
  for (const [index,item] of plan.entries()) {
    const result={key:item.key,card:item.card,variant:item.variant,runtimeId:item.runtimeId,
      component:item.component ? {file:item.component.file,export:item.component.export,sha256:item.component.sha256} : null,
      mappingEvidence:item.mappingEvidence,status:item.status,productionAccepted:false,samples:[]};
    if (item.runtimeId) {
      for (const aspect of ['landscape','portrait']) {
        const props={card:item.runtimeId,injected:false};
        try {
          const selected=await selectComposition({serveUrl:url,id:'CardAcceptance',inputProps:props,puppeteerInstance:browser});
          if(selected.props.card!==item.runtimeId) throw new Error('Resolved composition did not retain exact variant ID');
          const composition={...selected,width:aspect==='portrait'?1080:1920,height:aspect==='portrait'?1920:1080};
          let sample;
          for (const frame of [100,45]) {
            const file=path.join(out,`variant-${String(index+1).padStart(3,'0')}-${aspect}-f${frame}.png`);
            await renderStill({serveUrl:url,composition,inputProps:props,puppeteerInstance:browser,frame,scale:0.5,
              output:file,timeoutInMilliseconds:15000,logLevel:'error'});
            sample={aspect,frame,resolvedCard:composition.props.card,file:path.basename(file),sha256:hash(file),...pixelCheck(file)};
            if (sample.nonblank) break;
          }
          result.samples.push(sample);
        } catch(error) {result.samples.push({aspect,error:String(error.message).slice(0,1200)});}
      }
      result.status=result.samples.some(sample=>sample.error) ? 'native-render-error' :
        result.samples.some(sample=>!sample.nonblank) ? 'native-frame-blank' : 'native-frame-nonblank';
    }
    report.results.push(result);save();
    if ((index+1)%10===0 || index===plan.length-1) console.log(`VARIANTS ${index+1}/${plan.length}`);
  }
} finally {save();await browser.close({silent:true});}
report.sourceConsistency=Object.entries(report.sourceHashes).every(([file,sha])=>hash(file)===sha);
if (!report.sourceConsistency) {save();throw new Error('Source changed during variant frame validation');}
report.counts={cards:new Set(report.results.map(item=>item.card)).size,variants:report.results.length,
  resolved:report.results.filter(item=>item.runtimeId).length,
  nonblank:report.results.filter(item=>item.status==='native-frame-nonblank').length,
  renderErrors:report.results.filter(item=>item.status==='native-render-error').length,
  blank:report.results.filter(item=>item.status==='native-frame-blank').length,
  unresolved:report.results.filter(item=>item.status==='source-unresolved').length};
save();
const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>214变体样帧审计</title><style>body{margin:24px;font:14px/1.6 'Microsoft YaHei';background:#f4f7f8;color:#18272b}h1{font-size:24px}h2{font-size:18px}section{border-top:1px solid #cad5d7;padding:16px 0}img{height:200px;max-width:100%;object-fit:contain}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>214变体样帧审计</h1><pre>${escape(JSON.stringify(report.counts,null,2))}</pre>${report.results.map(item=>`<section><h2>${escape(item.key)}</h2><p>${escape(item.runtimeId || '源码关系待核对')} · ${escape(item.status)}</p>${item.samples.map(sample=>sample.error ? `<pre>${escape(sample.aspect+' '+sample.error)}</pre>` : `<img src="${sample.file}" alt="${sample.aspect} ${sample.frame}帧">`).join('')}</section>`).join('')}</html>`);
console.log(JSON.stringify({out,counts:report.counts,productionAdmissionChanged:false}));
