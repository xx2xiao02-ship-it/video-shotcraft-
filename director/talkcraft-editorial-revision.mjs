import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {talkcraftProject,prepareTalkcraftStoryboardRevision} from './talkcraft-status.mjs';
import {currentEditorialRepairFeedback,currentRejectedEditorialFeedback} from './talkcraft-editorial-planning-contract.mjs';
import {runTalkcraftStage} from './talkcraft-stages.mjs';
import {generateEditorial} from './talkcraft-ark-editorial.mjs';
import {trackTalkcraftExecution} from './talkcraft-execution.mjs';

const read=f=>JSON.parse(fs.readFileSync(f));
const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const names=['input.txt','aligned-sentences.json','audio/full.mp3','semantics.json',
  'SHOTBOOK.md','remotion/shots.json','qa/ark-editorial-response.json',
  'qa/storyboard-adjustment-request.json','qa/editorial-single-submission.json','qa/semantics-before-ark.json',
  'material-research-plan.json','material-binding-plan.json','qa/editorial-repair-feedback.json',
  'qa/candidate-editorial-revision-feedback.json','qa/rebuild-inputs.json'];
const inputs=project=>Object.fromEntries(names.map(n=>[n,fs.existsSync(path.join(project,n))?sha(path.join(project,n)):null]));
const authFile=p=>path.join(p,'qa/editorial-revision-authorization.json');

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
  if(!currentEditorialRepairFeedback(project)?.failedChecks?.length)throw Error('缺少当前输入的完整修订失败清单');
  if(fs.existsSync(path.join(project,'editorial.lock'))||fs.existsSync(path.join(project,'editorial-revision.lock')))
    throw Error('已有编导执行锁，禁止并发修订');
  const record={schema:'talkcraft-editorial-revision-authorization-v1',runId,approval:approval.trim(),
    maxTasks:1,inputs:inputs(project),approvedAt:new Date().toISOString()};
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

export async function executeEditorialRevision(root,runId,{stage=runTalkcraftStage,generate=generateEditorial}={}){
  const project=talkcraftProject(root,runId),file=authFile(project),record=read(file);
  if(fs.existsSync(path.join(project,'editorial-revision-authorization.lock')))throw Error('修订授权正在保存，禁止并发执行');
  if(record.schema!=='talkcraft-editorial-revision-authorization-v1'||record.runId!==runId||record.maxTasks!==1||record.startedAt||
    JSON.stringify(record.inputs)!==JSON.stringify(inputs(project)))throw Error('修订授权已使用或当前输入变化，禁止重复调用');
  const lock=path.join(project,'editorial-revision.lock'),fd=fs.openSync(lock,'wx');
  try{
    fs.writeFileSync(file,JSON.stringify({...record,startedAt:new Date().toISOString()},null,2));
    const {revision}=prepareTalkcraftStoryboardRevision(root,runId);
    const checked=await stage('semantic-check',runId);
    if(checked?.passed===false)throw Error('修订前逐句语义校验未通过，未调用模型');
    const submissionFile=path.join(project,'qa/editorial-single-submission.json'),previous=read(submissionFile);
    fs.writeFileSync(path.join(revision,'qa/editorial-single-submission.json'),JSON.stringify(previous,null,2),{flag:'wx'});
    fs.writeFileSync(submissionFile,JSON.stringify({schema:previous.schema,approved:true,maxTasks:1,
      allowConfiguredFallback:true,inputs:previous.inputs,
      ...(previous.targetFingerprints?{targetFingerprints:previous.targetFingerprints}:{}),
      approvedAt:record.approvedAt,approval:record.approval},null,2));
    const result=await generate(root,runId);
    fs.writeFileSync(file,JSON.stringify({...record,startedAt:read(file).startedAt,completedAt:new Date().toISOString(),revision},null,2));
    return result;
  }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),runId=process.argv[2];
  try{await trackTalkcraftExecution(talkcraftProject(root,runId),'editorial-revision',()=>executeEditorialRevision(root,runId));}
  catch(error){console.error(error.stack||error.message);process.exitCode=1;}
}
