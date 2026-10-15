import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
import {minimumContrast,chooseReadableText,backgroundsUnderGlyphs} from './talkcraft-color-contrast.mjs';
import {assertWordReveals,wordRevealSourceBinding,wordRevealUnits} from './talkcraft-word-reveal.mjs';
import {loadProjectBundleOptions,projectRenderOptions} from '../_audit/video-talkcraft/scripts/remotion_project_config.mjs';
const project=path.resolve(process.argv[2]),remotion=path.join(project,'remotion'),work=path.resolve(process.argv[3]);
const prepare=process.argv.includes('--prepare');fs.mkdirSync(work,{recursive:true});
const all=assertWordReveals(project),only=process.argv.find(s=>s.startsWith('--only='))?.slice(7).split(','),reveals={...all,events:all.events.filter(e=>!only||only.includes(e.beatId))},beats=wordRevealUnits(project).filter(b=>!only||only.includes(b.id));
if(!reveals.events.length)throw Error('指定范围没有任何文字事件');
const frames=[...new Set(beats.flatMap(b=>{
 const es=reveals.events.filter(e=>e.beatId===b.id&&!e.deferredTo);
 return [...es.map(e=>Math.min(b.endFrame-1,Math.max(b.startFrame,e.globalFrame)+12)),...(b.card==='filmstrip-conveyor'?es.flatMap(e=>[0,3].map(offset=>Math.min(b.endFrame-1,Math.max(b.startFrame,e.globalFrame)+offset))):[]),Math.round((b.startFrame+b.endFrame)/2),b.endFrame-1];
}))].sort((a,b)=>a-b);
const require=createRequire(path.join(remotion,'package.json')),{bundle}=require('@remotion/bundler'),{openBrowser,selectComposition,renderStill}=require('@remotion/renderer');
const propsFile=path.join(remotion,'qa-repair-props.json');
const base=fs.existsSync(propsFile)?JSON.parse(fs.readFileSync(propsFile)):{},sourceBinding=wordRevealSourceBinding(project);
const decode=(file,width,height)=>execFileSync('ffmpeg',['-v','error','-i',file,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:width*height*3+65536});
// Only glyph pixels change between these deterministic renders. Empty corners of
// rotated text bounds must not be mistaken for the background directly under letters.
const reuse=process.argv.find(s=>s.startsWith('--reuse='))?.slice(8),samples=[];
if(reuse){const file=path.resolve(reuse),saved=JSON.parse(fs.readFileSync(file));if(JSON.stringify(saved.binding)!==JSON.stringify(sourceBinding))throw Error('取色缓存已过期');
 for(const frame of [...new Set(saved.samples.map(r=>r.frame))]){const normal=decode(path.join(path.dirname(file),`frame-${frame}.png`),1920,1080),background=decode(path.join(path.dirname(file),`background-${frame}.png`),1920,1080);
  for(const row of saved.samples.filter(r=>r.frame===frame)){const colors=backgroundsUnderGlyphs(row,normal,background,1920,1080);if(colors.length)samples.push({...row,backgrounds:colors});}
 }
}
else {
const bundleOptions=await loadProjectBundleOptions(require,remotion),renderOptions=projectRenderOptions(require,{browser:process.env.TALKCRAFT_BROWSER});
const serveUrl=await bundle({entryPoint:path.join(remotion,'src/index.ts'),publicDir:path.join(remotion,'public'),...bundleOptions,outDir:path.join(work,'bundle')});
const browser=await openBrowser('chrome',renderOptions);
try{
 const composition=await selectComposition({serveUrl,id:'Main',inputProps:{...base,auditContrast:true,contrastMask:false},puppeteerInstance:browser});
 for(const frame of frames){
  let record;const maskFile=path.join(work,`background-${frame}.png`);
  const capture=(mask,output)=>renderStill({serveUrl,composition:{...composition,props:{...composition.props,auditContrast:true,contrastMask:mask}},inputProps:{...base,auditContrast:true,contrastMask:mask},puppeteerInstance:browser,frame,output,imageFormat:'png',logLevel:'error',onBrowserLog:e=>{const p='TALKCRAFT_CONTRAST_AUDIT:';if(e.text?.includes(p))record=JSON.parse(e.text.slice(e.text.indexOf(p)+p.length));}});
  await capture(false,path.join(work,`frame-${frame}.png`));
  if(!record)throw Error('缺少实际颜色记录:'+frame);
  // Hide glyphs only; the plate, footage, alpha overlays and camera stay unchanged.
  await capture(true,maskFile);
  const raw=decode(maskFile,composition.width,composition.height),normal=decode(path.join(work,`frame-${frame}.png`),composition.width,composition.height);
  for(const row of record.rows){const colors=backgroundsUnderGlyphs(row,normal,raw,composition.width,composition.height);
   if(colors.length)samples.push({...row,frame,backgrounds:colors});
  }console.log('contrast frame '+frame);
 }
}finally{await browser.close({silent:true});}
fs.writeFileSync(path.join(work,'capture.json'),JSON.stringify({samples,binding:sourceBinding},null,2)+'\n');
}
if(JSON.stringify(sourceBinding)!==JSON.stringify(wordRevealSourceBinding(project)))throw Error('颜色采样期间源码改变');
// Fade animation is measured at each event's strongest sampled visibility, not its entrance.
const checkedEvents=[...reveals.events.filter(e=>!e.deferredTo),...(samples.some(s=>s.id==='caption')?[{id:'caption',text:'底部跟读字幕'}]:[])];
const maxOpacity=Object.fromEntries(checkedEvents.map(e=>[e.id,Math.max(0,...samples.filter(s=>s.id===e.id).map(s=>s.opacity))]));
const settled=samples.filter(s=>s.opacity>=maxOpacity[s.id]-.025),failures=[],decisions={};
for(const event of checkedEvents){
 const rows=settled.filter(s=>s.id===event.id);if(!rows.length){failures.push({id:event.id,reason:'缺少已显示文字的背景证据'});continue;}
 const ratio=Math.min(...rows.map(r=>minimumContrast(r.color,r.backgrounds,r.opacity,r.brightness??1)));
 if(ratio<4.5){failures.push({id:event.id,text:event.text,ratio,minimum:4.5,frames:rows.map(r=>r.frame)});
  if(prepare){const opacity=Math.min(...rows.map(r=>r.opacity)),brightness=Math.min(...rows.map(r=>r.brightness??1)),backgrounds=rows.flatMap(r=>r.backgrounds);
   try{const pick=chooseReadableText(rows[0].color,backgrounds,{opacity,brightness});decisions[event.id]={color:pick.color,...(pick.backgroundColor?{backgroundColor:pick.backgroundColor}:{}),beforeColor:rows[0].color,beforeRatio:ratio,reason:'实际文字区域背景取色后确定',sampleFrames:rows.map(r=>r.frame)};}
   catch(error){failures.at(-1).blocker=error.message;}
  }
 }
}
const report={schemaVersion:1,scope:only?[...only].sort():null,passed:!failures.length,minimum:4.5,frames:frames.length,events:reveals.events.filter(e=>!e.deferredTo).length,failures,samples:settled,binding:sourceBinding,userAcceptance:false};
fs.writeFileSync(path.join(work,'contrast-audit.json'),JSON.stringify(report,null,2)+'\n');
if(prepare){const file=path.join(remotion,'text-readability.json'),prior=JSON.parse(fs.readFileSync(file));fs.writeFileSync(file,JSON.stringify({schemaVersion:1,enabled:true,minimum:4.5,byEvent:{...prior.byEvent,...decisions}},null,2)+'\n');}
else fs.writeFileSync(path.join(project,'qa/text-contrast-runtime'+(only?'-'+[...only].sort().join('-'):'')+'.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,frames:report.frames,events:report.events,changes:Object.keys(decisions),failures}));
if((!prepare&&failures.length)||failures.some(f=>f.blocker))process.exitCode=1;
