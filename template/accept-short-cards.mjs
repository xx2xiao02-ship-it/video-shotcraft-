import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition, renderMedia, renderStill} from '@remotion/renderer';
import {probeVideo, ffmpegPath} from '../director/packaging-media.mjs';

const root = path.resolve(import.meta.dirname, '..');
const outputName = process.env.SHORT_ACCEPTANCE_OUTPUT || 'short-card-acceptance-v1';
if (!/^short-card-acceptance-v\d+$/.test(outputName)) throw new Error('Invalid short acceptance output name');
const out = path.join(root, 'template/out', outputName);
fs.mkdirSync(out, {recursive:true});
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const sourceFiles = ['template/src/DynamicVideo.tsx','template/src/TemplateAdapter.tsx',
  'demos/_fixtures/Motion.tsx','demos/_fixtures/TemplateSkin.ts',
  'demos/typography/marker-underline-title/MarkerUnderlineTitle.tsx',
  'demos/typography/paper-title-card/PaperTitleCard.tsx',
  'demos/typography/countdown-arc-scatter/CountdownArcScatter.tsx'];
const report = {schema:'short-card-acceptance-v1', fps:30, createdAt:new Date().toISOString(),
  localVisualReview:'pending',userVisualReview:'pending',
  scope:'Chinese short-shot business fixtures; local technical review, user acceptance pending',
  sourceHashes:Object.fromEntries(sourceFiles.map(file => [file, hash(file)])), cards:[]};
const original = JSON.parse(fs.readFileSync(path.join(root,
  'director/a-mode-runs/f4f78a6c-aa2b-4917-9bed-66398863f3f9/props.json'), 'utf8'));
const fixtures = [
  {id:'typography/marker-underline-title',lines:['现金','更有用'],completionFrame:42,holdFrames:18,exitFrames:0},
  {id:'typography/paper-title-card',lines:['留住现金','留住选择'],completionFrame:34,holdFrames:18,exitFrames:8},
  // This card's timeline is normalized to the entire shot: it has no reading hold.
  {id:'typography/countdown-arc-scatter',lines:['分钟','改变'],completionRatio:0.98,holdFrames:18,exitFrames:0,
    blocker:'固定数字5、白底且缺少阅读停留，不符合通用中文透底镜头契约'},
];
const serveUrl = await bundle({entryPoint:path.join(root,'template/src/index.ts'),publicDir:path.join(root,'template/public')});
const browser = await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
try {
  for (const fixture of fixtures) {
    const entry = {...fixture,fps:30,maxLines:2,maxChars:Math.max(...fixture.lines.map(line=>[...line].length)),acceptedFrames:[],status:'not-accepted',results:[]};
    for (const frames of [30,45,60]) {
      let passed = !fixture.blocker && frames >= fixture.completionFrame + fixture.holdFrames + fixture.exitFrames;
      for (const aspect of ['16:9','9:16']) {
        const name = `${fixture.id.split('/').at(-1)}-${frames}-${aspect === '9:16' ? 'portrait' : 'landscape'}`;
        const shot = {...original.storyboard.shots[0],shotCard:fixture.id,durationInFrames:frames,
          displayLines:fixture.lines,displayText:fixture.lines.join('\n'),materialRole:'backdrop'};
        const props = {...original,storyboard:{...original.storyboard,aspectRatio:aspect,shots:[shot],audio:undefined,
          subtitleV1:undefined,subtitleHighlights:undefined}};
        const composition = await selectComposition({serveUrl,id:'DynamicVideo',inputProps:props,puppeteerInstance:browser});
        const video = path.join(out,`${name}.mp4`);
        let reusable=false;
        try {const info=probeVideo(video);reusable=info.width===composition.width && info.height===composition.height && Math.abs(info.durationSeconds-frames/30)<0.05;} catch {}
        if (!reusable) await renderMedia({serveUrl,composition,inputProps:props,puppeteerInstance:browser,
          codec:'h264',pixelFormat:'yuv420p',outputLocation:video,concurrency:1,
          offthreadVideoCacheSizeInBytes:64*1024*1024,offthreadVideoThreads:1,logLevel:'error'});
        execFileSync(ffmpegPath(),['-v','error','-i',video,'-f','null','-'],{windowsHide:true});
        const info = probeVideo(video);
        const correct = Math.abs(info.durationSeconds - frames / 30) < 0.05 &&
          info.width === (aspect === '9:16' ? 1080 : 1920) && info.height === (aspect === '9:16' ? 1920 : 1080);
        passed &&= correct;
        const samples = [];
        for (const frame of [...new Set([Math.floor(frames / 2),Math.min(frames-1,fixture.completionFrame || Math.floor(frames*.98)),frames-1])]) {
          const output = path.join(out,`${name}-f${frame}.png`);
          if(!fs.existsSync(output)) await renderStill({serveUrl,composition,inputProps:props,puppeteerInstance:browser,output,frame,scale:0.5,logLevel:'error',
            offthreadVideoCacheSizeInBytes:64*1024*1024,offthreadVideoThreads:1});
          samples.push(path.basename(output));
        }
        entry.results.push({frames,aspect,video:path.basename(video),videoSha256:crypto.createHash('sha256').update(fs.readFileSync(video)).digest('hex'),samples,info,fullDecodePassed:true,technicalPassed:correct});
        console.log(`SHORT ${name} decoded`);
      }
      if (passed) entry.acceptedFrames.push(frames);
    }
    entry.status = entry.acceptedFrames.length ? 'accepted' : 'not-accepted';
    entry.reason = fixture.blocker || '保留原入场时序；完成后至少18帧中文阅读停留';
    if(entry.status==='accepted') {
      entry.boundaryLines=['留住现金底气','留住选择余地'];
      entry.boundarySamples=[];
      for(const aspect of ['16:9','9:16']) {
        const shot={...original.storyboard.shots[0],shotCard:fixture.id,durationInFrames:60,
          displayLines:entry.boundaryLines,displayText:entry.boundaryLines.join('\n'),materialRole:'backdrop'};
        const props={...original,storyboard:{...original.storyboard,aspectRatio:aspect,shots:[shot],audio:undefined,subtitleV1:undefined,subtitleHighlights:undefined}};
        const composition=await selectComposition({serveUrl,id:'DynamicVideo',inputProps:props,puppeteerInstance:browser});
        const output=path.join(out,`${fixture.id.split('/').at(-1)}-boundary-${aspect==='9:16'?'portrait':'landscape'}.png`);
        await renderStill({serveUrl,composition,inputProps:props,puppeteerInstance:browser,output,frame:fixture.completionFrame,scale:0.5,logLevel:'error',
          offthreadVideoCacheSizeInBytes:64*1024*1024,offthreadVideoThreads:1});
        entry.boundarySamples.push(path.basename(output));
      }
      entry.maxChars=6;
    }
    report.cards.push(entry);
  }
} finally {await browser.close({silent:true});}
fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'director/card-capability-index.json'),'utf8'));
const escape = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>短镜头验收</title>
<style>body{font:15px/1.6 'Microsoft YaHei';margin:24px;background:#14191d;color:#fff}section{border-top:1px solid #697078;padding:20px 0}video{max-width:100%;width:320px}img{max-width:100%;height:160px}h1{font-size:24px}h2{font-size:18px}</style>
<h1>中文短镜头验收：1秒 / 1.5秒 / 2秒</h1><p>横竖版实际渲染；未通过不开放。等待用户视觉确认。</p>
${report.cards.map(c=>`<section><h2>${escape(c.id)}</h2><p>通过时长：${c.acceptedFrames.map(f=>f/30+'秒').join('、')||'无'}。${escape(c.reason)}</p>${(c.boundarySamples||[]).map(s=>`<img src="${s}">`).join('')}${c.results.map(r=>`<div><p>${r.frames/30}秒 · ${r.aspect}</p><video controls preload="metadata" src="${r.video}"></video>${r.samples.map(s=>`<img src="${s}">`).join('')}</div>`).join('')}</section>`).join('')}
<section><h2>全部${catalog.cards.length}张卡的短镜头状态</h2><p>只有以上3张做了本轮短时长渲染，其余卡未通过短镜头验收，不自动截短。</p><table><tr><th>卡片</th><th>原时长说明</th><th>短镜通过时长</th></tr>${catalog.cards.map(c=>`<tr><td>${escape(c.id)}</td><td>${escape(c.duration)}</td><td>${report.cards.find(r=>r.id===c.id)?.acceptedFrames.map(f=>f/30+'秒').join('、')||'未开放'}</td></tr>`).join('')}</table></section>`);
console.log(`短卡验收输出：${out}`);
