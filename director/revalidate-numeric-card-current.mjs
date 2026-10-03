import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {ffmpegPath,ffprobePath} from './packaging-media.mjs';

const root=path.resolve(import.meta.dirname,'..');
// Resolve Remotion and TypeScript from the template package boundary. The director
// package intentionally has no root-level Remotion installation.
const require=createRequire(path.join(root,'template/package.json'));
const {bundle}=require('@remotion/bundler');
const {openBrowser,selectComposition,renderStill,renderMedia}=require('@remotion/renderer');
const snapshotFile='.isolated/card-governance-batch-002-integration/manifest.json';
const snapshotPath=path.join(root,snapshotFile);
const outputRelative='template/out/card-business-data-batch014-runtime-compatibility-20261003';
const output=path.join(root,outputRelative);
const read=file=>JSON.parse(fs.readFileSync(path.resolve(root,file),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex');
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const snapshot=read(snapshotFile);
const snapshotHash=hash(snapshotFile);

for(const [file,entry] of Object.entries(snapshot.files)) {
  if(hash(entry.snapshot)!==entry.sha256) throw new Error(`冻结快照已变化：${file}`);
}

const historicalFile='template/out/card-governance-batch-002-integration/evidence.json';
const historical=read(historicalFile);
const historicalHash=hash(historicalFile);
if(historical.schema!=='card-governance-batch-v2' || historicalHash!=='5a4f0c38284afb2e71ea851bf873e986efbe5de4b86b2aba05c76162c6e7350e')
  throw new Error('历史数值整合报告不完整或已变化');
if(historical.legacy?.numeric?.length!==4 || historical.addedNumeric?.length!==8)
  throw new Error('历史数值案例数量不完整');

const original=read(snapshot.files['director/a-mode-runs/f4f78a6c-aa2b-4917-9bed-66398863f3f9/props.json'].snapshot);
const cases=[...historical.legacy.numeric,...historical.addedNumeric];
const sourceFiles=[
  'template/src/Root.tsx','template/src/DynamicVideo.tsx','template/src/TemplateAdapter.tsx',
  'template/src/CardAcceptance.tsx','demos/_fixtures/Motion.tsx','demos/_fixtures/TemplateSkin.ts',
  'demos/_fixtures/Fixtures.tsx','demos/data/counter-confetti/CounterConfetti.tsx',
  'demos/data/odometer-digit-roll/OdometerDigitRoll.tsx','demos/data/odometer-digit-roll/odometer-contract.mjs',
  'demos/data/odometer-digit-roll/odometer-contract.d.mts','director/numeric-card-contracts.mjs',
  'director/numeric-card-admission.mjs','director/admission-source-policy.mjs','director/card-source-audit.mjs',
  'director/graphic-contracts.mjs','director/a-mode-run.mjs','director/a-mode-render-preflight.mjs',
  'template/governance-baseline-loader.cjs'
];
const initialHashes=Object.fromEntries(sourceFiles.map(file=>[file,hash(file)]));
const frozenHashes=Object.fromEntries(sourceFiles.map(file=>[
  file,snapshot.files[file] ? hash(snapshot.files[file].snapshot) : null,
]));
const sourceDrift=sourceFiles.filter(file=>!snapshot.files[file] || initialHashes[file]!==frozenHashes[file]).map(file=>({
  file,currentSha256:initialHashes[file],frozenSha256:frozenHashes[file],
  reason:snapshot.files[file] ? 'source-drift' : 'unbound-in-frozen-snapshot',
}));

const ts=require('typescript');
const adapterSource=fs.readFileSync(path.join(root,'template/src/TemplateAdapter.tsx'),'utf8');
const adapterCompiled=ts.transpileModule(adapterSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const adapterExports={};
new Function('require','exports',adapterCompiled)(createRequire(path.join(root,'template/src/TemplateAdapter.tsx')),adapterExports);

const metricProps=(card,params,aspect,frames)=>{
  const lines=card==='data/odometer-digit-roll' ? ['原文指标完整呈现'] : ['现金底气'];
  const shot={...original.storyboard.shots[0],shotCard:card,durationInFrames:frames,text:params.evidence,
    narration:params.evidence,templateParams:params,displayLines:lines,displayText:lines.join('\n'),lines,materialRole:'backdrop'};
  const props={...original,bgm:null,storyboard:{...original.storyboard,aspectRatio:aspect,shots:[shot],audio:undefined,
    subtitleV1:undefined,subtitleHighlights:undefined}};
  return {shot,props};
};

fs.mkdirSync(output,{recursive:true});
const reportPath=path.join(output,'compatibility.json');
const freshReport=()=>({schema:'numeric-card-current-runtime-compatibility-v1',snapshot:{file:snapshotFile,sha256:snapshotHash},
  historicalReport:{file:historicalFile,sha256:historicalHash},cards:['data/counter-confetti','data/odometer-digit-roll'],
  sourceHashes:initialHashes,frozenSourceHashes:frozenHashes,sourceDrift,baselineComparison:sourceDrift.length
    ? 'diagnostic-only-source-drift' : 'required-pixel-identical',
  cases:[],localVisualReview:'pending',actualModelValidated:false,userAcceptance:'pending',productionAdmission:'not-recorded'});
let report=freshReport();
if(fs.existsSync(reportPath)) {
  try {
    const prior=JSON.parse(fs.readFileSync(reportPath,'utf8'));
    if(prior.schema===report.schema && prior.snapshot?.sha256===snapshotHash &&
      prior.historicalReport?.sha256===historicalHash && JSON.stringify(prior.sourceHashes)===JSON.stringify(initialHashes))
      report=prior;
  } catch { /* Rebuild a partial report when the prior run stopped mid-case. */ }
}
report.sourceHashes=initialHashes;
report.frozenSourceHashes=frozenHashes;
report.sourceDrift=sourceDrift;
report.baselineComparison=sourceDrift.length ? 'diagnostic-only-source-drift' : 'required-pixel-identical';
if(!Array.isArray(report.cases)) report.cases=[];
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
const pixels=file=>execFileSync(ffmpegPath(),['-v','error','-i',file,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],
  {windowsHide:true,maxBuffer:16*1024*1024});
const frozenSources=Object.fromEntries(snapshot.sourceFiles.map(file=>[
  path.resolve(root,file),path.resolve(root,snapshot.files[file].snapshot)
]));

const currentBundle=await bundle({entryPoint:path.join(root,'template/src/index.ts'),publicDir:path.join(root,'template/public'),
  outDir:path.join(output,'bundle')});
const baselineBundle=await bundle({entryPoint:path.join(root,'template/src/index.ts'),publicDir:path.join(root,'template/public'),
  outDir:path.join(output,'baseline-bundle'),webpackOverride:config=>({...config,module:{...config.module,
    rules:[...config.module.rules,{test:/\.(tsx?|mjs|mts)$/,enforce:'pre',use:{loader:path.join(root,'template/governance-baseline-loader.cjs'),options:{snapshots:frozenSources}}}]}})});
// Windows 环境可能禁止从 Node 启动用户级 Chrome；允许治理复验显式指定同类 Chromium。
const browserExecutable=process.env.SHOTCRAFT_BROWSER_EXECUTABLE ||
  'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const chromeMode=process.env.SHOTCRAFT_CHROME_MODE || 'chrome-for-testing';
const browser=await openBrowser('chrome',{browserExecutable,chromeMode});
const options={puppeteerInstance:browser,logLevel:'error',offthreadVideoCacheSizeInBytes:32*1024*1024,offthreadVideoThreads:1};

async function renderCase(item,index) {
  const frames=Number(item.stream.nb_frames);
  const aspect=item.aspect==='9:16'?'9:16':'16:9';
  const {shot,props}=metricProps(item.card,item.params,aspect,frames);
  const selected=await selectComposition({serveUrl:currentBundle,id:'DynamicVideo',inputProps:props,...options});
  const baselineSelected=await selectComposition({serveUrl:baselineBundle,id:'DynamicVideo',inputProps:props,...options});
  const selectedShot=selected.props?.storyboard?.shots?.[0];
  if(selectedShot?.shotCard!==item.card || selectedShot?.durationInFrames!==frames)
    throw new Error(`selectComposition props 不一致：${item.card}/${aspect}`);
  const translated=adapterExports.translateShot(item.card,shot);
  if(!translated || translated.value!==item.params.value || translated.unit!==item.params.unit || translated.label!==item.params.label)
    throw new Error(`适配器 props 不一致：${item.card}/${aspect}`);
  const expected=[aspect==='9:16'?1080:1920,aspect==='9:16'?1920:1080];
  if(selected.width!==expected[0] || selected.height!==expected[1] || selected.durationInFrames!==frames)
    throw new Error(`composition 尺寸或时长不一致：${item.card}/${aspect}`);
  if(baselineSelected.width!==selected.width || baselineSelected.height!==selected.height || baselineSelected.durationInFrames!==frames)
    throw new Error(`冻结 composition 不一致：${item.card}/${aspect}`);

  const name=`${item.card.endsWith('counter-confetti')?'counter':'odometer'}-${index}-${aspect==='9:16'?'portrait':'landscape'}`;
  const video=path.join(output,`${name}.mp4`);
  if(!fs.existsSync(video) || fs.statSync(video).size<1024)
    await renderMedia({...options,serveUrl:currentBundle,composition:selected,inputProps:props,codec:'h264',pixelFormat:'yuv420p',
      outputLocation:video,concurrency:1});
  execFileSync(ffmpegPath(),['-v','error','-i',video,'-f','null','-'],{windowsHide:true});
  const stream=JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','v:0','-show_entries',
    'stream=width,height,nb_frames,r_frame_rate','-of','json',video],{encoding:'utf8',windowsHide:true})).streams[0];
  if(stream.width!==expected[0] || stream.height!==expected[1] || Number(stream.nb_frames)!==frames || stream.r_frame_rate!=='30/1')
    throw new Error(`真实视频流不符合要求：${name}`);
  const sampleFrames=item.card==='data/odometer-digit-roll'?[20,77,98,143]:[78,113,137];
  const samples=[];
  for(const frame of sampleFrames){
    const current=path.join(output,`${name}-f${frame}.png`);
    const baseline=path.join(output,`${name}-f${frame}-baseline.png`);
    if(!fs.existsSync(current) || fs.statSync(current).size<1024)
      await renderStill({...options,serveUrl:currentBundle,composition:selected,inputProps:props,frame,scale:0.5,output:current});
    if(!fs.existsSync(baseline) || fs.statSync(baseline).size<1024)
      await renderStill({...options,serveUrl:baselineBundle,composition:baselineSelected,inputProps:props,frame,scale:0.5,output:baseline});
    const pixelIdentical=pixels(current).equals(pixels(baseline));
    if(!pixelIdentical && sourceDrift.length===0) throw new Error(`当前与冻结源码样帧不同：${name}/f${frame}`);
    samples.push({frame,file:relative(current),sha256:hash(current),baseline:relative(baseline),baselineSha256:hash(baseline),
      pixelIdentical,comparison:report.baselineComparison});
  }
  const result={card:item.card,aspect,params:item.params,frames,fps:30,componentId:item.card,
    selectedProps:{shotCard:selectedShot.shotCard,durationInFrames:selectedShot.durationInFrames,templateParams:selectedShot.templateParams},
    adapterProps:{value:translated.value,unit:translated.unit,label:translated.label,title:translated.title,durationInFrames:translated.durationInFrames},
    video:relative(video),sha256:hash(video),stream,fullDecodePassed:true,samples};
  const existingIndex=report.cases.findIndex(existing=>existing.card===result.card && existing.aspect===result.aspect &&
    JSON.stringify(existing.params)===JSON.stringify(result.params));
  if(existingIndex===-1) report.cases.push(result); else report.cases[existingIndex]=result;
  save();
  console.log(`REVALIDATED ${name}`);
}

try {
  for(const [index,item] of cases.entries()) await renderCase(item,index);
} finally {
  save();
  await browser.close({silent:true});
}
if(report.cases.length!==12) throw new Error(`数值案例未完整复验：${report.cases.length}/12`);
for(const [file,expected] of Object.entries(initialHashes)) if(hash(file)!==expected) throw new Error(`复验期间源码变化：${file}`);
report.baselinePixelDifferences=report.cases.reduce((total,item)=>total+
  item.samples.filter(sample=>sample.pixelIdentical===false).length,0);
report.localVisualReview=sourceDrift.length
  ? 'passed-current-runtime-baseline-drift-recorded'
  : 'passed-frozen-source-pixel-comparison';
report.completedAt=new Date().toISOString();
save();
console.log(JSON.stringify({output:outputRelative,cases:report.cases.length,cards:report.cards,localVisualReview:report.localVisualReview}));
