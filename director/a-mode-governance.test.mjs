import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {validatedCheckpoint} from './a-mode-plan-checkpoint.mjs';
import {preflightAModeRender} from './a-mode-render-preflight.mjs';
import {createAModeRun, executeAModeRun, readAModeRun} from './a-mode-run.mjs';
import {installTextAdmissionFixture} from './test-support/text-admission-fixture.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-governance-'));
  t.after(() => fs.rmSync(root, {recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'director'), {recursive:true});
  installTextAdmissionFixture(root);
  for (const name of ['card-capability-index.json','template-registry.json'])
    fs.copyFileSync(new URL(name, import.meta.url), path.join(root,'director',name));
  return root;
}

test('无效缓存修正一次，保留原响应；有效缓存不再次调用模型', async t => {
  const file = path.join(fixture(t),'plan.json');
  fs.writeFileSync(file, JSON.stringify({valid:false}));
  let calls = 0;
  const options = {file,prompt:'编导',context:{phase:'global'},
    validate:value => {if (!value.valid) throw new Error('素材短于镜头');},
    call:async prompt => { calls++; assert.match(prompt,/素材短于镜头/); return {valid:true}; }};
  await validatedCheckpoint(options);
  await validatedCheckpoint(options);
  assert.equal(calls,1);
  assert.ok(fs.readdirSync(path.dirname(file)).some(name => name.includes('.rejected-')));
});

test('修正仍失败最多两次请求；网络失败不会自动重试', async t => {
  const root = fixture(t);
  let calls = 0;
  await assert.rejects(validatedCheckpoint({file:path.join(root,'bad.json'), prompt:'编导',
    call:async () => {calls++; return {};}, validate:() => {throw new Error('不合规');}}),/修正后仍/);
  assert.equal(calls,2);
  calls = 0;
  await assert.rejects(validatedCheckpoint({file:path.join(root,'network.json'),prompt:'编导',
    call:async () => {calls++; throw new Error('timeout');},validate:() => {}}),/timeout/);
  assert.equal(calls,1);
});

test('逐镜第二批中断后，仅续跑第二批，冻结配音和候选库', async t => {
  const root = fixture(t);
  const segments = Array.from({length:8},(_,i) => ({text:`第${i}段核心观点。`,fromFrame:i*180,durationInFrames:180}));
  const cards = ['typography/scramble','typography/blur-slide','typography/brace-expand'];
  fs.mkdirSync(path.join(root,'materials','_scenes'),{recursive:true});
  const materials = [0,1].map(i => ({path:`观点${i}.mp4`,tags:['核心观点'],duration_sec:5}));
  for (const material of materials) fs.writeFileSync(path.join(root,'materials','_scenes',material.path),'fixture');
  fs.writeFileSync(path.join(root,'materials','_index.json'),JSON.stringify(materials));
  const globals = segments.map((_,i) => ({fromSegment:i,toSegment:i+1,type:'claim',card:cards[i%3],material:`观点${i%2}.mp4`,materialRole:'backdrop',reason:'视频底层，前景观点文字逐层呈现'}));
  const detail = (start,count) => ({shots:Array.from({length:count},(_,i) => ({index:i,displayLines:cards[(start+i)%3]==='typography/scramble' ? [`观点${start+i}`] : [`观点${start+i}`,'核心观点'],elementPlan:'主标题逐层呈现',captionHighlights:['核心观点']}))});
  const {runId,dir} = createAModeRun(root,{text:segments.map(s=>s.text).join('')});
  let shotCalls = 0;
  await assert.rejects(executeAModeRun(root,runId,{
    tts:async (_cmd,args) => {fs.mkdirSync(path.dirname(args[2]),{recursive:true});fs.writeFileSync(args[2],'preserved');
      fs.writeFileSync(args[3],JSON.stringify({fps:30,totalFrames:1440,segments}));},
    director:async (_prompt,{phase}) => {
      if (phase === 'global') return {shots:globals};
      if (++shotCalls === 2) throw new Error('第二批网络中断');
      return detail(0,6);
    },
  }),/第二批网络中断/);
  assert.equal(readAModeRun(root,runId).failedStage,'shot-director');
  const timingBefore = fs.readFileSync(path.join(dir,'timing.json'),'utf8');
  const candidatesBefore = fs.readFileSync(path.join(dir,'material-candidates.json'),'utf8');
  const phases = [];
  const sb = await executeAModeRun(root,runId,{resumeFromDirector:true,
    tts:async()=>{throw new Error('不得重做配音');},
    director:async(prompt,{phase})=>{phases.push(phase);assert.match(prompt,/第 7 至 8 镜/); return detail(6,2);}});
  assert.deepEqual(phases,['shot']);
  assert.equal(sb.shots.length,8);
  assert.deepEqual(sb.shots.map(s=>s.displayLines[0]),Array.from({length:8},(_,i)=>`观点${i}`));
  assert.equal(fs.readFileSync(path.join(dir,'timing.json'),'utf8'),timingBefore);
  assert.equal(fs.readFileSync(path.join(dir,'material-candidates.json'),'utf8'),candidatesBefore);
  await assert.rejects(executeAModeRun(root,runId),/不能重新覆盖配音/);
});

test('渲染预检拒绝旧占位音频、跨任务音频及字幕错位', t => {
  const root = fixture(t);
  const {runId,dir} = createAModeRun(root,{text:'测试'});
  const audio = `audio/a-mode/${runId}.mp3`;
  fs.mkdirSync(path.dirname(path.join(root,'template','public',audio)),{recursive:true});
  fs.writeFileSync(path.join(root,'template','public',audio),'audio');
  const file = path.join(dir,'storyboard.json');
  const sb = {runId,audio,fps:30,shots:[{durationInFrames:5610,material:'fixture.mp4',materialRole:'background'}]};
  fs.writeFileSync(file,JSON.stringify(sb));
  fs.writeFileSync(path.join(dir,'timing.json'),JSON.stringify({fps:30,totalFrames:5610}));
  assert.throws(()=>preflightAModeRender(root,{runId,runDir:dir,probe:()=>1.584}),/时长不匹配/);
  assert.equal(preflightAModeRender(root,{runId,runDir:dir,probe:()=>187.536}).runId,runId);
  fs.writeFileSync(file,JSON.stringify({...sb,audio:'audio/voiceover.mp3'}));
  assert.throws(()=>preflightAModeRender(root,{runId,runDir:dir,probe:()=>187.536}),/关联不一致/);
  fs.writeFileSync(file,JSON.stringify(sb));
  fs.writeFileSync(path.join(dir,'timing.json'),JSON.stringify({fps:30,totalFrames:90}));
  assert.throws(()=>preflightAModeRender(root,{runId,runDir:dir,probe:()=>187.536}),/字幕时间轴/);
});
