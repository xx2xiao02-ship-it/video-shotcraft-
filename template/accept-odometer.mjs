import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderMedia,renderStill} from '@remotion/renderer';
import {ffmpegPath,ffprobePath} from '../director/packaging-media.mjs';
import {validateOdometerProps} from '../demos/data/odometer-digit-roll/odometer-contract.mjs';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'template/out/card-governance-batch-002-odometer-v2');
fs.mkdirSync(out,{recursive:true});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sources=['demos/data/odometer-digit-roll/OdometerDigitRoll.tsx','demos/data/odometer-digit-roll/odometer-contract.mjs',
  'demos/data/odometer-digit-roll/odometer-contract.d.mts','demos/_fixtures/Fixtures.tsx','demos/_fixtures/TemplateSkin.ts',
  'template/src/OdometerAcceptance.tsx','template/src/OdometerBaselineProbe.tsx','template/accept-odometer.mjs'];
const report={schema:'odometer-component-acceptance-v1',card:'data/odometer-digit-roll',
  scope:'native component only; business adapter remains disabled',sourceHashes:Object.fromEntries(sources.map(file=>[file,hash(path.join(root,file))])),
  localVisualReview:'pending',actualModelValidated:false,userAcceptance:'pending',results:[]};
const save=()=>fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
const fixtures=[
  {value:1200,unit:'元',label:'现金储备',title:'留住现金底气',transparent:true},
  {value:0,unit:'元',label:'借款余额',title:'清偿全部借款',transparent:true},
  {value:12.34,unit:'万元',label:'现金储备',title:'资金储备完整呈现',light:true,transparent:false},
  {value:999999,unit:'元人民币总额',label:'业务指标文案完整保留测试',title:'边界容量文案完整呈现',transparent:true},
];
const url=await bundle({entryPoint:path.join(root,'template/src/OdometerAcceptance.tsx'),outDir:path.join(out,'bundle')});
const browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
try {
  const baselineFile='.isolated/card-governance-batch-002/baseline/demos/data/odometer-digit-roll/OdometerDigitRoll.tsx';
  const baselineHash=hash(path.join(root,baselineFile));
  if (baselineHash!=='3a3c16af9c9d6ea54f5da7f1481d4382c98756f48f9382becc44a935352e1f67') throw new Error('Baseline source changed');
  const baselineUrl=await bundle({entryPoint:path.join(root,'template/src/OdometerBaselineProbe.tsx'),outDir:path.join(out,'baseline-bundle')});
  const baseline=await selectComposition({serveUrl:baselineUrl,id:'OdometerBaselineProbe',puppeteerInstance:browser});
  try {
    await renderStill({serveUrl:baselineUrl,composition:baseline,puppeteerInstance:browser,frame:67,output:path.join(out,'baseline-f67.png'),logLevel:'error'});
    throw new Error('Expected baseline invalid color error was not reproduced');
  } catch (error) {
    if (!error.message.includes('invalid color string var(--text)')) throw error;
    report.baseline={source:baselineFile,sha256:baselineHash,status:'failed-before-changes',error:error.message};
    save();console.log('ODOMETER baseline: original color error reproduced in real renderer');
  }
  for (const [index,fixture] of fixtures.entries()) for (const aspect of ['landscape','portrait']) {
    const timing=validateOdometerProps(fixture,144,30);
    const base=await selectComposition({serveUrl:url,id:'OdometerAcceptance',inputProps:fixture,puppeteerInstance:browser});
    const composition={...base,width:aspect==='portrait'?1080:1920,height:aspect==='portrait'?1920:1080};
    const name=`case-${index+1}-${aspect}`;
    const video=path.join(out,`${name}.mp4`);
    await renderMedia({serveUrl:url,composition,inputProps:fixture,puppeteerInstance:browser,codec:'h264',outputLocation:video,
      concurrency:1,logLevel:'error',offthreadVideoCacheSizeInBytes:32*1024*1024});
    execFileSync(ffmpegPath(),['-v','error','-i',video,'-f','null','-'],{windowsHide:true});
    const stream=JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','v:0','-show_entries',
      'stream=width,height,nb_frames,r_frame_rate','-of','json',video],{encoding:'utf8',windowsHide:true})).streams[0];
    if (stream.width!==composition.width || stream.height!==composition.height || Number(stream.nb_frames)!==144 || stream.r_frame_rate!=='30/1') throw new Error(`Invalid output: ${name}`);
    const samples=[];
    for (const frame of [20,timing.lock,timing.labelEnd,143]) {
      const file=path.join(out,`${name}-f${frame}.png`);
      await renderStill({serveUrl:url,composition,inputProps:fixture,puppeteerInstance:browser,frame,scale:0.5,output:file,logLevel:'error'});
      samples.push({file:path.basename(file),frame,sha256:hash(file)});
    }
    if (samples[2].sha256!==samples[3].sha256) throw new Error(`Final hold is not still: ${name}`);
    report.results.push({fixture,aspect,timing,video:path.basename(video),sha256:hash(video),stream,fullDecodePassed:true,samples});
    save();console.log(`ODOMETER ${name}: 144 frames decoded, final hold identical`);
  }
  const demo={demo:true};
  const composition=await selectComposition({serveUrl:url,id:'OdometerAcceptance',inputProps:demo,puppeteerInstance:browser});
  report.defaultDemo={status:'passed',samples:[]};
  for (const frame of [20,63,67,84,143]) {
    const file=path.join(out,`default-demo-f${frame}.png`);
    await renderStill({serveUrl:url,composition,inputProps:demo,puppeteerInstance:browser,frame,scale:0.5,output:file,logLevel:'error'});
    report.defaultDemo.samples.push({file:path.basename(file),frame,sha256:hash(file)});
  }
} finally {save();await browser.close({silent:true});}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>里程表数字卡验收</title><style>body{margin:24px;font:14px/1.6 'Microsoft YaHei';background:#182126;color:white}section{border-top:1px solid #6c8086;padding:18px 0}h1{font-size:24px}h2{font-size:18px}video{width:320px;max-width:100%}img{height:180px;max-width:100%;object-fit:contain}</style><h1>里程表数字卡</h1>${report.results.map(result=>`<section><h2>${escape(result.fixture.label)} · ${result.fixture.value}${escape(result.fixture.unit)} · ${result.aspect}</h2><video controls preload="metadata" src="${result.video}"></video>${result.samples.map(sample=>`<img src="${sample.file}" alt="${sample.frame}帧">`).join('')}</section>`).join('')}</html>`);
console.log(JSON.stringify({out,renders:report.results.length}));
