import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {editorialCompletionCurrent,saveEditorialCompletion} from './talkcraft-editorial-completion.mjs';
import {talkcraftControlState,currentFailure} from './talkcraft-control-state.mjs';
import {talkcraftWorkflowProgress} from './talkcraft-progress.mjs';
import {selectTalkcraftContinuation} from './talkcraft-orchestration-policy.mjs';
import {automaticTalkcraftStage} from './talkcraft-auto-advance.mjs';

test('当前规划复检通过后允许已授权审核关闭修改要求，其他失败仍保持阻断',()=>{
  const run={provenance:{verified:true},nextStage:'approve-storyboard',storyboardAdjustmentPending:true,
    planningPassed:true,continuationPolicy:{enabled:true,stopAt:'review'}};
  assert.equal(selectTalkcraftContinuation(run,{intent:'continue'}),'approve-storyboard');
  assert.equal(automaticTalkcraftStage(run),'approve-storyboard');
  for(const patch of [{planningPassed:false},{continuationPolicy:{enabled:false}},{activeTask:{id:1}},
    {lastFailure:{code:'FAILED'}},{failureReport:{}},{factReview:{revisionPending:true}}]){
    assert.throws(()=>selectTalkcraftContinuation({...run,...patch},{intent:'continue'}),/等待编导/);
    assert.equal(automaticTalkcraftStage({...run,...patch}),null);
  }
  assert.equal(automaticTalkcraftStage({...run,nextStage:'approve-final',storyboardAdjustmentPending:false}),null);
  assert.equal(automaticTalkcraftStage({...run,nextStage:'deliver',storyboardAdjustmentPending:false}),null);
});

function fixture(t){
  const p=fs.mkdtempSync(path.join(os.tmpdir(),'editorial-completion-'));
  t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
  fs.mkdirSync(path.join(p,'qa'));fs.mkdirSync(path.join(p,'remotion'));
  for(const [name,text] of Object.entries({'SHOTBOOK.md':'partial','input.txt':'原稿','aligned-sentences.json':'[]','qa/ark-editorial-response.json':'{}'}))fs.writeFileSync(path.join(p,name),text);
  return p;
}
test('部分SHOTBOOK不能掩盖04失败，也不能让后端或节点图推进05',t=>{
  const p=fixture(t);assert.equal(editorialCompletionCurrent(p),false);
  const run={inputReady:true,wordTimingReady:true,semanticPassed:true,shotbook:true,editorialChecked:false,digitalHumanGenerationPlanned:true};
  const failure={code:'TASK_FAILED',task:{name:'talkcraft-editorial-recover'},cause:'字幕重点不合法'};
  assert.equal(currentFailure(run,failure),failure);
  assert.equal(talkcraftControlState(run,failure).nextStage,'editorial-check');
  assert.notEqual(talkcraftWorkflowProgress(run).nodes.find(n=>n.id==='editorial').status,'done');
});
test('只有成功检查后保存的当前输入凭证才算完成，修订响应会使其失效',t=>{
  const p=fixture(t);saveEditorialCompletion(p);assert.equal(editorialCompletionCurrent(p),true);
  fs.writeFileSync(path.join(p,'qa/ark-editorial-response.json'),'{"revised":true}');
  assert.equal(editorialCompletionCurrent(p),false);
});
test('旧版完整原生计划兼容，失效或部分计划仍需重验',t=>{
  const p=fixture(t),file=path.join(p,'qa/native-editorial-plan.json');
  const responseSha256=createHash('sha256').update('{}').digest('hex');
  fs.writeFileSync(file,JSON.stringify({structuralDraftReady:true,responseSha256}));
  assert.equal(editorialCompletionCurrent(p),false);
  for(const name of ['native-presentation.json','word-reveal-plan.json'])fs.writeFileSync(path.join(p,'remotion',name),'{}');
  assert.equal(editorialCompletionCurrent(p),true);
  fs.writeFileSync(file,JSON.stringify({structuralDraftReady:false,responseSha256}));
  assert.equal(editorialCompletionCurrent(p),false);
});
test('修订可以免费重验，绑定当前要求通过后只准备到人审，不越过人审渲染',t=>{
  const p=fixture(t),request=path.join(p,'qa/storyboard-adjustment-request.json');
  fs.writeFileSync(request,'第一版要求');saveEditorialCompletion(p);
  assert.equal(editorialCompletionCurrent(p),true);
  const base={provenance:{verified:true},storyboardAdjustmentPending:true,editorialChecked:true};
  assert.equal(selectTalkcraftContinuation({...base,editorialChecked:false,nextStage:'editorial-check'},{intent:'continue'}),'editorial-check');
  for(const nextStage of ['media-preflight','candidates','planning-check']){
    assert.equal(selectTalkcraftContinuation({...base,nextStage},{intent:'continue'}),nextStage);
    assert.equal(automaticTalkcraftStage({...base,nextStage}),nextStage);
    assert.throws(()=>selectTalkcraftContinuation({...base,nextStage,editorialChecked:false},{intent:'continue'}),/等待编导/);
  }
  for(const nextStage of ['preflight','scaffold','render-all']){
    assert.throws(()=>selectTalkcraftContinuation({...base,nextStage},{intent:'continue'}),/等待编导/);
    assert.equal(automaticTalkcraftStage({...base,nextStage}),null);
  }
  fs.writeFileSync(request,'新的调整要求');assert.equal(editorialCompletionCurrent(p),false);
});


test('新任务必须绑定当前校验源码，旧通过记录和旧计划不能跳过新规则',t=>{
 const p=fixture(t);fs.writeFileSync(path.join(p,'source-run.json'),JSON.stringify({pipeline:'video-talkcraft'}));
 saveEditorialCompletion(p);assert.equal(editorialCompletionCurrent(p),true);
 const file=path.join(p,'qa/editorial-completion.json'),record=JSON.parse(fs.readFileSync(file));
 assert.ok(record.validationRules['talkcraft-visual-content-contract.mjs']);
 record.validationRules['talkcraft-visual-content-contract.mjs']='older-source';
 fs.writeFileSync(file,JSON.stringify(record));assert.equal(editorialCompletionCurrent(p),false);
 delete record.validationRules;fs.writeFileSync(file,JSON.stringify(record));
 assert.equal(editorialCompletionCurrent(p),false);
 fs.unlinkSync(file);
 fs.writeFileSync(path.join(p,'qa/native-editorial-plan.json'),JSON.stringify({structuralDraftReady:true,responseSha256:createHash('sha256').update('{}').digest('hex')}));
 for(const name of ['native-presentation.json','word-reveal-plan.json'])fs.writeFileSync(path.join(p,'remotion',name),'{}');
 assert.equal(editorialCompletionCurrent(p),false);
});
