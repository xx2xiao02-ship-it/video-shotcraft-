import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {completeTalkcraftPreflightNode} from './talkcraft-node-completion.mjs';
import {talkcraftWorkflowProgress} from './talkcraft-progress.mjs';
function fixture(t){const project=fs.mkdtempSync(path.join(os.tmpdir(),'node-completion-'));t.after(()=>fs.rmSync(project,{recursive:true,force:true}));fs.mkdirSync(path.join(project,'qa'));
 return {project,runId:'current',read:()=>({planningPassed:true,storyboardApproved:true,digitalHumanGenerationPlanned:true,digitalHuman:{ready:true},candidatesReady:true,mediaPreflightPassed:true,parallelPreparation:{status:'done'}})};}
test('09在当前节点完成绑定并按依赖复检，不重跑04或调用付费服务',async t=>{
 const f=fixture(t),steps=[];let state=f.read();
 const result=await completeTalkcraftPreflightNode({...f,read:()=>state,complete:()=>{steps.push('bind');state={...state,candidatesReady:false,planningPassed:false,storyboardApproved:false,mediaPreflightPassed:false,parallelPreparation:{status:'stale'}};return {passed:true};},
  stage:s=>{steps.push(s);if(s==='candidates')state.candidatesReady=true;if(s==='planning-check')state.planningPassed=true;if(s==='host-preflight')state.mediaPreflightPassed=true;return {passed:true};},
  approve:()=>{steps.push('delegated-review');state.storyboardApproved=true;},prepare:()=>{steps.push('prepare');state.parallelPreparation={status:'done'};}});
 assert.equal(result.passed,true);assert.deepEqual(steps,['bind','candidates','planning-check','delegated-review','host-preflight','prepare','preflight']);
});
test('09内部中断后同输入可继续；严格全量失败保留且不伪造通过',async t=>{
 const f=fixture(t);let state=f.read(),first=true;
 const operation={...f,read:()=>state,complete:()=>{state={...state,planningPassed:false};if(first){first=false;throw Error('interrupted');}return {passed:true};},
 stage:s=>{if(s==='planning-check')state.planningPassed=true;return {passed:s!=='preflight'};},approve:()=>{},prepare:()=>{}};
 await assert.rejects(()=>completeTalkcraftPreflightNode(operation),/interrupted/);
 await assert.rejects(()=>completeTalkcraftPreflightNode(operation),/原版全量预检未通过/);
 const report=JSON.parse(fs.readFileSync(path.join(f.project,'qa/preflight-node-completion.json')));assert.equal(report.status,'blocked');assert.equal(report.paidCalls,0);
});
test('09内部复检保留当前节点，失效的前置检查仍显示需重验而不是伪造通过',()=>{
 const result=talkcraftWorkflowProgress({digitalHumanGenerationPlanned:true,activeTask:{name:'talkcraft-preflight',status:'running'},nodeCompletion:{node:'preflight',status:'running'}});
 assert.equal(result.currentNode,'preflight');assert.equal(result.completed,0);assert.equal(result.outOfOrderActivity,null);
});
