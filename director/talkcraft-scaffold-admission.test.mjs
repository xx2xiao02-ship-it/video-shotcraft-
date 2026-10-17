import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {installTalkcraftCardRuntime,skinTalkcraftSharedFont} from './talkcraft-card-runtime.mjs';
import {assertTalkcraftRuntimeFidelity} from './talkcraft-runtime-fidelity.mjs';
import {recordScaffoldResult,readScaffoldReady} from './talkcraft-scaffold-state.mjs';
import {talkcraftControlState,currentFailure} from './talkcraft-control-state.mjs';
import {talkcraftWorkflowProgress} from './talkcraft-progress.mjs';
import {installWordRevealRuntime} from './talkcraft-word-reveal.mjs';
const temporary=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'talkcraft-scaffold-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};

test('实际原卡字体蒙皮通过保真核验，额外运动修改仍被拒绝',t=>{
  const project=temporary(t),skillRoot=path.resolve('_audit/video-talkcraft'),src=path.join(project,'remotion/src');
  fs.mkdirSync(src,{recursive:true});
  fs.cpSync(path.join(skillRoot,'template/cards'),path.join(src,'cards'),{recursive:true});
  fs.writeFileSync(path.join(src,'cards/index.ts'),'export const CARD_REGISTRY = {};\n');
  installTalkcraftCardRuntime(skillRoot,src);
  const options={skillRoot,cardIds:['keyword-pop-highlight']};
  const result=assertTalkcraftRuntimeFidelity(project,options);
  assert.equal(result.sourceIntegrityPassed,true);
  assert.ok(result.cards[0].files.some(f=>f.transform==='shared_font_skin_v1'));
  const file=path.join(src,'parameterized-cards/shared.tsx'),good=fs.readFileSync(file,'utf8');
  fs.writeFileSync(file,good.replace('Math.pow(1 - x, 3)','Math.pow(1 - x, 4)'));
  assert.throws(()=>assertTalkcraftRuntimeFidelity(project,options),/被改写/);
  fs.copyFileSync(path.join(skillRoot,'workbench/src/cards/shared.tsx'),file);
  assert.equal(assertTalkcraftRuntimeFidelity(project,options).sourceIntegrityPassed,true);
});

test('字体声明缺失或重复时不允许应用适配',()=>{
  assert.throws(()=>skinTalkcraftSharedFont('export const other=1;'),/字体声明/);
  assert.throws(()=>skinTalkcraftSharedFont('export const FONT_STACK="a";export const FONT_STACK="b";'),/字体声明/);
});

test('工程完成凭据绑定输入与样板产物，不要求提前实现其余镜头',t=>{
  const project=temporary(t);
  const names=['source-run.json','semantics.json','SHOTBOOK.md','remotion/shots.json',
    'aligned-sentences.json','audio/timestamps.json','qa/storyboard-approved.json','qa/preflight-result.json',
    'remotion/src/index.ts','remotion/src/Root.tsx','remotion/src/Main.tsx',
    'remotion/src/scenes/s01.tsx','remotion/src/scenes/scene-shared.tsx',
    'remotion/src/cards/index.ts','remotion/src/parameterized-cards/shared.tsx'];
  for(const name of names){const file=path.join(project,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,name);}
  fs.writeFileSync(path.join(project,'remotion/src/Main.tsx'),
    'export const Main: React.FC<{}> = ({}) => <AbsoluteFill style={{}}><Overlays /><Subtitles /></AbsoluteFill>;');
  fs.writeFileSync(path.join(project,'remotion/src/scenes/scene-shared.tsx'),
    'const card=renderTalkcraftTemplate(); export const TemplateScene=()=> <div>{card}</div>;');
  installWordRevealRuntime(project);
  assert.equal(readScaffoldReady(project),false);
  assert.throws(()=>recordScaffoldResult(project,{sourceIntegrityPassed:false}),/保真/);
  recordScaffoldResult(project,{sourceIntegrityPassed:true});assert.equal(readScaffoldReady(project),true);
  // Sample-stage installation must not make a validated scaffold look undone.
  installWordRevealRuntime(project);assert.equal(readScaffoldReady(project),true);
  fs.writeFileSync(path.join(project,'qa/preflight-result.json'),'rechecked same inputs');
  assert.equal(readScaffoldReady(project),true);
  fs.writeFileSync(path.join(project,'remotion/src/scenes/s02.tsx'),'after sample approval');
  assert.equal(readScaffoldReady(project),true);
  fs.writeFileSync(path.join(project,'remotion/src/scenes/s01.tsx'),'changed sample');
  assert.equal(readScaffoldReady(project),false);
  fs.writeFileSync(path.join(project,'remotion/src/scenes/s01.tsx'),'remotion/src/scenes/s01.tsx');
  assert.equal(readScaffoldReady(project),true);
  fs.writeFileSync(path.join(project,'SHOTBOOK.md'),'changed plan');assert.equal(readScaffoldReady(project),false);
});

test('工程目录残留不能隐藏scaffold失败或越过节点，样板工程成功后才进入sample',()=>{
  const run={inputReady:true,wordTimingReady:true,shotbook:true,semanticPassed:true,candidatesReady:true,
    planningPassed:true,preflightPassed:true,storyboardApproved:true,digitalHuman:{required:false},
    workbenchReady:true,scaffoldReady:false,scenesReady:false};
  const failure={task:{name:'talkcraft-scaffold'},cause:'源码核验未通过'};
  assert.equal(currentFailure(run,failure),failure);
  assert.equal(talkcraftControlState(run,failure).nextStage,'scaffold');
  const ready={...run,scaffoldReady:true};
  assert.equal(currentFailure(ready,failure),null);assert.equal(talkcraftControlState(ready,failure).nextStage,'sample');
  assert.equal(talkcraftWorkflowProgress(ready).nodes.find(n=>n.id==='scaffold').status,'done');
});
