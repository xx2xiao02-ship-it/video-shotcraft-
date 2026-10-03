import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {openingVisualTiming, restoreCaptionHighlights, validateOpeningShots, OPENING_POLICY} from './opening-visual-timeline.mjs';
import {readShortAcceptance,shortCapability,SHORT_REPORT} from './short-card-admission.mjs';
import {validateGlobalPlan,buildStoryboard,createAModeRun,executeAModeRun} from './a-mode-run.mjs';
import {createSubtitleSnapshot,normalizeSubtitleSettings} from './subtitle-v1.mjs';
import {installTextAdmissionFixture} from './test-support/text-admission-fixture.mjs';

const timing = {fps:30,totalFrames:330,segments:[
  {text:'现金远比想象中更有用。',fromFrame:0,durationInFrames:133},
  {text:'资产不等于活钱。',fromFrame:133,durationInFrames:197},
]};
const report = {localVisualReview:'passed',cards:[{id:'typography/marker-underline-title',status:'accepted',acceptedFrames:[60],completionFrame:42,holdFrames:18,exitFrames:0,maxLines:2,maxChars:6},
  {id:'typography/paper-title-card',status:'accepted',acceptedFrames:[60],completionFrame:34,holdFrames:18,exitFrames:8,maxLines:2,maxChars:6}]};

test('视觉开场拆为1+2+2秒；字幕配音原始段不变，不伪造字级时间',()=>{
  const before = JSON.stringify(timing);
  const visual = openingVisualTiming(timing);
  assert.deepEqual(visual.segments.map(s=>s.durationInFrames),[30,60,60,180]);
  assert.deepEqual(visual.segments[2].sourceSegments,[0,1]);
  assert.equal(JSON.stringify(timing),before);
  assert.equal(visual.segments.map(s=>s.text).join(''),timing.segments.map(s=>s.text).join(''));
  assert.deepEqual(restoreCaptionHighlights(timing,visual,['现金','更有用','资产','活钱']),['现金','资产']);
  assert.equal(visual.segments.reduce((n,s)=>n+s.durationInFrames,0),timing.totalFrames);
});
test('短片、1字长配音都保留有效连续视觉窗口',()=>{
  for(const frames of [1,20,30,45,70,90,120,150,151]) {
    const result=openingVisualTiming({fps:30,totalFrames:frames,segments:[{text:'好',fromFrame:0,durationInFrames:frames}]});
    assert.equal(result.segments.reduce((n,s)=>n+s.durationInFrames,0),frames);
    assert.ok(result.segments.every(s=>s.contextText==='好' && s.durationInFrames>0));
    assert.equal(result.segments.map(s=>s.text).join(''),'好');
  }
});
test('全局与最终画面都拒绝截长卡、跨5秒和超容量',()=>{
  const shots = [
    {shotCard:null,material:'1.mp4',durationInFrames:30,displayLines:['现金']},
    {shotCard:'typography/marker-underline-title',material:'2.mp4',durationInFrames:60,displayLines:['更有用']},
    {shotCard:'typography/paper-title-card',material:'3.mp4',durationInFrames:60,displayLines:['留住选择']},
    {shotCard:'typography/blur-slide',material:'4.mp4',durationInFrames:180},
  ];
  assert.equal(validateOpeningShots(shots,report),shots);
  assert.throws(()=>validateOpeningShots([{...shots[1],durationInFrames:30}],report),/未通过/);
  assert.throws(()=>validateOpeningShots([{...shots[1],shotCard:'typography/cel-flash-stomp'}],report),/不得压缩/);
  assert.throws(()=>validateOpeningShots([{...shots[1],displayLines:['这行中文明显太长了']}],report),/容量/);
  assert.throws(()=>validateOpeningShots([{...shots[1],durationInFrames:60}],report,30,140),/边界/);
  const visual=openingVisualTiming(timing);
  const globals=shots.map((s,i)=>({fromSegment:i,toSegment:i+1,type:'content',card:s.shotCard,material:s.material,
    materialRole:i?'backdrop':'background',reason:'语义匹配'}));
  const materials=shots.map(s=>({path:s.material,duration_sec:8}));
  assert.equal(validateGlobalPlan({shots:globals},visual.segments,materials,{openingPolicy:OPENING_POLICY,shortReport:report}).length,4);
  assert.throws(()=>validateGlobalPlan({shots:[{...globals[0],toSegment:2},...globals.slice(2)]},visual.segments,materials,
    {openingPolicy:OPENING_POLICY,shortReport:report}),/超过2秒/);
  const details=shots.map((s,i)=>({displayLines:s.displayLines || ['资产','现金'],elementPlan:'原卡元素',
    captionHighlights:visual.segments[i].sourceSegments.map(()=>i<3?'现金':'活钱')}));
  const sb=buildStoryboard(null,'test',visual,globals,details,{}, {shortReport:report});
  sb.subtitleHighlights=restoreCaptionHighlights(timing,visual,sb.subtitleHighlights);
  assert.equal(sb.subtitleHighlights.length,timing.segments.length);
  assert.equal(sb.shots.reduce((n,s)=>n+s.durationInFrames,0),timing.totalFrames);
  const subtitles=createSubtitleSnapshot(normalizeSubtitleSettings(null),timing,sb);
  assert.equal(subtitles.captions.length,timing.segments.length);
  assert.equal(subtitles.captions.map(c=>c.text).join(''),timing.segments.map(s=>s.text).join(''));
});
test('短时长证据绑定源码，变更后关闭，未验收157卡默认不开放',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'short-admission-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.dirname(path.join(root,SHORT_REPORT)),{recursive:true});
  fs.writeFileSync(path.join(root,'source.txt'),'original');
  const sha=crypto.createHash('sha256').update('original').digest('hex');
  fs.writeFileSync(path.join(root,SHORT_REPORT),JSON.stringify({...report,schema:'short-card-acceptance-v1',fps:30,sourceHashes:{'source.txt':sha}}));
  assert.equal(readShortAcceptance(root).cards.length,2);
  assert.equal(shortCapability('unknown',readShortAcceptance(root)).status,'not-accepted');
  fs.writeFileSync(path.join(root,'source.txt'),'changed');
  assert.equal(readShortAcceptance(root),null);
});

test('2秒图形限制信息密度，不能拿长版多节点或多数据硬塞',()=>{
  const graphicReport={cards:[{id:'data/hatch-depth',status:'accepted',fps:30,acceptedFrames:[60],
    completionFrame:30,holdFrames:30,exitFrames:0,maxLines:1,maxChars:6,kind:'graphic',
    graphicLimits:{maxRows:2,maxLabelChars:4,maxUnitChars:2}},
    {id:'ui-entrance/bezier-source-converge-merge',status:'accepted',fps:30,acceptedFrames:[60],
    completionFrame:42,holdFrames:18,exitFrames:0,maxLines:1,maxChars:6,kind:'graphic',
    graphicLimits:{maxSources:3,maxSourceChars:2,maxTargetChars:4}}]};
  const chart={shotCard:'data/hatch-depth',material:'a.mp4',durationInFrames:60,displayLines:['现金对比'],
    templateParams:{rows:[{label:'资产',value:100},{label:'现金',value:10}],unit:'万'}};
  assert.equal(validateOpeningShots([chart],graphicReport).length,1);
  assert.throws(()=>validateOpeningShots([{...chart,templateParams:{...chart.templateParams,rows:[...chart.templateParams.rows,{label:'负债',value:30}]}}],graphicReport),/信息过密/);
  const converge={...chart,shotCard:'ui-entrance/bezier-source-converge-merge',templateParams:{sources:['收入','节流','还债'],target:'底气'}};
  assert.equal(validateOpeningShots([converge],graphicReport).length,1);
  assert.throws(()=>validateOpeningShots([{...converge,templateParams:{sources:['稳定收入','节流'],target:'底气'}}],graphicReport),/信息过密/);
});

test('新任务实际双层编导入口使用短索引，续跑不重做配音且字幕仍一一对应（模拟模型）',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'opening-execution-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'template/src'),{recursive:true});
  fs.mkdirSync(path.join(root,'director'),{recursive:true});
  installTextAdmissionFixture(root);
  fs.writeFileSync(path.join(root,'template/src/DynamicVideo.tsx'),'fixture');
  for(const name of ['card-capability-index.json','template-registry.json'])
    fs.copyFileSync(path.join(import.meta.dirname,name),path.join(root,'director',name));
  fs.mkdirSync(path.dirname(path.join(root,SHORT_REPORT)),{recursive:true});
  fs.writeFileSync(path.join(root,SHORT_REPORT),JSON.stringify({...report,schema:'short-card-acceptance-v1',fps:30,
    sourceHashes:{'template/src/DynamicVideo.tsx':crypto.createHash('sha256').update('fixture').digest('hex')}}));
  const created=createAModeRun(root,{text:timing.segments.map(s=>s.text).join('')});
  assert.equal(JSON.parse(fs.readFileSync(path.join(created.dir,'input.json'))).openingPolicy,OPENING_POLICY);
  fs.writeFileSync(path.join(created.dir,'timing.json'),JSON.stringify(timing));
  fs.mkdirSync(path.join(root,'template/public/audio/a-mode'),{recursive:true});
  const audio=path.join(root,'template/public/audio/a-mode',`${created.runId}.mp3`);
  fs.writeFileSync(audio,'existing-audio-fixture');
  const candidates=Array.from({length:4},(_,i)=>({path:`${i}.mp4`,duration_sec:8}));
  fs.writeFileSync(path.join(created.dir,'material-candidates.json'),JSON.stringify(candidates));
  const cards=[null,'typography/marker-underline-title','typography/paper-title-card','typography/blur-slide'];
  const globals=cards.map((card,i)=>({fromSegment:i,toSegment:i+1,type:'content',card,
    material:`${i}.mp4`,materialRole:card?'backdrop':'background',reason:'现金语义的真实场景'}));
  const details=cards.map((_,i)=>({index:i,displayLines:i===0?['现金']:['现金','有底气'],
    elementPlan:'原卡标题层级',captionHighlights:[i<2?'现金':'资产']}));
  let calls=0;
  const options={resumeFromDirector:true,tts:async()=>{throw new Error('不得重做配音');},director:async(prompt,{phase})=>{
    calls++;assert.match(prompt,/acceptedFrames/);assert.match(prompt,/前5秒/);
    return {shots:phase==='global'?globals:details};
  }};
  const sb=await executeAModeRun(root,created.runId,options);
  assert.equal(calls,2);
  assert.deepEqual(sb.shots.map(s=>s.durationInFrames),[30,60,60,180]);
  assert.equal(sb.shots.map(s=>s.text).join(''),timing.segments.map(s=>s.text).join(''));
  const snapshot=createSubtitleSnapshot(normalizeSubtitleSettings(null),timing,sb);
  assert.equal(snapshot.captions.length,2);
  assert.equal(snapshot.captions[1].startMs,Math.round(133/30*1000));
  await assert.rejects(()=>executeAModeRun(root,created.runId,options),/只有未生成分镜/);
  assert.equal(calls,2);
  assert.equal(fs.readFileSync(audio,'utf8'),'existing-audio-fixture');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(created.dir,'timing.json'))),timing);
});
