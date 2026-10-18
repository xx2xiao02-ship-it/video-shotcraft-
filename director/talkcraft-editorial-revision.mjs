import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {talkcraftProject,prepareTalkcraftStoryboardRevision} from './talkcraft-status.mjs';
import {currentEditorialRepairFeedback,currentRejectedEditorialFeedback,editorialRepairScopeSha256} from './talkcraft-editorial-planning-contract.mjs';
import {runTalkcraftStage} from './talkcraft-stages.mjs';
import {generateEditorial,checkEditorial,recoverProviderEditorial} from './talkcraft-ark-editorial.mjs';
import {trackTalkcraftExecution} from './talkcraft-execution.mjs';
import {executeNodeRepair} from './talkcraft-node-repair.mjs';

const read=f=>JSON.parse(fs.readFileSync(f));
const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const names=['input.txt','aligned-sentences.json','audio/full.mp3','semantics.json',
  'SHOTBOOK.md','remotion/shots.json','qa/ark-editorial-response.json',
  'qa/storyboard-adjustment-request.json','qa/editorial-single-submission.json','qa/semantics-before-ark.json',
  'material-research-plan.json','material-binding-plan.json','qa/editorial-repair-feedback.json',
  'qa/candidate-editorial-revision-feedback.json','qa/rebuild-inputs.json'];
const inputs=project=>Object.fromEntries(names.map(n=>[n,fs.existsSync(path.join(project,n))?sha(path.join(project,n)):null]));
const authFile=p=>path.join(p,'qa/editorial-revision-authorization.json');

export function recoverUnsubmittedEditorialRevision(root,runId){
  const project=talkcraftProject(root,runId),file=authFile(project),record=read(file);
  if(record.schema!=='talkcraft-editorial-revision-authorization-v1'||record.runId!==runId||record.maxTasks!==1||!record.startedAt||record.completedAt)
    throw Error('没有可恢复的本次未提交修订授权');
  if(record.recoveredInputs){
    if(JSON.stringify(record.recoveredInputs)!==JSON.stringify(inputs(project)))throw Error('恢复后输入变化，不能重复继续');
    return record;
  }
  const feedback=currentEditorialRepairFeedback(project,{candidateSnapshotOnly:true});
  if(!feedback?.snapshot||editorialRepairScopeSha256(feedback)!==record.repairScopeSha256)
    throw Error('当前节点快照与本次授权范围不一致');
  const snapshot=path.resolve(project,feedback.snapshot),base=path.join(project,'qa/storyboard-revisions'),rel=path.relative(base,snapshot);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('恢复快照不属于本次任务');
  // The old submission is unchanged: failure happened before reservation. An
  // unknown or already submitted new request must never be re-authorized here.
  for(const n of ['input.txt','aligned-sentences.json','audio/full.mp3','qa/editorial-single-submission.json','qa/storyboard-adjustment-request.json'])
    if(!fs.existsSync(path.join(project,n))||sha(path.join(project,n))!==record.inputs[n])throw Error('原始输入或供应商提交记录变化，禁止恢复付费授权：'+n);
  const entries=[];
  for(const n of names){
    if(!record.inputs[n]||n==='qa/candidate-editorial-revision-feedback.json')continue;
    const live=path.join(project,n),saved=path.join(snapshot,n);
    if(fs.existsSync(live)&&sha(live)===record.inputs[n])continue;
    const seed=n==='semantics.json'&&fs.existsSync(live)&&sha(live)===record.inputs['qa/semantics-before-ark.json'];
    if(fs.existsSync(live)&&!seed)throw Error('当前输入与原修订基稿不一致，拒绝覆盖：'+n);
    if(!fs.existsSync(saved)||sha(saved)!==record.inputs[n])throw Error('原修订基稿不能完整恢复：'+n);
    entries.push(n);
  }
  for(const n of ['remotion/native-presentation.json','remotion/word-reveal-plan.json','qa/card-candidates.json','qa/card-candidates.md','qa/semantic-passed.json']){
    const saved=path.join(snapshot,n),live=path.join(project,n);
    if(fs.existsSync(saved)&&!fs.existsSync(live))entries.push(n);
  }
  const lock=path.join(project,'editorial-revision.lock'),fd=fs.openSync(lock,'wx');
  try{
    if(sha(path.join(project,'qa/editorial-single-submission.json'))!==record.inputs['qa/editorial-single-submission.json'])throw Error('提交记录变化');
    for(const n of entries){fs.mkdirSync(path.dirname(path.join(project,n)),{recursive:true});fs.copyFileSync(path.join(snapshot,n),path.join(project,n));}
    const current=currentEditorialRepairFeedback(project);
    if(editorialRepairScopeSha256(current)!==record.repairScopeSha256)throw Error('恢复后的节点范围不一致，未调用模型');
    const recovered={...record,recoveredAt:new Date().toISOString(),recoveredInputs:inputs(project),recoveredSnapshot:feedback.snapshot,
      node:feedback.stage==='preflight'?'preflight':'storyboard-review',providerSubmitted:false};
    fs.writeFileSync(file,JSON.stringify(recovered,null,2));return recovered;
  }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}

export function authorizeEditorialRevision(root,runId,{approval}={}){
  const project=talkcraftProject(root,runId);
  if(typeof approval!=='string'||approval.trim().length<4)throw Error('缺少本次分镜修订费用授权');
  const rejected=!!currentRejectedEditorialFeedback(project);
  for(const f of ['qa/storyboard-adjustment-request.json','qa/semantics-before-ark.json',
    'qa/ark-editorial-response.json',...(rejected?[]:['SHOTBOOK.md','remotion/shots.json'])])
    if(!fs.existsSync(path.join(project,f)))throw Error('正式修订输入缺失：'+f);
  const request=read(path.join(project,'qa/storyboard-adjustment-request.json'));
  if(!request.request||!request.inputs||Object.entries(request.inputs).some(([n,h])=>
    !fs.existsSync(path.join(project,n))||sha(path.join(project,n))!==h))throw Error('修订要求与当前分镜不一致');
  const previous=read(path.join(project,'qa/editorial-single-submission.json'));
  const originalInputs=Object.fromEntries(['input.txt','aligned-sentences.json'].map(n=>[n,sha(path.join(project,n))]));
  if(previous.schema!=='talkcraft-editorial-single-submission-v1'||previous.approved!==true||
    !previous.submittedAt||previous.maxTasks!==1||previous.allowConfiguredFallback!==true||
    JSON.stringify(previous.inputs)!==JSON.stringify(originalInputs))throw Error('原单次授权或输入不符合安全修订条件');
  const feedback=currentEditorialRepairFeedback(project);
  if(!feedback?.failedChecks?.length)throw Error('缺少当前输入的完整修订失败清单');
  if(fs.existsSync(path.join(project,'editorial.lock'))||fs.existsSync(path.join(project,'editorial-revision.lock')))
    throw Error('已有编导执行锁，禁止并发修订');
  const record={schema:'talkcraft-editorial-revision-authorization-v1',runId,approval:approval.trim(),
    maxTasks:1,inputs:inputs(project),repairScopeSha256:editorialRepairScopeSha256(feedback),approvedAt:new Date().toISOString(),
    feedbackStage:feedback.stage||'editorial',node:feedback.stage==='planning-check'?'storyboard-review':feedback.stage==='preflight'?'preflight':'editorial'};
  const lock=path.join(project,'editorial-revision-authorization.lock'),fd=fs.openSync(lock,'wx');
  try{
    if(fs.existsSync(path.join(project,'editorial.lock'))||fs.existsSync(path.join(project,'editorial-revision.lock')))
      throw Error('已有编导执行锁，禁止并发修订');
    const file=authFile(project);
    if(fs.existsSync(file)){
      const previousAuthorization=read(file);
      if(previousAuthorization.schema!==record.schema||previousAuthorization.runId!==runId||!previousAuthorization.startedAt)
        throw Error('已有未消费或无法核验的修订授权，禁止覆盖');
      const directory=path.join(project,'qa/editorial-revision-authorization-history');
      fs.mkdirSync(directory,{recursive:true});
      const archived=path.join(directory,sha(file)+'.json');
      if(fs.existsSync(archived))throw Error('修订授权归档已存在，禁止覆盖历史');
      fs.renameSync(file,archived);
      try{fs.writeFileSync(file,JSON.stringify(record,null,2),{flag:'wx'});}
      catch(error){fs.renameSync(archived,file);throw error;}
    }else fs.writeFileSync(file,JSON.stringify(record,null,2),{flag:'wx'});
  }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
  return record;
}

export async function executeEditorialRevision(root,runId,{stage=runTalkcraftStage,generate=generateEditorial,resumeUnsubmitted=false}={}){
  if(resumeUnsubmitted)recoverUnsubmittedEditorialRevision(root,runId);
  const project=talkcraftProject(root,runId),file=authFile(project),record=read(file);
  if(fs.existsSync(path.join(project,'editorial-revision-authorization.lock')))throw Error('修订授权正在保存，禁止并发执行');
  if(record.schema!=='talkcraft-editorial-revision-authorization-v1'||record.runId!==runId||record.maxTasks!==1||record.completedAt||record.resumedAt||record.startedAt&&!record.recoveredInputs||
    JSON.stringify(record.recoveredInputs||record.inputs)!==JSON.stringify(inputs(project)))throw Error('修订授权已使用或当前输入变化，禁止重复调用');
  const scope=editorialRepairScopeSha256(currentEditorialRepairFeedback(project));
  if(record.repairScopeSha256!==scope)throw Error('修订授权与当前失败范围不一致，未调用模型');
  const lock=path.join(project,'editorial-revision.lock'),fd=fs.openSync(lock,'wx');
  try{
    fs.writeFileSync(file,JSON.stringify({...record,startedAt:record.startedAt||new Date().toISOString(),...(record.recoveredAt?{resumedAt:new Date().toISOString()}: {})},null,2));
    const operation=async target=>{
    const {revision}=prepareTalkcraftStoryboardRevision(root,runId);
    const checked=await stage('semantic-check',runId);
    if(checked?.passed===false)throw Error('修订前逐句语义校验未通过，未调用模型');
    if(editorialRepairScopeSha256(currentEditorialRepairFeedback(target))!==scope)
      throw Error('归档恢复后的修订范围与授权不一致，未调用模型');
    const submissionFile=path.join(target,'qa/editorial-single-submission.json'),previous=read(submissionFile);
    fs.writeFileSync(path.join(revision,'qa/editorial-single-submission.json'),JSON.stringify(previous,null,2),{flag:'wx'});
    fs.writeFileSync(submissionFile,JSON.stringify({schema:previous.schema,approved:true,maxTasks:1,
      allowConfiguredFallback:true,inputs:previous.inputs,
      ...(previous.targetFingerprints?{targetFingerprints:previous.targetFingerprints}:{}),
      approvedAt:record.approvedAt,approval:record.approval},null,2));
    const result=await generate(root,runId,{revisionScopeSha256:scope});
    if(result?.passed===false)throw Error('局部分镜修订校验未通过');
    if(['storyboard-review','preflight'].includes(record.node)){
      await stage('candidates',runId);
      const planned=await stage('planning-check',runId);
      if(planned?.passed===false)throw Error('当前节点文字和素材补全复检未通过；已保留结果，不自动追加模型调用');
    }
    return {...result,revision};
    };
    const result=['storyboard-review','preflight'].includes(record.node)
      ?await executeNodeRepair({root,runId,project,node:record.node,operation}) :await operation(project);
    fs.writeFileSync(file,JSON.stringify({...read(file),completedAt:new Date().toISOString(),revision:result.revision},null,2));
    return result;
  }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}

// Resume the retained transaction, without reserving authorization or invoking
// a provider. Every original compiler/content/planning check still applies.
export async function recoverNodeEditorialResponse(root,runId,{stage=runTalkcraftStage,recover=recoverProviderEditorial}={}){
  const project=talkcraftProject(root,runId),journal=read(path.join(project,'qa/node-repair.json'));
  const lock=path.join(project,'editorial-revision.lock'),fd=fs.openSync(lock,'wx');
  try{return await executeNodeRepair({root,runId,project,node:journal.node,resumeProviderResponse:true,operation:async()=>{
    const result=await recover(root,runId);
    if(result?.passed===false)throw Error('恢复结果未通过正式校验');
    await stage('candidates',runId);
    const checked=await stage('planning-check',runId);
    if(checked?.passed===false)throw Error('恢复结果未通过本节点规划复检，不发布');
    return result;
  }});}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),runId=process.argv[2];
  try{
    if(process.argv.includes('--recover-provider-response-only'))await trackTalkcraftExecution(talkcraftProject(root,runId),'planning-repair',()=>recoverNodeEditorialResponse(root,runId));
    else if(process.argv.includes('--recheck-base-only'))await trackTalkcraftExecution(talkcraftProject(root,runId),'planning-repair',()=>checkEditorial(root,runId));
    else if(process.argv.includes('--restore-unsubmitted-only'))console.log(JSON.stringify(recoverUnsubmittedEditorialRevision(root,runId)));
    else await trackTalkcraftExecution(talkcraftProject(root,runId),process.argv.includes('--node-local')?(read(authFile(talkcraftProject(root,runId))).node==='preflight'?'preflight-repair':'planning-repair'):'editorial-revision',
      ()=>executeEditorialRevision(root,runId,{resumeUnsubmitted:process.argv.includes('--resume-unsubmitted')}));
  }
  catch(error){console.error(error.stack||error.message);process.exitCode=1;}
}
