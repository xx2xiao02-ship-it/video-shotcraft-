import test from 'node:test';
import assert from 'node:assert/strict';
import {talkcraftBlocker} from './talkcraft-blocker.mjs';
const fixture=()=>{
 const issues=[{shotId:'s16',previousShotId:'s12',code:'template_window_reuse',message:'当前真实冲突'}];
 return {runId:'current',editorialChecked:false,nextStage:null,lastFailure:{code:'TASK_FAILED',cause:'通用失败',task:{name:'talkcraft-editorial-check'}},
  blockers:issues.map(i=>`${i.shotId}：[${i.code}] ${i.message}`),
  correctionCenter:{runId:'current',node:'editorial',state:'needs-repair',reason:'当前联合方案待补全',issues}};
};
test('面板展示当前控制状态已核对的中心问题，不被通用任务失败覆盖',()=>{
 const run=fixture(),result=talkcraftBlocker(run);
 assert.equal(result.reason,'当前联合方案待补全');assert.deepEqual(result.failedChecks,run.blockers);
 assert.ok(result.failedChecks.every(c=>typeof c==='string'&&c.includes('template_window_reuse')));
 assert.match(result.preservation,/已执行免费恢复与复检/);
 assert.equal(result.recoveryAction,null);
});
test('其它任务、过期清单、已通过节点和执行中不能套用中心旧问题',()=>{
 for(const mutate of [r=>r.correctionCenter.runId='old',r=>r.blockers=['不同问题'],r=>r.editorialChecked=true]){
  const run=fixture();mutate(run);const result=talkcraftBlocker(run);assert.equal(result.reason,'通用失败');assert.deepEqual(result.failedChecks,[]);
 }
 const running=fixture();running.activeTask={status:'running'};assert.equal(talkcraftBlocker(running),null);
});


test('06已执行素材补全后不再误报尚未执行；跨任务中心记录不套用',()=>{
 const run={runId:'current',nextStage:'candidates',lastFailure:{cause:'具体素材缺项',task:{name:'talkcraft-candidates'}},
  correctionCenter:{runId:'current',node:'candidates',state:'needs-source-verification',reason:'仍缺真实素材',fingerprint:'now',
   materialCompletionPlan:{needs:[{shotId:'s12',field:'@background'}]},attempts:[{fingerprint:'now',action:'material-completion',status:'queued'}]}};
 const result=talkcraftBlocker(run);assert.equal(result.reason,'仍缺真实素材');assert.match(result.preservation,/已执行免费恢复与复检/);
 run.correctionCenter.runId='old';assert.equal(talkcraftBlocker(run).reason,'具体素材缺项');
});
