import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition, renderMedia, renderStill} from '@remotion/renderer';
import {probeVideo, ffmpegPath, ffprobePath} from '../director/packaging-media.mjs';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'template/out/short-graphic-acceptance-v1');
fs.mkdirSync(out,{recursive:true});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const prior=JSON.parse(fs.readFileSync(path.join(root,'director/short-card-production-admission.json'),'utf8'));
const original=JSON.parse(fs.readFileSync(path.join(root,'director/a-mode-runs/f4f78a6c-aa2b-4917-9bed-66398863f3f9/props.json'),'utf8'));
const fixtures=[
  {id:'ui-entrance/bezier-source-converge-merge',lines:['现金底气'],text:'收入、节流和还债，共同形成现金底气。',
    templateParams:{sources:['收入','节流','还债'],target:'底气'},completionFrame:42,holdFrames:18,exitFrames:0,
    graphicLimits:{maxSources:3,maxSourceChars:2,maxTargetChars:4}},
  {id:'data/hatch-depth',lines:['资产≠现金'],text:'账面资产100万，可用现金10万。',
    templateParams:{rows:[{label:'资产',value:100,evidence:'账面资产100万'},{label:'现金',value:10,evidence:'可用现金10万'}],unit:'万'},
    completionFrame:30,holdFrames:30,exitFrames:0,graphicLimits:{maxRows:2,maxLabelChars:4,maxUnitChars:2}},
];
const report={schema:'short-graphic-acceptance-v1',localVisualReview:'pending',userVisualReview:'pending',fps:30,
  scope:'2-second native graphic variants; fixed test data, not paid director output',
  sourceHashes:{...prior.sourceHashes,...Object.fromEntries(['demos/data/hatch-depth/HatchDepth.tsx',
    'demos/ui-entrance/bezier-source-converge-merge/BezierSourceConvergeMerge.tsx'].map(file=>[file,hash(file)]))},cards:[]};
const serveUrl=await bundle({entryPoint:path.join(root,'template/src/index.ts'),publicDir:path.join(root,'template/public')});
const browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
try {
  for(const [i,fixture] of fixtures.entries()) {
    const entry={...fixture,kind:'graphic',fps:30,maxLines:1,maxChars:6,acceptedFrames:[60],status:'accepted',results:[]};
    for(const aspect of ['16:9','9:16']) {
      const name=`${fixture.id.split('/').at(-1)}-${aspect==='9:16'?'portrait':'landscape'}`;
      const shot={...original.storyboard.shots[i],shotCard:fixture.id,durationInFrames:60,text:fixture.text,
        displayLines:fixture.lines,displayText:fixture.lines.join('\n'),templateParams:fixture.templateParams,materialRole:'backdrop'};
      const props={...original,bgm:null,storyboard:{...original.storyboard,shots:[shot],aspectRatio:aspect,audio:undefined,subtitleV1:undefined,subtitleHighlights:undefined}};
      const composition=await selectComposition({serveUrl,id:'DynamicVideo',puppeteerInstance:browser,inputProps:props});
      const video=path.join(out,`${name}.mp4`);
      await renderMedia({serveUrl,composition,inputProps:props,puppeteerInstance:browser,codec:'h264',pixelFormat:'yuv420p',
        outputLocation:video,concurrency:1,offthreadVideoCacheSizeInBytes:64*1024*1024,offthreadVideoThreads:1,logLevel:'error'});
      execFileSync(ffmpegPath(),['-v','error','-i',video,'-f','null','-'],{windowsHide:true});
      const info=probeVideo(video);
      const probe=JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,r_frame_rate',
        '-of','json',video],{encoding:'utf8',windowsHide:true})).streams[0];
      if(Number(probe.nb_frames)!==60 || probe.r_frame_rate!=='30/1' || info.width!==composition.width || info.height!==composition.height)
        throw new Error('短图形实际帧数或画幅错误');
      const samples=[];
      for(const frame of [18,fixture.completionFrame,59]) {
        const output=path.join(out,`${name}-f${frame}.png`);
        await renderStill({serveUrl,composition,inputProps:props,puppeteerInstance:browser,frame,scale:0.5,output,logLevel:'error',
          offthreadVideoCacheSizeInBytes:64*1024*1024,offthreadVideoThreads:1});
        samples.push(path.basename(output));
      }
      entry.results.push({aspect,frames:60,info,fullDecodePassed:true,video:path.basename(video),videoSha256:hash(path.relative(root,video)),samples});
      console.log(`GRAPHIC ${name}: 60 frames decoded`);
    }
    report.cards.push(entry);
  }
}finally{await browser.close({silent:true});}
fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>前5秒图形验收</title>
<style>body{font:15px/1.6 'Microsoft YaHei';margin:24px;background:#14191d;color:white}h1{font-size:24px}h2{font-size:18px}section{border-top:1px solid #697078;padding:20px 0}video{width:320px;max-width:100%}img{height:180px;max-width:100%}</style>
<h1>前5秒图形短版验收</h1><p>固定测试文案和参数，非真实模型编导。每镜2秒，保留背景；等待用户视觉确认。</p>
${report.cards.map(c=>`<section><h2>${c.id}</h2><p>${c.text}</p>${c.results.map(r=>`<div><p>${r.aspect} · 60帧</p><video controls preload="metadata" src="${r.video}"></video>${r.samples.map(s=>`<img src="${s}">`).join('')}</div>`).join('')}</section>`).join('')}`);
console.log(out);
