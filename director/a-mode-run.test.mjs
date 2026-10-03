import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {installTextAdmissionFixture} from './test-support/text-admission-fixture.mjs';
import {buildStoryboard, createAModeRun, executeAModeRun, readAModeRun,
  loadMaterials, validateGlobalPlan, validateShotPlan, createAModeRevisionRun} from './a-mode-run.mjs';

const segments = [
  {text:'行业正在变化。', fromFrame:0, durationInFrames:180},
  {text:'真正重要的是信任。', fromFrame:180, durationInFrames:180},
];
const globals = [
  {fromSegment:0, toSegment:1, type:'keypoint', card:'typography/cel-flash-stomp', material:null, materialRole:'none', reason:'特殊强调免背景：开场强调变化，留白后再展开证据'},
  {fromSegment:1, toSegment:2, type:'claim', card:'typography/blur-slide', material:null, materialRole:'none', reason:'特殊强调免背景：收束信任，纯色停顿结束短片'},
];
const details = [
  {index:0, displayLines:['变化','已来','准备'], elementPlan:'三个关键词依次落位', captionHighlights:['变化']},
  {index:1, displayLines:['信任', '才是核心'], elementPlan:'主标题先行，副标题随后出现', captionHighlights:['信任']},
];

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-a-mode-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  fs.mkdirSync(path.join(root, 'director'), {recursive:true});
  installTextAdmissionFixture(root);
  fs.copyFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'card-capability-index.json'),
    path.join(root, 'director', 'card-capability-index.json'));
  fs.copyFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'template-registry.json'),
    path.join(root, 'director', 'template-registry.json'));
  return root;
}

test('修订隔离复用原配音、时间轴和主题，不复制旧分镜或改动原任务', t => {
  const root = fixture(t);
  const source = createAModeRun(root, {text:'行业正在变化。'});
  const audioDir = path.join(root,'template','public','audio','a-mode');
  fs.mkdirSync(audioDir,{recursive:true});
  fs.writeFileSync(path.join(audioDir,`${source.runId}.mp3`),'original audio');
  fs.writeFileSync(path.join(source.dir,'timing.json'),JSON.stringify({fps:30,totalFrames:180,segments:[segments[0]]}));
  fs.writeFileSync(path.join(source.dir,'theme.json'),JSON.stringify({aspectRatio:'9:16'}));
  fs.writeFileSync(path.join(source.dir,'storyboard.json'),'historical storyboard');
  const status = fs.readFileSync(path.join(source.dir,'status.json'),'utf8');
  const revision = createAModeRevisionRun(root,source.runId);
  assert.notEqual(revision.runId,source.runId);
  assert.equal(fs.readFileSync(path.join(audioDir,`${revision.runId}.mp3`),'utf8'),'original audio');
  for (const file of ['timing.json','theme.json']) assert.deepEqual(fs.readFileSync(path.join(revision.dir,file)),fs.readFileSync(path.join(source.dir,file)));
  assert.equal(fs.existsSync(path.join(revision.dir,'storyboard.json')),false);
  assert.equal(fs.readFileSync(path.join(source.dir,'status.json'),'utf8'),status);
  assert.equal(JSON.parse(fs.readFileSync(path.join(revision.dir,'revision-source.json'))).sourceRunId,source.runId);
});

test('双层编导校验覆盖、槽位、素材与重复', () => {
  assert.equal(validateGlobalPlan({shots:globals}, segments, []).length, 2);
  assert.equal(validateShotPlan({shots:details}, globals).length, 2);
  assert.throws(() => validateGlobalPlan({shots:[{...globals[0], fromSegment:1}, globals[1]]}, segments, []), /连续覆盖/);
  assert.throws(() => validateGlobalPlan({shots:[{...globals[0], material:'unknown.mp4'}, globals[1]]}, segments, []), /候选库/);
  assert.throws(() => validateGlobalPlan({shots:[{...globals[0], material:'real.mp4'}, globals[1]]}, segments, [{path:'real.mp4'}]), /媒体替换槽/);
  assert.throws(() => validateShotPlan({shots:[{...details[0], displayLines:['一行超过十四个字的画面主文案明显不合规范']}, details[1]]}, globals), /排版无效/);
});

test('背景实拍短于镜头允许减速，长镜头仍须拆分', () => {
  const background = {...globals[0], card:null, material:'office.mp4', materialRole:'background'};
  assert.equal(validateGlobalPlan({shots:[background, globals[1]]}, segments,
    [{path:'office.mp4', duration_sec:3}]).length, 2);
  assert.equal(validateGlobalPlan({shots:[background, globals[1]]}, segments,
    [{path:'office.mp4', duration_sec:1}]).length, 2);
  assert.throws(() => validateGlobalPlan({shots:[background, globals[1]]}, segments,
    [{path:'office.mp4'}]), /时长无效/);
  assert.throws(() => validateGlobalPlan({shots:[{...background, toSegment:2}]},
    [{text:'很长的口播', fromFrame:0, durationInFrames:280}, segments[1]], [{path:'office.mp4',duration_sec:3}]), /超过 9 秒/);
});

test('文字卡支持背景透底，短素材允许减速覆盖镜头', () => {
  const backdrop = {...globals[0], card:'typography/scramble', material:'cash.mp4', materialRole:'backdrop'};
  const materials = [{path:'cash.mp4', duration_sec:3}];
  assert.equal(validateGlobalPlan({shots:[backdrop, globals[1]]}, segments, materials).length, 2);
  assert.equal(validateGlobalPlan({shots:[{...backdrop, card:'typography/blur-slide'}, globals[1]]}, segments, materials).length, 2);
  assert.throws(() => validateGlobalPlan({shots:[{...backdrop, material:null}, globals[1]]}, segments, materials), /真实素材/);
  assert.equal(validateGlobalPlan({shots:[backdrop, globals[1]]}, segments,
    [{path:'cash.mp4', duration_sec:1}]).length, 2);
  const storyboard = buildStoryboard(null, 'run-id', {fps:30, totalFrames:360, segments},
    [backdrop, globals[1]], [{...details[0],displayLines:['变化已来']},details[1]], {});
  assert.equal(storyboard.shots[0].materialRole, 'backdrop');
  assert.equal(storyboard.shots[0].media, undefined);
});

test('背景默认规则拒绝普通镜头留空，但接受明确特殊观点免除', () => {
  assert.equal(validateGlobalPlan({shots:globals}, segments, [], {requireBackground:true}).length, 2);
  assert.throws(() => validateGlobalPlan({shots:[{...globals[0], type:'content'}, globals[1]]}, segments, [],
    {requireBackground:true}), /缺少背景视频/);
  assert.throws(() => validateGlobalPlan({shots:[{...globals[0], materialRole:null}, globals[1]]}, segments, [],
    {requireBackground:true}), /缺少背景视频/);
});

test('全局编导不允许相邻同素材，即使换模板或换素材角色', () => {
  const shots = globals.map((shot,i) => ({...shot,card:i ? 'ui-entrance/clipcard-looping' : null,
    material:'office.mp4',materialRole:i ? 'inline-element' : 'background'}));
  assert.throws(()=>validateGlobalPlan({shots},segments,[{path:'office.mp4',duration_sec:1}]),/连续使用/);
});

test('A 模式分镜冻结主题画幅', () => {
  const storyboard = buildStoryboard(null, 'run-id', {fps:30, totalFrames:360, segments},
    globals, details, {aspectRatio:'9:16'});
  assert.equal(storyboard.aspectRatio, '9:16');
});

test('A 模式素材检索定位 _scenes 中的真实文件', t => {
  const root = fixture(t);
  const file = path.join(root, 'materials', '_scenes', 'bank.mp4');
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file, 'video');
  fs.writeFileSync(path.join(root, 'materials', '_index.json'),
    JSON.stringify([{path:'bank.mp4', tags:['银行'], duration_sec:5}]));
  assert.equal(loadMaterials(root, '银行现金')[0].path, 'bank.mp4');
});

test('全局编导接受已保存方案中的语义类型，仍拒绝未知类型', () => {
  for (const type of ['narrative', 'keypoint', 'transition', 'example', 'content']) {
    const shots = [{...globals[0], type}, globals[1]];
    assert.deepEqual(validateGlobalPlan({shots}, segments, []), shots);
  }
  assert.throws(() => validateGlobalPlan({shots:[{...globals[0], type:'unknown'}, globals[1]]}, segments, []), /第 1 镜类型无效/);
});

test('A 模式隔离保存双层编导与审核分镜，不触碰历史分镜', async t => {
  const root = fixture(t);
  const oldFile = path.join(root, 'director', 'storyboard.json');
  fs.writeFileSync(oldFile, 'HISTORICAL', 'utf8');
  const {runId, dir} = createAModeRun(root, {text:segments.map(s => s.text).join('')});
  const phases = [];
  const prompts = [];
  const storyboard = await executeAModeRun(root, runId, {
    tts:async (_command, args) => {
      fs.mkdirSync(path.dirname(args[2]), {recursive:true});
      fs.writeFileSync(args[2], 'fake-audio');
      fs.writeFileSync(args[3], JSON.stringify({fps:30, totalFrames:360, segments}));
    },
    director:async (prompt, {phase}) => {
      phases.push(phase);
      prompts.push(prompt);
      return phase === 'global' ? {shots:globals} : {shots:details};
    },
  });
  assert.deepEqual(phases, ['global', 'shot']);
  assert.match(prompts[0], /镜头能力索引/);
  assert.match(prompts[0], /大词逐拍/);
  assert.equal(readAModeRun(root, runId).status, 'review');
  assert.equal(fs.readFileSync(oldFile, 'utf8'), 'HISTORICAL');
  assert.equal(storyboard.shots[1].text, segments[1].text);
  assert.equal(storyboard.shots[1].displayText, '信任\n才是核心');
  assert.equal(storyboard.shots.reduce((n, shot) => n + shot.durationInFrames, 0), 360);
  assert.ok(fs.existsSync(path.join(dir, 'global-plan.json')));
  assert.ok(fs.existsSync(path.join(dir, 'shot-plan.json')));
});

test('模型失败直接报错，不产生待渲染分镜', async t => {
  const root = fixture(t);
  const {runId, dir} = createAModeRun(root, {text:'行业正在变化。'});
  await assert.rejects(() => executeAModeRun(root, runId, {
    tts:async (_command, args) => {
      fs.mkdirSync(path.dirname(args[2]), {recursive:true});
      fs.writeFileSync(args[2], 'fake-audio');
      fs.writeFileSync(args[3], JSON.stringify({fps:30, totalFrames:180, segments:[segments[0]]}));
    },
    director:async () => { throw new Error('model unavailable'); },
  }), /model unavailable/);
  assert.equal(readAModeRun(root, runId).status, 'error');
  assert.equal(fs.existsSync(path.join(dir, 'storyboard.json')), false);
});

test('失败任务从编导阶段续跑时复用配音与时间轴', async t => {
  const root = fixture(t);
  const {runId, dir} = createAModeRun(root, {text:segments.map(s => s.text).join('')});
  await assert.rejects(() => executeAModeRun(root, runId, {
    tts:async (_command, args) => {
      fs.mkdirSync(path.dirname(args[2]), {recursive:true});
      fs.writeFileSync(args[2], 'existing-audio');
      fs.writeFileSync(args[3], JSON.stringify({fps:30, totalFrames:360, segments}));
    },
    director:async () => { throw new Error('transport failed'); },
  }), /transport failed/);
  const audio = path.join(root, 'template', 'public', 'audio', 'a-mode', `${runId}.mp3`);
  const timing = path.join(dir, 'timing.json');
  const phases = [];
  await executeAModeRun(root, runId, {
    resumeFromDirector:true,
    tts:async () => { throw new Error('配音不应重跑'); },
    director:async (_prompt, {phase}) => {
      phases.push(phase);
      return phase === 'global' ? {shots:globals} : {shots:details};
    },
  });
  assert.deepEqual(phases, ['global', 'shot']);
  assert.equal(fs.readFileSync(audio, 'utf8'), 'existing-audio');
  assert.equal(JSON.parse(fs.readFileSync(timing, 'utf8')).totalFrames, 360);
  assert.equal(readAModeRun(root, runId).status, 'review');
});

test('逐镜阶段失败时续跑复用已付费的全局编导结果', async t => {
  const root = fixture(t);
  const {runId} = createAModeRun(root, {text:segments.map(s => s.text).join('')});
  await assert.rejects(() => executeAModeRun(root, runId, {
    tts:async (_command, args) => {
      fs.mkdirSync(path.dirname(args[2]), {recursive:true});
      fs.writeFileSync(args[2], 'existing-audio');
      fs.writeFileSync(args[3], JSON.stringify({fps:30, totalFrames:360, segments}));
    },
    director:async (_prompt, {phase}) => {
      if (phase === 'shot') throw new Error('shot transport failed');
      return {shots:globals};
    },
  }), /shot transport failed/);
  const phases = [];
  await executeAModeRun(root, runId, {
    resumeFromDirector:true,
    tts:async () => { throw new Error('配音不应重跑'); },
    director:async (_prompt, {phase}) => { phases.push(phase); return {shots:details}; },
  });
  assert.deepEqual(phases, ['shot']);
  assert.equal(readAModeRun(root, runId).status, 'review');
});

test('画面主文案不能复刻较长的口播原句', t => {
  const root = fixture(t);
  const timing = {fps:30, totalFrames:90, segments:[{text:'真正重要的是不断累积的长期信任。', fromFrame:0, durationInFrames:90}]};
  assert.throws(() => buildStoryboard(root, '12345678-1234-1234-1234-123456789abc', timing,
    [{fromSegment:0, toSegment:1, type:'claim', card:'typography/blur-slide', material:null, reason:'观点'}],
    [{index:0, displayLines:['真正重要的是不断累积','的长期信任'], elementPlan:'标题'}], {}), /复刻/);
});

function parallelFixture(t) {
  const root = fixture(t);
  const parts = Array.from({length:37},(_,i)=>({text:`现金证据第${i + 1}段。`,fromFrame:i * 180,durationInFrames:180}));
  const cards = ['typography/blur-slide','typography/brace-expand','typography/paper-title-card'];
  const plan = parts.map((_,i)=>({fromSegment:i,toSegment:i + 1,type:'content',card:cards[i % 3],
    material:`cash-${i % 2}.mp4`,materialRole:'backdrop',reason:'现金证据实拍'}));
  fs.mkdirSync(path.join(root,'materials','_scenes'),{recursive:true});
  const materials = [0,1].map(i => ({path:`cash-${i}.mp4`,tags:['现金'],duration_sec:3}));
  for (const material of materials) fs.writeFileSync(path.join(root,'materials','_scenes',material.path),'fixture video');
  fs.writeFileSync(path.join(root,'materials','_index.json'),JSON.stringify(materials));
  const run = createAModeRun(root,{text:parts.map(s=>s.text).join('')});
  const tts = async (_command,args)=>{
    fs.mkdirSync(path.dirname(args[2]),{recursive:true});
    fs.writeFileSync(args[2],'preserved fixture audio');
    fs.writeFileSync(args[3],JSON.stringify({fps:30,totalFrames:37 * 180,segments:parts}));
  };
  const response = batch => ({shots:parts.slice((batch - 1) * 6,batch * 6).map((_,index)=>({index,
    displayLines:cards[((batch-1)*6+index)%3]==='typography/paper-title-card' ? [`观点${(batch - 1) * 6 + index + 1}`] : [`观点${(batch - 1) * 6 + index + 1}`,'现金证据'],elementPlan:'标题与证据层级',captionHighlights:['现金']}))});
  return {root,...run,plan,tts,response};
}

test('逐镜最多并行5批，乱序返回仍按原镜头合并，等待状态不被先完成请求清空',async t=>{
  const f = parallelFixture(t);
  const gates = new Map();
  let ready;
  const started = new Promise(resolve=>{ready=resolve;});
  let active = 0, peak = 0;
  const pending = executeAModeRun(f.root,f.runId,{tts:f.tts,director:async (_prompt,{phase,batch})=>{
    if(phase === 'global')return {shots:f.plan};
    active++; peak=Math.max(peak,active);
    try{return await new Promise(resolve=>{
      gates.set(batch,()=>resolve(f.response(batch)));
      if(gates.size === 5)ready();
    });}finally{active--;}
  }});
  await started;
  const status = ()=>JSON.parse(fs.readFileSync(path.join(f.dir,'status.json')));
  assert.deepEqual(status().activeBatches,[1,2,3,4,5]);
  assert.equal(status().activeRequestCount,5);
  for(const batch of [5,4,3,2,1])gates.get(batch)();
  await new Promise(setImmediate);
  assert.equal(peak,5);
  assert.equal(status().completedBatches,5);
  assert.deepEqual(status().activeBatches,[6,7]);
  assert.equal(status().activeRequestCount,2);
  assert.ok(status().requestStartedAt);
  gates.get(7)();gates.get(6)();
  const storyboard = await pending;
  assert.deepEqual(storyboard.shots.map(s=>s.displayLines[0]),Array.from({length:37},(_,i)=>`观点${i + 1}`));
  assert.equal(status().completedBatches,7);
  assert.equal(status().activeRequestCount,0);
  assert.equal(status().requestStartedAt,null);
  assert.equal(status().status,'review');
});

test('并行失败停止派发且等待在途批次保存，续跑只请求失败及未派发批次',async t=>{
  const f = parallelFixture(t);
  const gates = new Map();
  let ready;
  const started = new Promise(resolve=>{ready=resolve;});
  const pending = executeAModeRun(f.root,f.runId,{tts:f.tts,director:async (_prompt,{phase,batch})=>{
    if(phase === 'global')return {shots:f.plan};
    return new Promise((resolve,reject)=>{
      gates.set(batch,{resolve:()=>resolve(f.response(batch)),reject});
      if(gates.size === 5)ready();
    });
  }});
  const rejection = assert.rejects(pending,/batch 2 transport failed/);
  await started;
  gates.get(2).reject(new Error('batch 2 transport failed'));
  await new Promise(setImmediate);
  assert.equal(gates.size,5);
  assert.equal(readAModeRun(f.root,f.runId).status,'running');
  for(const batch of [5,4,3,1])gates.get(batch).resolve();
  await rejection;
  const failed = JSON.parse(fs.readFileSync(path.join(f.dir,'status.json')));
  assert.equal(failed.status,'error');
  assert.deepEqual(failed.failedBatches,[2]);
  assert.deepEqual(failed.activeBatches,[]);
  assert.equal(failed.completedBatches,4);
  assert.equal(fs.existsSync(path.join(f.dir,'storyboard.json')),false);
  assert.equal(fs.readdirSync(f.dir).filter(name=>/^shot-batch-\d+-[a-f0-9]+\.json$/.test(name)).length,4);
  const resumed = [];
  const storyboard = await executeAModeRun(f.root,f.runId,{resumeFromDirector:true,
    tts:async()=>{throw new Error('不得重跑配音');},director:async (_prompt,{phase,batch})=>{
      assert.equal(phase,'shot');resumed.push(batch);return f.response(batch);
    }});
  assert.deepEqual(resumed.sort((a,b)=>a-b),[2,6,7]);
  assert.equal(storyboard.shots.length,37);
  assert.deepEqual(storyboard.shots.map(s=>s.displayLines[0]),Array.from({length:37},(_,i)=>`观点${i + 1}`));
});
