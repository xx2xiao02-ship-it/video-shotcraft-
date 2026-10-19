import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {compileWordReveals} from './talkcraft-word-reveal.mjs';
import {checkNativeGovernance} from './talkcraft-native-governance.mjs';
import {checkTextEffectDependencies} from './talkcraft-text-effect-dependencies.mjs';
import {proposeDependencyTimeline} from './talkcraft-dependency-timeline.mjs';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files=['source-run.json','input.txt','audio/full.mp3','remotion/shots.json','remotion/native-presentation.json','remotion/word-reveal-plan.json','remotion/src/timing.json'];
const snapshot=project=>{
 const result=Object.fromEntries(files.map(f=>[f,sha(path.join(project,f))]));
 for(const file of ['talkcraft-timing-completion.mjs','talkcraft-dependency-timeline.mjs','talkcraft-text-effect-dependencies.mjs','talkcraft-text-effect-sources.json'])result[file]=sha(new URL(file,import.meta.url));
 return result;
};
const save=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(file+'.tmp',file);};

// Pure proposal: preserve every word, frame boundary, card, parameter and source.
// Only an already declared hold can absorb spare frames; impossible schedules
// stay unresolved rather than being shortened, sped up or creatively rewritten.
export function proposeTimingRows(shots,presentation,reveals){
 const report=checkTextEffectDependencies(shots,presentation,reveals),operations=[],unresolved=[];
 for(const shotId of [...new Set(report.issues.map(i=>i.shotId))]){
  const shot=shots.find(s=>s.id===shotId),row=presentation.shots.find(r=>r.shotId===shotId);
  if(shots.indexOf(shot)<3){unresolved.push({shotId,reason:'前三镜锁定'});continue;}
  const hold=row?.timeline.find(t=>t.kind==='hold');
  try{
   const next=proposeDependencyTimeline(shot,row,reveals,{holdAt:hold?.nativeFromFrame,reason:hold?.reason});
   if(digest(row.timeline)!==digest(next.timeline))operations.push({shotId,before:digest(row),after:next});
   else unresolved.push({shotId,reason:'原计划无可应用变化'});
  }catch(error){unresolved.push({shotId,reason:error.message});}
 }
 return {operations,unresolved};
}
export function timingCompletionPlan(project){
 const inputs=snapshot(project);
 const shots=read(path.join(project,'remotion/shots.json')),presentation=read(path.join(project,'remotion/native-presentation.json'));
 const reveals=compileWordReveals(project,{write:false});
 const plan={schema:'talkcraft-timing-completion-plan-v1',inputs,...proposeTimingRows(shots,presentation,reveals),paidCalls:0,productionAdmitted:false};
 return {...plan,planId:digest(plan)};
}
export function executeApprovedTimingCompletion(project){
 const record=read(path.join(project,'qa/correction-center.json')),proposal=record.proposal,plan=record.timingCompletionPlan;
 if(!record.approved||record.action!=='timing-completion'||!proposal||record.approval?.planSha256!==digest(proposal)||
  digest(plan)!==digest(proposal.timingCompletionPlan)||
  record.governance?.caseSha256!==digest(read(path.join(project,'qa/governance-case.json')))||
  record.governance?.mapSha256!==digest(read(path.join(project,'qa/governance-template-map.json')))||
  read(path.join(project,'source-run.json')).runId!==record.runId)throw Error('时序补全缺少当前输入、任务及中心审批，不执行');
 const resultFile=path.join(project,'qa/timing-completion.json');
 if(fs.existsSync(resultFile)){
  const prior=read(resultFile);
  if(prior.planId===plan.planId&&digest(prior.afterInputs)===digest(snapshot(project))){
   const native=checkNativeGovernance(project);if(!native.passed)throw Error('恢复后的时序计划未通过原门禁');
   return {...prior,reused:true};
  }
 }
 if(digest(plan)!==digest(timingCompletionPlan(project)))throw Error('时序补全输入已变化，不应用旧方案');
 if(!plan.operations.length)throw Error('无免费可行时序修正，不修改业务数据');
 const file=path.join(project,'remotion/native-presentation.json'),original=fs.readFileSync(file),next=JSON.parse(original);
 for(const op of plan.operations){const index=next.shots.findIndex(r=>r.shotId===op.shotId);
  if(index<0||digest(next.shots[index])!==op.before)throw Error('时序方案已过期');next.shots[index]=op.after;}
 save(path.join(project,'qa/timing-completion-history',plan.planId+'.json'),{plan,original:JSON.parse(original),approval:record.approval});
 try{
  save(file,next);
  const native=checkNativeGovernance(project);if(!native.passed)throw Error(native.issues.map(i=>i.message).join('；'));
  const report=checkTextEffectDependencies(read(path.join(project,'remotion/shots.json')),next,compileWordReveals(project,{write:false}));
  if(report.issues.some(i=>plan.operations.some(o=>o.shotId===i.shotId)))throw Error('修正镜头未通过原时序复检');
  const result={schema:'talkcraft-timing-completion-v1',planId:plan.planId,applied:plan.operations.map(o=>o.shotId),unresolved:plan.unresolved,afterInputs:snapshot(project),paidCalls:0,productionAdmitted:false};
  save(resultFile,result);return result;
 }catch(error){fs.writeFileSync(file,original);throw error;}
}
