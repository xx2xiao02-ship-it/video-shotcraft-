import {test} from 'node:test';
import assert from 'node:assert/strict';
import {talkcraftControlState,currentFailure} from './talkcraft-control-state.mjs';
import {selectTalkcraftContinuation} from './talkcraft-orchestration-policy.mjs';

test('07显示已核验事务的最新补全问题，旧规划报告不能覆盖成功修复后的范围',()=>{
  const run={inputReady:true,wordTimingReady:true,semanticPassed:true,shotbook:true,editorialChecked:true,candidatesReady:true,
    planningPassed:false,planningIssues:['s03旧问题'],nodeRepair:{node:'storyboard-review',status:'blocked',
      failedChecks:[{shotId:'s05',code:'SELECTION_DEVIATION_REQUIRED',message:'当前理由漏填'}]}};
  const state=talkcraftControlState(run,null);
  assert.equal(state.nextStage,'planning-check');assert.match(state.waitingFor,/07内部补全/);
  assert.deepEqual(state.blockers,['s05：[SELECTION_DEVIATION_REQUIRED] 当前理由漏填']);
  assert.deepEqual(talkcraftControlState({...run,nodeRepair:{...run.nodeRepair,status:'running'}},null).blockers,['s03旧问题']);
});

test('已有逐句标注先执行03真实校验，不被04历史模型失败跳过',()=>{
  const failure={code:'LOCAL_EXECUTION_FAILED',task:{name:'talkcraft-editorial'}};
  const input={inputReady:true,wordTimingReady:true,semanticReady:true,semanticPassed:false,
    shotbook:false,editorialSubmission:{requiresAuthorization:true}};
  const state=talkcraftControlState(input,failure);
  assert.equal(state.nextStage,'semantic-check');
  assert.equal(state.lastFailure.task.name,'talkcraft-editorial');
  assert.equal(selectTalkcraftContinuation({...state,storyboardAdjustmentPending:true,provenance:{verified:true}},{intent:'continue'}),'semantic-check');
  const after=talkcraftControlState({...input,semanticPassed:true},failure);
  assert.equal(after.nextStage,null);
  assert.deepEqual(after.blockers,['EDITORIAL_AUTHORIZATION_USED']);
  assert.deepEqual(talkcraftControlState({...input,semanticPassed:true},null).blockers,['EDITORIAL_AUTHORIZATION_USED']);
});

test('03校验失败不能自动重试；未备齐标注不能冒充03可执行',()=>{
  const failure={code:'LOCAL_EXECUTION_FAILED',task:{name:'talkcraft-semantic-check'}};
  const input={inputReady:true,wordTimingReady:true,semanticReady:true,semanticPassed:false,
    shotbook:false,editorialSubmission:{requiresAuthorization:true}};
  assert.notEqual(talkcraftControlState(input,failure).nextStage,'semantic-check');
  assert.notEqual(talkcraftControlState({...input,semanticReady:false},failure).nextStage,'semantic-check');
});
test('已保存但尚未落地的分镜先走免费恢复，不要求再次模型授权',()=>{
  const s=talkcraftControlState({inputReady:true,wordTimingReady:true,shotbook:false,editorialResponseSaved:true,
    editorialSubmission:{requiresAuthorization:true}},null);
  assert.equal(s.nextStage,'editorial-recover');
  assert.match(s.waitingFor,/不调用模型/);
});
const run={inputReady:true,wordTimingReady:true,shotbook:true,semanticPassed:true,candidatesReady:true,
  planningPassed:true,preflightPassed:true,storyboardApproved:true,workbenchReady:true};

test('视觉报告不再阻断，但代码和渲染失败仍然阻断',()=>{
 const report={code:'TEXT_CONTRAST_GATE',task:{name:'talkcraft-render-all'}};
 const r={...run,sample:true,sampleApproved:true,wordRuntimeAudit:{recorded:true,currentSource:true,passed:false}};
 assert.equal(currentFailure(r,report),null);assert.equal(talkcraftControlState(r,report).nextStage,'render-all');
 for(const code of ['NATIVE_TEXT_WINDOW_MISMATCH','PROCESS_LAUNCH_BLOCKED']){const f={...report,code};assert.equal(currentFailure(r,f),f);}
});

test('新重试运行时显示执行中，保留历史报告；其他阶段失败不能被隐藏',()=>{
  const report={code:'TASK_FAILED',task:{id:89,name:'talkcraft-render-all'}};
  const activeTask={id:90,name:'talkcraft-render-all',status:'running'};
  assert.equal(currentFailure({...run,activeTask},report),null);
  const state=talkcraftControlState({...run,activeTask},report);
  assert.equal(state.nextStage,null);assert.equal(state.waitingFor,'整片渲染中');
  assert.equal(currentFailure({...run,activeTask:{...activeTask,name:'talkcraft-qa'}},report),report);
  assert.equal(currentFailure({...run,activeTask:{...activeTask,status:'error'}},report),report);
  assert.equal(currentFailure({...run,activeTask:{...activeTask,id:88}},report),report);
  assert.equal(currentFailure({...run,activeTask},{...report,task:{name:activeTask.name}}),null);
});
test('recovered launch environment offers the current executable stage with history retained',()=>{
  const failure={code:'PROCESS_LAUNCH_BLOCKED',task:{name:'talkcraft-editorial'}};
  const s=talkcraftControlState({...run,shotbook:false},failure,{ok:true});
  assert.equal(s.nextStage,'editorial'); assert.equal(s.lastFailure.code,failure.code);
});
test('completed stage artifacts suppress obsolete failures',()=>{
  assert.equal(currentFailure(run,{task:{name:'talkcraft-editorial'}}),null);
});

test('后续节点旧失败在前置节点重新成为当前节点时只保留为历史记录',()=>{
  const revised={inputReady:true,wordTimingReady:true,semanticPassed:true,shotbook:true,
    mediaPreparationPassed:true,candidatesReady:true,planningPassed:true,storyboardApproved:false,
    digitalHumanGenerationPlanned:true,digitalHuman:{required:true,ready:true},mediaPreflightPassed:false,
    preflightPassed:false,scaffoldReady:false,sample:false,sampleApproved:false,final:false,
    qaPassed:false,reviewPassed:false,delivery:false};
  const report={code:'TASK_FAILED',cause:'旧机器质检失败',task:{id:122,name:'talkcraft-qa'}};
  assert.equal(currentFailure(revised,report),null);
  const state=talkcraftControlState(revised,report);
  assert.equal(state.nextStage,'approve-storyboard');
  assert.equal(state.lastFailure,null);
});

test('原③素材体检失败不允许继续分镜；真实体检通过后才能解除该失败',()=>{
  const failure={code:'LOCAL_EXECUTION_FAILED',cause:'缺少本次口型视频',task:{name:'talkcraft-media-preflight'}};
  const blocked=talkcraftControlState({...run,shotbook:false,mediaPreflightPassed:false},failure);
  assert.equal(blocked.nextStage,null);assert.deepEqual(blocked.blockers,['MEDIA_PREFLIGHT_FAILED']);
  assert.match(blocked.waitingFor,/素材输入/);
  assert.equal(currentFailure({...run,mediaPreflightPassed:true},failure),null);
  assert.equal(talkcraftControlState({...run,shotbook:false,mediaPreflightPassed:true},failure).nextStage,'editorial');
});

test('RunningHub 输入准备通过后，缺未来口型视频不能阻断分镜；生成仍需分镜和审批',()=>{
  const failure={code:'LOCAL_EXECUTION_FAILED',cause:'旧检查错误要求未来 host.webm',task:{name:'talkcraft-media-preflight'}};
  const prepared={...run,shotbook:false,digitalHumanGenerationPlanned:true,mediaPreparationPassed:true,
    mediaPreflightPassed:false,digitalHuman:{required:true,ready:false,mode:'segments'}};
  assert.equal(currentFailure(prepared,failure),null);
  assert.equal(talkcraftControlState(prepared,failure).nextStage,'editorial');
  assert.equal(talkcraftControlState({...prepared,shotbook:true,planningPassed:false,storyboardApproved:false}).nextStage,'planning-check');
  assert.equal(talkcraftControlState({...prepared,shotbook:true,planningPassed:true,storyboardApproved:false}).nextStage,'approve-storyboard');
  assert.equal(talkcraftControlState({...prepared,shotbook:true,planningPassed:true}).nextStage,'digital-human');
});
test('preflight completion alone never permits storyboard approval',()=>{
  assert.equal(talkcraftControlState({...run,preflightCompleted:true,preflightPassed:false}).nextStage,'preflight');
});
test('a run always reaches sample before full render',()=>{
  assert.equal(talkcraftControlState(run).nextStage,'sample');
  assert.equal(talkcraftControlState({...run,sample:true}).nextStage,'approve-sample');
  assert.equal(talkcraftControlState({...run,sample:true,sampleApproved:true}).nextStage,'render-all');
});
test('semantic recovery uses the supported editorial-check endpoint',()=>{
  assert.equal(talkcraftControlState({...run,semanticPassed:false}).nextStage,'editorial-check');
});
test('sentence timing cannot qualify as word timing',()=>{
  assert.equal(talkcraftControlState({...run,wordTimingReady:false}).nextStage,'word-timing');
});
test('机器规则通过后仍需人工视觉确认',()=>{
  assert.equal(talkcraftControlState({...run,sample:true,sampleApproved:true,final:true,qaPassed:true}).nextStage,'approve-final');
});

test('全量预检通过后并行准备指纹变化不再倒退阻断人工审片',()=>{
  const stale={status:'stale',error:'输入或上游源码已变化'};
  const state=talkcraftControlState({...run,parallelPreparation:stale,sample:true,sampleApproved:true,final:true,qaPassed:true});
  assert.equal(state.nextStage,'approve-final');
  assert.deepEqual(state.blockers,['HUMAN_VISUAL_REVIEW_REQUIRED']);
  assert.equal(talkcraftControlState({...run,preflightPassed:false,parallelPreparation:stale}).nextStage,null);
});

test('视觉历史失败不能代替代码预检或样片审批',()=>{
 const r={...run,sample:true,sampleApproved:true,wordRuntimeAudit:{recorded:true,passed:false}};
 assert.equal(talkcraftControlState(r).nextStage,'render-all');
 assert.equal(talkcraftControlState({...r,preflightPassed:false}).nextStage,'preflight');
 assert.equal(talkcraftControlState({...r,sampleApproved:false}).nextStage,'approve-sample');
});

test('输入识别失败优先复用配音恢复，不要求重新 TTS 或先补不存在的语义骨架',()=>{
 const state=talkcraftControlState({...run,inputReady:false,shotbook:false,canRecoverAlignment:true});assert.equal(state.nextStage,'recover-alignment');
 assert.equal(talkcraftControlState({...run,factReview:{revisionPending:true}}).nextStage,'fact-revision');
});

test('已恢复的失败句不再显示历史失败；依赖修好后可手动重检',()=>{
 const failure={code:'CHINESE_ALIGNMENT_DEPENDENCY',task:{name:'talkcraft-recover-alignment'}};
 assert.equal(currentFailure(run,failure),null);
 const state=talkcraftControlState({...run,inputReady:false,wordTimingReady:false},failure);
 assert.equal(state.nextStage,'recover-alignment');assert.equal(state.blockers[0],failure.code);
});
