import {bindMachineVideo} from './talkcraft-acceptance-policy.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {approveTalkcraftFinal, approveTalkcraftSample, approveTalkcraftStoryboard, latestTalkcraftRun, prepareTalkcraftStoryboardRevision, readTalkcraftStatus, recordPreflightResult, recordSemanticPass, requestTalkcraftStoryboardAdjustment} from './talkcraft-status.mjs';
import {wordRevealSourceBinding} from './talkcraft-word-reveal.mjs';
import {recordReviewedCandidates} from './talkcraft-reviewed-templates.mjs';

const workspace = path.resolve(process.env.TALKCRAFT_TEST_TEMP_ROOT || 'tmp');
const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
test('全镜头实帧失败只绑定当前源码，修复代码后旧失败保留为待复验历史',t=>{
 mkdirSync(workspace,{recursive:true});const root=mkdtempSync(path.join(workspace,'runtime-state-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const project=path.join(root,'director/b-mode-runs',id,'talkcraft');
 mkdirSync(path.join(project,'remotion/src'),{recursive:true});mkdirSync(path.join(project,'qa'),{recursive:true});
 writeFileSync(path.join(project,'source-run.json'),JSON.stringify({runId:id}));
 writeFileSync(path.join(project,'remotion/src/Main.tsx'),'current');
 const r={schema:'talkcraft-word-runtime-v2',native:true,scope:null,passed:false,binding:wordRevealSourceBinding(project),
  failures:[{frame:30,issues:[{id:'s11-text-1',reason:'手机正文过小',mobilePx:4.5}]}]};
 writeFileSync(path.join(project,'qa/word-reveal-runtime.json'),JSON.stringify(r));
 let state=readTalkcraftStatus(root,id).wordRuntimeAudit;assert.equal(state.recorded,true);assert.equal(state.currentSource,true);
 assert.match(state.failedChecks[0],/s11.*4.50px/);
 writeFileSync(path.join(project,'remotion/src/Main.tsx'),'fixed');state=readTalkcraftStatus(root,id).wordRuntimeAudit;
 assert.equal(state.recorded,false);assert.equal(state.currentSource,false);assert.equal(state.requiresRecheck,true);
 assert.equal(state.passed,false,'旧凭据既不能阻塞新源码，也不能证明新源码已通过');
});

test('默认生产任务排除明确标记的集成测试，仍可按编号读取测试证据',()=>{
  mkdirSync(workspace,{recursive:true});
  const root=mkdtempSync(path.join(workspace,'talkcraft-latest-test-'));
  try{
    const real=path.join(root,'director/b-mode-runs',id,'talkcraft');
    const fixture=path.join(root,'director/b-mode-runs','11111111-1111-4111-8111-111111111111','talkcraft');
    mkdirSync(real,{recursive:true});mkdirSync(path.join(fixture,'qa'),{recursive:true});
    writeFileSync(path.join(real,'source-run.json'),'{}');
    writeFileSync(path.join(fixture,'source-run.json'),'{}');
    writeFileSync(path.join(fixture,'qa/integration-test.json'),JSON.stringify({excludeFromLatest:true}));
    assert.equal(latestTalkcraftRun(root),id);
    assert.equal(existsSync(path.join(fixture,'source-run.json')),true);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('重新编导归档旧结果时保留当前修改要求和成功音频，供下一次模型实际读取', () => {
  mkdirSync(workspace,{recursive:true});
  const root=mkdtempSync(path.join(workspace,'talkcraft-revision-request-test-'));
  try {
    const project=path.join(root,'director/b-mode-runs',id,'talkcraft');
    for (const dir of ['qa','audio','remotion'])mkdirSync(path.join(project,dir),{recursive:true});
    const oldSemantics=JSON.stringify({sentences:[{i:0,text:'原句',shot:'s01'}]});
    for (const [name,value] of Object.entries({'source-run.json':JSON.stringify({runId:id}),
      'SHOTBOOK.md':'原分镜','semantics.json':oldSemantics,'remotion/shots.json':'[{"id":"s01"}]',
      'qa/semantics-before-ark.json':'{"sentences":[{"i":0,"text":"原句"}]}',
      'qa/ark-editorial-response-before-repairs.json':'{"originalOldResponse":true}',
      'remotion/native-presentation.json':'{"oldPresentation":true}',
      'remotion/word-reveal-plan.json':'{"oldWordReveal":true}',
      'qa/ark-editorial-response.json':'{"old":true}','audio/full.mp3':'paid-audio-preserved'}))
      writeFileSync(path.join(project,name),value);
    writeFileSync(path.join(project,'qa/card-candidates.json'),JSON.stringify({s01:{candidates:{论点:[{slug:'per-character-rise'}]}}}));
    writeFileSync(path.join(project,'qa/card-candidates.md'),'# candidates');
    recordReviewedCandidates(project,{skillRoot:path.resolve('_audit/video-talkcraft')});    requestTalkcraftStoryboardAdjustment(root,id,'按原卡完整时长重新规划，不加速；保留原稿和配音。');
    const requestBytes=readFileSync(path.join(project,'qa/storyboard-adjustment-request.json'));
    const {revision}=prepareTalkcraftStoryboardRevision(root,id);
    assert.deepEqual(readFileSync(path.join(project,'qa/storyboard-adjustment-request.json')),requestBytes);
    assert.deepEqual(readFileSync(path.join(revision,'qa/storyboard-adjustment-request.json')),requestBytes);
    assert.equal(readFileSync(path.join(revision,'qa/ark-editorial-response.json'),'utf8'),'{"old":true}');
    assert.equal(existsSync(path.join(project,'qa/ark-editorial-response.json')),false);
    for(const name of ['qa/ark-editorial-response-before-repairs.json','remotion/native-presentation.json','remotion/word-reveal-plan.json']){
      assert.equal(existsSync(path.join(project,name)),false);
      assert.equal(existsSync(path.join(revision,name)),true);
    }
    assert.equal(readFileSync(path.join(project,'audio/full.mp3'),'utf8'),'paid-audio-preserved');
    assert.equal(readFileSync(path.join(project,'semantics.json'),'utf8'),'{"sentences":[{"i":0,"text":"原句"}]}');
  } finally {
    if(!root.startsWith(workspace+path.sep))throw Error('Test cleanup escaped workspace');
    rmSync(root,{recursive:true,force:true});
  }
});

test('preflight and sample approval are invalidated when their inputs change', () => {
  mkdirSync(workspace, {recursive:true});
  const root = mkdtempSync(path.join(workspace, 'talkcraft-status-test-'));
  try {
    const project = path.join(root, 'director', 'b-mode-runs', id, 'talkcraft');
    mkdirSync(path.join(project, 'audio'), {recursive:true});
    mkdirSync(path.join(project, 'remotion', 'out', 'preview'), {recursive:true});
    mkdirSync(path.join(project, 'qa'), {recursive:true});
    writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({runId:id, fps:30, totalFrames:300}));
    writeFileSync(path.join(project, 'semantics.json'), JSON.stringify({sentences:[
      {shot:'s01',weight:'main',sem:['钩子']}]}));
    writeFileSync(path.join(project, 'SHOTBOOK.md'), 'first plan');
    writeFileSync(path.join(project, 'remotion', 'shots.json'), JSON.stringify([{id:'s01',start:0,end:10,shotCard:'per-character-rise'}]));
    writeFileSync(path.join(project, 'audio', 'timestamps.json'), JSON.stringify({sentences:[{match:0.98}]}));
    writeFileSync(path.join(project, 'sources.md'), 'source');
    assert.equal(latestTalkcraftRun(root), id);
    assert.equal(readTalkcraftStatus(root, id).visualTextLocale, 'zh-CN');
    assert.equal(readTalkcraftStatus(root, id).candidatesReady, false);
    assert.equal(readTalkcraftStatus(root, id).semanticPassed, false);
    recordSemanticPass(root, id);
    assert.equal(readTalkcraftStatus(root, id).semanticPassed, true);
    assert.equal(readTalkcraftStatus(root, id).preflight, false);
    writeFileSync(path.join(project, 'qa', 'card-candidates.json'), JSON.stringify({s01:{candidates:{钩子:[{slug:'per-character-rise'}]}}}));
    assert.equal(readTalkcraftStatus(root, id).candidatesReady, false);
    writeFileSync(path.join(project, 'qa', 'card-candidates.md'), '# candidates');
    assert.equal(readTalkcraftStatus(root, id).candidatesReady, false,'候选文件存在但尚未绑定已审模板版本');
    recordReviewedCandidates(project,{skillRoot:path.resolve('_audit/video-talkcraft')});
    assert.equal(readTalkcraftStatus(root, id).candidatesReady, true);    recordPreflightResult(root, id, {passed:true});
    assert.equal(readTalkcraftStatus(root, id).preflight, true);
    recordPreflightResult(root, id, {passed:false,issues:['同一输入的素材复查失败']});
    assert.equal(readTalkcraftStatus(root, id).preflightCompleted, true);
    assert.equal(readTalkcraftStatus(root, id).preflight, false);
    assert.equal(readTalkcraftStatus(root, id).preflightPassed, false);
    assert.deepEqual(readTalkcraftStatus(root, id).preflightIssues, ['同一输入的素材复查失败']);
    // 历史通过文件保留作为证据，但不再覆盖失败；修复后才恢复通过。
    assert.equal(readFileSync(path.join(project, 'qa', 'preflight-passed.json'), 'utf8').includes('talkcraft-preflight-pass-v1'), true);
    recordPreflightResult(root, id, {passed:true});
    assert.equal(readTalkcraftStatus(root, id).preflightPassed, true);
    requestTalkcraftStoryboardAdjustment(root,id,'修正选卡并重新审核');
    const adjustmentFile=path.join(project,'qa/storyboard-adjustment-request.json');
    const originalRequest=readFileSync(adjustmentFile);
    assert.equal(readTalkcraftStatus(root,id).storyboardAdjustmentPending,true);
    approveTalkcraftStoryboard(root, id, 'test fixture');
    assert.equal(readTalkcraftStatus(root,id).storyboardAdjustmentPending,false);
    assert.deepEqual(readFileSync(adjustmentFile),originalRequest,'审批后保留修改要求原始证据');
    // 同输入的新要求也必须阻断；不能仅凭旧审批或时间戳忽略它。
    const changedRequest={...JSON.parse(originalRequest),request:'另有一项新的修改要求'};
    writeFileSync(adjustmentFile,JSON.stringify(changedRequest));
    assert.equal(readTalkcraftStatus(root,id).storyboardAdjustmentPending,true);
    approveTalkcraftStoryboard(root,id,'explicit approval of revised request');
    assert.equal(readTalkcraftStatus(root,id).storyboardAdjustmentPending,false);
    writeFileSync(path.join(project, 'remotion', 'out', 'preview', 's01.mp4'), 'sample-one');
    assert.equal(approveTalkcraftSample(root, id).approved, true);
    assert.equal(readTalkcraftStatus(root, id).sampleApproved, true);
    const finalFile = path.join(project, 'remotion', 'out', 'final.mp4');
    writeFileSync(finalFile, 'final-one');
    mkdirSync(path.join(project,'remotion/src'),{recursive:true});
    bindMachineVideo(project,finalFile);
    const finalSha256 = createHash('sha256').update(readFileSync(finalFile)).digest('hex');
    mkdirSync(path.join(project, 'qa'), {recursive:true});
    mkdirSync(path.join(project, 'review'), {recursive:true});
    writeFileSync(path.join(project, 'qa', 'passed.json'), JSON.stringify({finalSha256}));
    writeFileSync(path.join(project, 'review', 'approval.json'), JSON.stringify({finalSha256,
      reviewedShots:1, openP0:0, openP1:0}));
    assert.equal(readTalkcraftStatus(root,id).reviewPassed,false,'旧自动评审不能冒充人工通过');
    assert.throws(()=>approveTalkcraftFinal(root,id,{finalSha256:'wrong'}),/版本已变化/);
    approveTalkcraftFinal(root,id,{finalSha256});
    assert.equal(readTalkcraftStatus(root,id).reviewPassed,true);
    const deliveryFile = path.join(project, 'remotion', 'out', 'delivery.mp4');
    writeFileSync(deliveryFile, '');
    assert.equal(readTalkcraftStatus(root, id).delivery, false);
    writeFileSync(deliveryFile, 'delivery-one');
    assert.equal(readTalkcraftStatus(root, id).delivery, true);
    writeFileSync(path.join(project, 'SHOTBOOK.md'), 'changed plan');
    assert.equal(readTalkcraftStatus(root,id).storyboardAdjustmentPending,true,'分镜变更后旧审核不再关闭要求');
    assert.equal(readTalkcraftStatus(root, id).preflight, false);
    assert.equal(readTalkcraftStatus(root, id).sampleApproved, false);
    assert.throws(() => approveTalkcraftSample(root, id), /需先完成自动调节和分镜审核/);
    assert.equal(readFileSync(path.join(project, 'sample-approved.json'), 'utf8').includes('sampleSha256'), true);
  } finally {
    if (!root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(root, {recursive:true, force:true});
  }
});

test('all planned scenes must exist and be registered before full rendering is ready', () => {
  mkdirSync(workspace, {recursive:true});
  const root = mkdtempSync(path.join(workspace, 'talkcraft-scenes-test-'));
  try {
    const project = path.join(root, 'director', 'b-mode-runs', id, 'talkcraft');
    const scenes = path.join(project, 'remotion', 'src', 'scenes');
    mkdirSync(scenes, {recursive:true});
    writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({runId:id}));
    writeFileSync(path.join(project, 'remotion', 'shots.json'), JSON.stringify([{id:'s01'}, {id:'s02'}]));
    writeFileSync(path.join(scenes, 's01.tsx'), 'export const S01 = () => null;');
    writeFileSync(path.join(scenes, 'index.ts'), 'export const SCENES = {s01:S01};');
    assert.deepEqual(readTalkcraftStatus(root, id).scenesMissing, ['s02']);
    assert.equal(readTalkcraftStatus(root, id).scenesReady, false);
    writeFileSync(path.join(scenes, 's02.tsx'), 'export const S02 = () => null;');
    assert.equal(readTalkcraftStatus(root, id).scenesReady, false);
    writeFileSync(path.join(scenes, 'index.ts'), 'export const SCENES = {s01:S01, s02:S02};');
    assert.equal(readTalkcraftStatus(root, id).scenesReady, true);
  } finally {
    if (!root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(root, {recursive:true, force:true});
  }
});
