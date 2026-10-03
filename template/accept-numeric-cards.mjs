import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderMedia,renderStill} from '@remotion/renderer';
import {ffmpegPath,ffprobePath} from '../director/packaging-media.mjs';
import {validateNumericCardParams,assertNumericCardDuration} from '../director/numeric-card-contracts.mjs';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'template/out/card-governance-batch-001-v3');
fs.mkdirSync(out,{recursive:true});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceFiles=['demos/data/counter-confetti/CounterConfetti.tsx','demos/_fixtures/Motion.tsx',
  'demos/_fixtures/TemplateSkin.ts','director/numeric-card-contracts.mjs','template/src/NumericCardAcceptance.tsx'];
const report={schema:'numeric-card-acceptance-v1',card:'data/counter-confetti',
  scope:'isolated real component renders; production adapter integration pending',
  sourceHashes:Object.fromEntries(sourceFiles.map(file=>[file,hash(path.join(root,file))])),
  localVisualReview:'pending',actualModelValidated:false,userAcceptance:'pending',results:[]};
const previousFile=path.join(out,'acceptance.json');
const previous=fs.existsSync(previousFile) ? JSON.parse(fs.readFileSync(previousFile,'utf8')) : null;
const sourceUnchanged=previous && Object.entries(report.sourceHashes).every(([file,sha])=>previous.sourceHashes[file]===sha);
const fixtures=[
  {value:1200,unit:'元',label:'应急储备',title:'留住现金底气',transparent:true},
  {value:0,unit:'元',label:'借款余额',title:'清偿全部借款',transparent:true},
  {value:12.34,unit:'万元',label:'现金储备',title:'资金储备完整呈现',transparent:false},
  {value:999999,unit:'元',label:'业务指标文案完整保留测试',title:'边界容量文案完整呈现',transparent:true},
];
const save=()=>fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
const serveUrl=await bundle({entryPoint:path.join(root,'template/src/NumericCardAcceptance.tsx'),
  publicDir:path.join(root,'template/public'),outDir:path.join(out,'bundle')});
const browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
try {
  for(const [index,fixture] of fixtures.entries()) {
    const evidence=`${fixture.label}${fixture.value}${fixture.unit}`;
    validateNumericCardParams(report.card,{value:fixture.value,unit:fixture.unit,label:fixture.label,evidence},evidence);
    assertNumericCardDuration(report.card,138,30);
    for(const aspect of ['landscape','portrait']) {
      const reusable=sourceUnchanged && previous.results.find(result=>result.aspect===aspect &&
        JSON.stringify(result.fixture)===JSON.stringify(fixture));
      if(reusable && hash(path.join(out,reusable.video))===reusable.sha256 &&
          reusable.samples.every(sample=>hash(path.join(out,sample.file))===sample.sha256)) {
        execFileSync(ffmpegPath(),['-v','error','-i',path.join(out,reusable.video),'-f','null','-'],{windowsHide:true});
        report.results.push(reusable);save();console.log(`NUMERIC verified existing case-${index+1}-${aspect}`);continue;
      }
      const base=await selectComposition({serveUrl,id:'NumericCardAcceptance',inputProps:fixture,puppeteerInstance:browser});
      const composition={...base,width:aspect==='portrait'?1080:1920,height:aspect==='portrait'?1920:1080};
      const name=`case-${index+1}-${aspect}`;
      const video=path.join(out,`${name}.mp4`);
      await renderMedia({serveUrl,composition,inputProps:fixture,puppeteerInstance:browser,codec:'h264',
        outputLocation:video,concurrency:1,logLevel:'error',offthreadVideoCacheSizeInBytes:32*1024*1024});
      execFileSync(ffmpegPath(),['-v','error','-i',video,'-f','null','-'],{windowsHide:true});
      const stream=JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','v:0','-show_entries',
        'stream=width,height,nb_frames,r_frame_rate','-of','json',video],{encoding:'utf8',windowsHide:true})).streams[0];
      if(stream.width!==composition.width || stream.height!==composition.height || Number(stream.nb_frames)!==138 || stream.r_frame_rate!=='30/1')
        throw new Error(`Wrong dimensions or timeline: ${name}`);
      const samples=[];
      for(const frame of [20,78,113,137]) {
        const output=path.join(out,`${name}-f${frame}.png`);
        await renderStill({serveUrl,composition,inputProps:fixture,puppeteerInstance:browser,frame,scale:0.5,output,logLevel:'error'});
        const pixels=execFileSync(ffmpegPath(),['-v','error','-i',output,'-vf','scale=32:32','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true});
        const colors=new Set();for(let i=0;i<pixels.length;i+=3)colors.add(pixels.subarray(i,i+3).toString('hex'));
        if(colors.size<9) throw new Error(`Blank sample: ${name}/${frame}`);
        samples.push({file:path.basename(output),frame,sha256:hash(output),sampledColors:colors.size});
      }
      report.results.push({fixture,aspect,video:path.basename(video),sha256:hash(video),stream,fullDecodePassed:true,samples});
      save();console.log(`NUMERIC ${name}: 138 frames decoded`);
    }
  }
} finally {save();await browser.close({silent:true});}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第一批镜头卡验收</title><style>body{margin:24px;font:14px/1.6 'Microsoft YaHei';background:#182126;color:white}section{border-top:1px solid #6c8086;padding:18px 0}h1{font-size:24px}h2{font-size:18px}video{width:320px;max-width:100%}img{height:180px;max-width:100%;object-fit:contain}</style><h1>数字冲刺纸屑：业务参数验收</h1><p>独立组件横竖渲染，生产适配器尚待接入，短版未开放，模型调用未实测，用户验收待定。</p>${report.results.map(result=>`<section><h2>${escape(result.fixture.label)} · ${result.fixture.value}${escape(result.fixture.unit)} · ${result.aspect}</h2><video controls preload="metadata" src="${result.video}"></video>${result.samples.map(sample=>`<img src="${sample.file}" alt="${sample.frame}帧">`).join('')}</section>`).join('')}</html>`);
console.log(JSON.stringify({out,renders:report.results.length}));
