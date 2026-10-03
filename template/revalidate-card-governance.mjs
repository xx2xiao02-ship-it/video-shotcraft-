import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import {ffmpegPath,ffprobePath} from '../director/packaging-media.mjs';
import {NUMERIC_CARD_CONTRACTS,validateNumericCardParams} from '../director/numeric-card-contracts.mjs';
import {restoreBaselineSource} from './governance-baseline.mjs';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'template/out/card-governance-batch-001-v3/integration');
const numericOnly=process.argv.includes('--numeric-only');
fs.mkdirSync(out,{recursive:true});
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(path.resolve(root,file),'utf8'));
const longFile='director/card-production-admission.json';
const shortFile='director/short-card-production-admission.json';
const long=read(longFile),short=read(shortFile);
const longReport=read(long.report);
const shortTitleReport=read(short.acceptanceReport),shortGraphicReport=read(short.graphicAcceptanceReport);
const original=read('director/a-mode-runs/f4f78a6c-aa2b-4917-9bed-66398863f3f9/props.json');
const allowed=new Set(['template/src/DynamicVideo.tsx','template/src/TemplateAdapter.tsx']);
for(const admission of [long,short]) for(const [file,expected] of Object.entries(admission.sourceHashes))
  if(sha(file)!==expected && !allowed.has(file)) throw new Error(`Unrelated source change: ${file}`);
const currentHashes=Object.fromEntries([...new Set([...Object.keys(long.sourceHashes),...Object.keys(short.sourceHashes),
  'demos/data/counter-confetti/CounterConfetti.tsx','director/numeric-card-contracts.mjs'])].map(file=>[file,sha(file)]));
const evidence={schema:'card-governance-integration-v1',sourceHashes:currentHashes,oldGraphics:[],oldShortCards:[],numeric:[],
  modelValidation:'not-run',userAcceptance:'pending'};
if(numericOnly) {
  if(Object.keys(NUMERIC_CARD_CONTRACTS).join(',')!=='data/counter-confetti')throw new Error('Numeric contracts now affect additional cards; full compatibility run required');
  const prior=read('template/out/card-governance-batch-001/integration/evidence.json');
  for(const [file,expected] of Object.entries(prior.sourceHashes))
    if(!['demos/data/counter-confetti/CounterConfetti.tsx','director/numeric-card-contracts.mjs'].includes(file) && sha(file)!==expected)throw new Error(`Compatibility source changed: ${file}`);
  for(const item of [...prior.oldGraphics,...prior.oldShortCards.flatMap(card=>card.samples)])
    if(!item.pixelIdentical || sha(item.file)!==item.sha256 || sha(item.baseline)!==item.baselineSha256 ||
       (item.refreshedBaseline && sha(item.refreshedBaseline)!==item.refreshedBaselineSha256))throw new Error('Compatibility sample changed');
  for(const item of prior.oldShortCards)if(!item.fullDecodePassed || sha(item.file)!==item.sha256)throw new Error('Compatibility video changed');
  evidence.oldGraphics=prior.oldGraphics;evidence.oldShortCards=prior.oldShortCards;
  evidence.compatibilityReusedFrom={file:'template/out/card-governance-batch-001/integration/evidence.json',
    sha256:sha('template/out/card-governance-batch-001/integration/evidence.json'),reason:'only numeric card body and shot-local validator changed; numeric branch excludes legacy cards, shared entry and all legacy component/artifact hashes verified'};
}
const save=()=>fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
const pixels=file=>execFileSync(ffmpegPath(),['-v','error','-i',file,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],
  {windowsHide:true,maxBuffer:16*1024*1024});
const source=await bundle({entryPoint:path.join(root,'template/src/index.ts'),publicDir:path.join(root,'template/public'),outDir:path.join(out,'bundle')});
const browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
const options={serveUrl:source,puppeteerInstance:browser,logLevel:'error',offthreadVideoCacheSizeInBytes:32*1024*1024,offthreadVideoThreads:1};
let baselineUrl;
async function frozenBaseline() {
  if(baselineUrl)return baselineUrl;
  const snapshots={};
  for(const relative of allowed) {
    const original=restoreBaselineSource(relative,fs.readFileSync(path.join(root,relative),'utf8'),longReport.sourceHashes[relative]);
    const snapshot=path.join(out,`baseline-${path.basename(relative)}.txt`);
    fs.writeFileSync(snapshot,original);snapshots[path.resolve(root,relative)]=snapshot;
  }
  baselineUrl=await bundle({entryPoint:path.join(root,'template/src/index.ts'),publicDir:path.join(root,'template/public'),
    outDir:path.join(out,'baseline-bundle'),webpackOverride:config=>({...config,module:{...config.module,
      rules:[...config.module.rules,{test:/(DynamicVideo|TemplateAdapter)\.tsx$/,enforce:'pre',
        use:{loader:path.join(root,'template/governance-baseline-loader.cjs'),options:{snapshots}}}]}})});
  return baselineUrl;
}
async function compareSample(composition,props,oldFile,frame,name) {
  const output=path.join(out,`${name}.png`);
  await renderStill({...options,composition,inputProps:props,output,frame,scale:0.5});
  const historicalIdentical=pixels(output).equals(pixels(path.resolve(root,oldFile)));
  let refreshedBaseline;
  if(!historicalIdentical) {
    const serveUrl=await frozenBaseline();
    refreshedBaseline=path.join(out,`${name}-frozen-baseline.png`);
    await renderStill({...options,serveUrl,composition,inputProps:props,output:refreshedBaseline,frame,scale:0.5});
    if(!pixels(output).equals(pixels(refreshedBaseline)))throw new Error(`Pixel regression against frozen source: ${name}`);
  }
  return {file:path.relative(root,output),sha256:sha(output),baseline:oldFile,baselineSha256:sha(oldFile),frame,pixelIdentical:true,
    historicalIdentical,...(refreshedBaseline ? {refreshedBaseline:path.relative(root,refreshedBaseline),
      refreshedBaselineSha256:sha(refreshedBaseline),baselineSourceHashes:Object.fromEntries([...allowed].map(file=>[file,longReport.sourceHashes[file]]))} : {})};
}
async function video(composition,props,name) {
  const file=path.join(out,`${name}.mp4`);
  await renderMedia({...options,composition,inputProps:props,codec:'h264',pixelFormat:'yuv420p',outputLocation:file,concurrency:1});
  execFileSync(ffmpegPath(),['-v','error','-i',file,'-f','null','-'],{windowsHide:true});
  const stream=JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','v:0','-show_entries',
    'stream=width,height,nb_frames,r_frame_rate','-of','json',file],{encoding:'utf8',windowsHide:true})).streams[0];
  if(stream.width!==composition.width || stream.height!==composition.height || Number(stream.nb_frames)!==composition.durationInFrames || stream.r_frame_rate!=='30/1')
    throw new Error(`Invalid stream: ${name}`);
  return {file:path.relative(root,file),sha256:sha(file),stream,fullDecodePassed:true};
}
try {
  const base=await selectComposition({...options,id:'CardAcceptance',inputProps:{card:long.cards[0]}});
  for(const [i,card] of (numericOnly ? [] : long.cards).entries()) {
    const fixture=longReport.businessCases.find(item=>item.card===card);
    const props={card,lines:fixture.lines,templateParams:fixture.templateParams,injected:true};
    for(const old of fixture.results) {
      const composition={...base,width:old.aspect==='portrait'?1080:1920,height:old.aspect==='portrait'?1920:1080,props};
      evidence.oldGraphics.push({card,...await compareSample(composition,props,old.file,old.frame,`legacy-graphic-${i}-${old.aspect}-${old.frame}`)});
    }
    console.log(`REVALIDATED long graphic ${card}`);save();
  }
  for(const accepted of (numericOnly ? [] : short.cards.filter(card=>card.status==='accepted'))) {
    const graphic=accepted.kind==='graphic';
    const report=graphic ? shortGraphicReport : shortTitleReport;
    const fixture=report.cards.find(card=>card.id===accepted.id);
    for(const aspect of ['16:9','9:16']) {
      const old=fixture.results.find(result=>result.aspect===aspect && result.frames===60);
      const originalIndex=graphic ? shortGraphicReport.cards.indexOf(fixture) : 0;
      const shot={...original.storyboard.shots[originalIndex],shotCard:fixture.id,durationInFrames:60,
        displayLines:fixture.lines,displayText:fixture.lines.join('\n'),materialRole:'backdrop',
        ...(graphic ? {text:fixture.text,templateParams:fixture.templateParams} : {})};
      const props={...original,...(graphic ? {bgm:null} : {}),storyboard:{...original.storyboard,aspectRatio:aspect,shots:[shot],audio:undefined,subtitleV1:undefined,subtitleHighlights:undefined}};
      const composition=await selectComposition({...options,id:'DynamicVideo',inputProps:props});
      const name=`short-${fixture.id.split('/').at(-1)}-${aspect==='9:16'?'portrait':'landscape'}`;
      const entry={card:fixture.id,aspect,...await video(composition,props,name),samples:[]};
      for(const [index,oldSample] of old.samples.entries()) {
        const frame=Number(/-f(\d+)\.png$/.exec(oldSample)?.[1]);
        if(!Number.isInteger(frame))throw new Error(`Unknown baseline frame: ${oldSample}`);
        const baseline=path.join(path.dirname(path.resolve(root,graphic ? short.graphicAcceptanceReport : short.acceptanceReport)),oldSample);
        entry.samples.push(await compareSample(composition,props,baseline,frame,`${name}-sample-${index}`));
      }
      evidence.oldShortCards.push(entry);save();console.log(`REVALIDATED ${name}`);
    }
  }
  for(const [index,params] of [{value:1200,unit:'元',label:'应急储备',evidence:'应急储备1200元'},
    {value:0,unit:'元',label:'借款余额',evidence:'借款余额0元'}].entries()) for(const aspect of ['16:9','9:16']) {
    validateNumericCardParams('data/counter-confetti',params,params.evidence);
    const shot={...original.storyboard.shots[0],shotCard:'data/counter-confetti',durationInFrames:138,
      text:params.evidence,templateParams:params,displayLines:['现金底气'],displayText:'现金底气',materialRole:'backdrop'};
    const props={...original,bgm:null,storyboard:{...original.storyboard,aspectRatio:aspect,shots:[shot],audio:undefined,subtitleV1:undefined,subtitleHighlights:undefined}};
    const composition=await selectComposition({...options,id:'DynamicVideo',inputProps:props});
    const name=`numeric-${index}-${aspect==='9:16'?'portrait':'landscape'}`;
    const entry={card:shot.shotCard,aspect,params,...await video(composition,props,name),samples:[]};
    for(const frame of [78,113,137]) {
      const output=path.join(out,`${name}-f${frame}.png`);
      await renderStill({...options,composition,inputProps:props,frame,scale:0.5,output});
      entry.samples.push({file:path.relative(root,output),sha256:sha(output),frame});
    }
    evidence.numeric.push(entry);save();console.log(`INTEGRATED ${name}`);
  }
} finally {save();await browser.close({silent:true});}
if(evidence.oldGraphics.length!==12 || evidence.oldShortCards.length!==8 || evidence.numeric.length!==4)
  throw new Error('Incomplete integration evidence');
for(const [file,expected] of Object.entries(currentHashes)) if(sha(file)!==expected)throw new Error(`Source changed during validation: ${file}`);
// Record a reviewable compatibility report first. Admission updates require visual review.
console.log(JSON.stringify({out,oldGraphicSamples:evidence.oldGraphics.length,shortVideos:evidence.oldShortCards.length,numericVideos:evidence.numeric.length}));
