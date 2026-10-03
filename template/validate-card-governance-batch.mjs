import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderMedia,renderStill} from '@remotion/renderer';
import {ffmpegPath,ffprobePath} from '../director/packaging-media.mjs';
import {validateNumericCardParams,assertNumericCardDuration} from '../director/numeric-card-contracts.mjs';

const root=path.resolve(import.meta.dirname,'..');
const batch=process.argv[2];
const routingOnly=process.argv.includes('--routing-only');
if (!/^[a-z0-9-]+$/.test(batch || '')) throw new Error('Specify the frozen snapshot batch');
const out=path.join(root,'template/out',batch);
const read=file=>JSON.parse(fs.readFileSync(path.resolve(root,file),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex');
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const manifestFile=`.isolated/${batch}/manifest.json`;
const snapshot=read(manifestFile);
const frozen=file=>{
  const entry=snapshot.files[file];
  if (!entry || hash(entry.snapshot)!==entry.sha256) throw new Error(`Invalid frozen file: ${file}`);
  return entry.snapshot;
};
for (const file of Object.keys(snapshot.files)) frozen(file);
const previous=file=>read(frozen(file));
const long=previous('director/card-production-admission.json');
const short=previous('director/short-card-production-admission.json');
const numeric=previous('director/numeric-card-production-admission.json');
const longReport=read(long.report),shortTitle=read(short.acceptanceReport),shortGraphic=read(short.graphicAcceptanceReport);
const numericPrior=read(numeric.report);
if (hash(numeric.report)!==numeric.reportSha256) throw new Error('Prior numeric evidence changed');
const priorNumeric=numericPrior.numeric || [...numericPrior.legacy.numeric,...numericPrior.addedNumeric];
const original=previous('director/a-mode-runs/f4f78a6c-aa2b-4917-9bed-66398863f3f9/props.json');
const changedAllowed=new Set(['template/src/TemplateAdapter.tsx','director/numeric-card-contracts.mjs',
  'director/a-mode-run.mjs','demos/data/odometer-digit-roll/odometer-contract.mjs',...(routingOnly ? ['template/src/DynamicVideo.tsx'] : [])]);
for (const file of snapshot.sourceFiles) if (hash(file)!==snapshot.files[file].sha256 && !changedAllowed.has(file))
  throw new Error(`Unplanned shared source change: ${file}`);
fs.mkdirSync(out,{recursive:true});
const sourceFiles=[...new Set([...snapshot.sourceFiles,'template/validate-card-governance-batch.mjs','template/governance-baseline-loader.cjs'])];
const report={schema:'card-governance-batch-v2',batch,routingOnly,snapshot:{file:manifestFile,sha256:hash(manifestFile)},
  sourceHashes:Object.fromEntries(sourceFiles.map(file=>[file,hash(file)])),
  legacy:{long:[],short:[],numeric:[]},addedNumeric:[],localVisualReview:'pending',actualModelValidated:false,userAcceptance:'pending'};
const save=()=>fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(report,null,2)+'\n');
const entryPoint=path.join(root,'template/src/index.ts'),publicDir=path.join(root,'template/public');
const current=await bundle({entryPoint,publicDir,outDir:path.join(out,'bundle')});
const snapshots=Object.fromEntries(snapshot.sourceFiles.map(file=>[path.resolve(root,file),path.resolve(root,frozen(file))]));
const baseline=await bundle({entryPoint,publicDir,outDir:path.join(out,'baseline-bundle'),webpackOverride:config=>({...config,module:{...config.module,
  rules:[...config.module.rules,{test:/\.(tsx?|mjs)$/,enforce:'pre',use:{loader:path.join(root,'template/governance-baseline-loader.cjs'),options:{snapshots}}}]}})});
const browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
const options={serveUrl:current,puppeteerInstance:browser,logLevel:'error',offthreadVideoCacheSizeInBytes:32*1024*1024,offthreadVideoThreads:1};
const pixels=file=>execFileSync(ffmpegPath(),['-v','error','-i',file,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,maxBuffer:16*1024*1024});
async function still(composition,props,frame,name,compare=false) {
  const output=path.join(out,`${name}-f${frame}.png`);
  await renderStill({...options,composition,inputProps:props,frame,scale:0.5,output});
  if (composition.id==='CardAcceptance' && composition.props.card!==props.card) throw new Error('CardAcceptance resolved the wrong exact card');
  const result={file:relative(output),frame,sha256:hash(output),...(composition.id==='CardAcceptance' ? {resolvedCard:composition.props.card} : {})};
  if (compare) {
    const oldFile=path.join(out,`${name}-f${frame}-baseline.png`);
    await renderStill({...options,serveUrl:baseline,composition,inputProps:props,frame,scale:0.5,output:oldFile});
    result.baseline=relative(oldFile);result.baselineSha256=hash(oldFile);
    result.pixelIdentical=pixels(output).equals(pixels(oldFile));
    if (!result.pixelIdentical) throw new Error(`Frozen-source pixel regression: ${name}/${frame}`);
  }
  return result;
}
async function video(composition,props,name) {
  const file=path.join(out,`${name}.mp4`);
  await renderMedia({...options,composition,inputProps:props,codec:'h264',pixelFormat:'yuv420p',outputLocation:file,concurrency:1});
  execFileSync(ffmpegPath(),['-v','error','-i',file,'-f','null','-'],{windowsHide:true});
  const stream=JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','v:0','-show_entries',
    'stream=width,height,nb_frames,r_frame_rate','-of','json',file],{encoding:'utf8',windowsHide:true})).streams[0];
  if (stream.width!==composition.width || stream.height!==composition.height || Number(stream.nb_frames)!==composition.durationInFrames || stream.r_frame_rate!=='30/1') throw new Error(`Invalid video: ${name}`);
  return {file:relative(file),sha256:hash(file),stream,fullDecodePassed:true};
}
function metricProps(card,params,aspect,frames,lines=['现金底气']) {
  const shot={...original.storyboard.shots[0],shotCard:card,durationInFrames:frames,text:params.evidence,
    templateParams:params,displayLines:lines,displayText:lines.join('\n'),materialRole:'backdrop'};
  return {...original,bgm:null,storyboard:{...original.storyboard,aspectRatio:aspect,shots:[shot],audio:undefined,subtitleV1:undefined,subtitleHighlights:undefined}};
}
try {
  for (const [index,card] of long.cards.entries()) {
    const fixture=longReport.businessCases.find(item=>item.card===card);
    const props={card,lines:fixture.lines,templateParams:fixture.templateParams,injected:true};
    const base=await selectComposition({...options,id:'CardAcceptance',inputProps:props});
    if(base.props.card!==card || base.props.injected!==true) throw new Error('Long graphic props were not selected');
    for (const sample of fixture.results) {
      const composition={...base,width:sample.aspect==='portrait'?1080:1920,height:sample.aspect==='portrait'?1920:1080};
      report.legacy.long.push({card,aspect:sample.aspect,...await still(composition,props,sample.frame,`long-${index}-${sample.aspect}`,true)});
    }
    save();console.log(`COMPAT long ${card}`);
  }
  for (const accepted of short.cards.filter(card=>card.status==='accepted')) {
    const graphic=accepted.kind==='graphic';
    const fixture=(graphic ? shortGraphic : shortTitle).cards.find(card=>card.id===accepted.id);
    const sourceIndex=graphic ? shortGraphic.cards.indexOf(fixture) : 0;
    for (const aspect of ['16:9','9:16']) {
      const prior=fixture.results.find(result=>result.aspect===aspect && result.frames===60);
      const shot={...original.storyboard.shots[sourceIndex],shotCard:fixture.id,durationInFrames:60,
        displayLines:fixture.lines,displayText:fixture.lines.join('\n'),materialRole:'backdrop',
        ...(graphic ? {text:fixture.text,templateParams:fixture.templateParams} : {})};
      const props={...original,...(graphic ? {bgm:null} : {}),storyboard:{...original.storyboard,aspectRatio:aspect,shots:[shot],audio:undefined,subtitleV1:undefined,subtitleHighlights:undefined}};
      const composition=await selectComposition({...options,id:'DynamicVideo',inputProps:props});
      const name=`short-${fixture.id.split('/').at(-1)}-${aspect==='9:16'?'portrait':'landscape'}`;
      const result={card:fixture.id,aspect,...await video(composition,props,name),samples:[]};
      for (const sample of prior.samples) {
        const frame=Number(/-f(\d+)\.png$/.exec(sample)?.[1]);
        if (!Number.isInteger(frame)) throw new Error('Unknown legacy sample frame');
        result.samples.push(await still(composition,props,frame,name,true));
      }
      report.legacy.short.push(result);save();console.log(`COMPAT ${name}`);
    }
  }
  for (const [index,prior] of priorNumeric.entries()) {
    const frames=Number(prior.stream.nb_frames);
    const props=metricProps(prior.card,prior.params,prior.aspect,frames);
    const composition=await selectComposition({...options,id:'DynamicVideo',inputProps:props});
    const name=`counter-${index}`;
    const result={card:prior.card,aspect:prior.aspect,params:prior.params,...await video(composition,props,name),samples:[]};
    for (const sample of prior.samples) result.samples.push(await still(composition,props,sample.frame,name,true));
    report.legacy.numeric.push(result);save();console.log(`COMPAT ${name}`);
  }
  const card='data/odometer-digit-roll';
  const fixtures=[
    {value:1200,unit:'元',label:'应急储备',evidence:'应急储备1200元'},
    {value:0,unit:'元',label:'借款余额',evidence:'借款余额0元'},
    {value:12.34,unit:'万元',label:'现金储备',evidence:'现金储备12.34万元'},
    {value:999999,unit:'个有效样本数',label:'业务指标文案完整保留测试',evidence:'业务指标文案完整保留测试999999个有效样本数'},
  ];
  for (const [index,params] of (routingOnly ? [] : fixtures).entries()) for (const aspect of ['16:9','9:16']) {
    validateNumericCardParams(card,params,params.evidence);assertNumericCardDuration(card,144,30);
    const props=metricProps(card,params,aspect,144,['原文指标完整呈现']);
    const composition=await selectComposition({...options,id:'DynamicVideo',inputProps:props});
    const name=`odometer-${index}-${aspect==='9:16'?'portrait':'landscape'}`;
    const result={card,aspect,params,...await video(composition,props,name),samples:[]};
    for (const frame of [20,77,98,143]) result.samples.push(await still(composition,props,frame,name));
    report.addedNumeric.push(result);save();console.log(`INTEGRATED ${name}`);
  }
  if (routingOnly) {
    report.routingChecks=[];
    const input=card=>({...original,bgm:null,storyboard:{...original.storyboard,mode:'A',audio:undefined,
      subtitleV1:undefined,subtitleHighlights:undefined,shots:[{type:'claim',text:'运行选择测试',displayLines:['选择测试'],
        shotCard:card,durationInFrames:180,materialRole:'none'}]}});
    for (const [card,message] of [['typography/typewriter-moves','完整变体ID'],['unknown/missing','精确运行注册']]) {
      const props=input(card);
      const composition=await selectComposition({...options,id:'DynamicVideo',inputProps:props});
      try {
        await renderStill({...options,composition,inputProps:props,frame:45,output:path.join(out,'unexpected-routing.png')});
        throw new Error('Expected runtime rejection did not occur');
      } catch(error) {
        if (!error.message.includes(message)) throw error;
        report.routingChecks.push({card,mode:'A',rejected:true,error:error.message});
      }
    }
    const props=input('typography/typewriter-moves');props.storyboard.mode=undefined;
    const composition=await selectComposition({...options,id:'DynamicVideo',inputProps:props});
    report.legacyDirectoryChoice={card:'typography/typewriter-moves',mode:'legacy',
      ...await still(composition,props,45,'legacy-directory-choice',true)};
    save();console.log('ROUTING real renderer rejects A-mode group/missing IDs; legacy directory pixels preserved');
  }
} finally {save();await browser.close({silent:true});}
if (report.legacy.long.length!==12 || report.legacy.short.length!==8 || report.legacy.numeric.length!==priorNumeric.length || report.addedNumeric.length!==(routingOnly ? 0 : 8)) throw new Error('Incomplete actual compatibility evidence');
for (const [file,expected] of Object.entries(report.sourceHashes)) if (hash(file)!==expected) throw new Error(`Source changed during validation: ${file}`);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第二批业务合成验收</title><style>body{margin:24px;font:14px/1.6 'Microsoft YaHei';background:#182126;color:white}section{border-top:1px solid #6c8086;padding:18px 0}h1{font-size:24px}h2{font-size:18px}video{width:320px;max-width:100%}img{height:180px;max-width:100%;object-fit:contain}</style><h1>里程表数字卡：业务合成</h1>${report.addedNumeric.map(item=>`<section><h2>${escape(item.params.label)} · ${item.params.value}${escape(item.params.unit)} · ${item.aspect}</h2><video controls preload="metadata" src="${path.basename(item.file)}"></video>${item.samples.map(sample=>`<img src="${path.basename(sample.file)}" alt="${sample.frame}帧">`).join('')}</section>`).join('')}</html>`);
console.log(JSON.stringify({out,legacyLongSamples:12,legacyShortVideos:8,legacyNumericVideos:report.legacy.numeric.length,newNumericVideos:report.addedNumeric.length,routingOnly}));
