import fs from 'node:fs';import path from 'node:path';import {fileSha256} from './talkcraft-digital-human-plan.mjs';
import {approveTalkcraftStoryboard,talkcraftProject,readTalkcraftStatus} from './talkcraft-status.mjs';
const key='qa/continuation-policy.json';
const inputs=p=>Object.fromEntries(['source-run.json','input.txt','audio/full.mp3'].map(n=>[n,fileSha256(path.join(p,n))]));
export function authorizeTalkcraftContinuation(project,{approval}={}){
 if(typeof approval!=='string'||approval.trim().length<4)throw Error('缺少推进至14停止的用户授权');
 const r={schema:'talkcraft-continuation-policy-v1',inputs:inputs(project),approval,stopAt:'review',storyboardApproval:'delegated-after-checks'};
 const f=path.join(project,key);if(fs.existsSync(f)){if(JSON.stringify(JSON.parse(fs.readFileSync(f)))!==JSON.stringify(r))throw Error('已有不同的通路授权，停止核对');return r;}
 fs.writeFileSync(f,JSON.stringify(r,null,2),{flag:'wx'});return r;
}
export function readTalkcraftContinuation(project){
 try{const r=JSON.parse(fs.readFileSync(path.join(project,key)));return {enabled:r.schema==='talkcraft-continuation-policy-v1'&&r.stopAt==='review'&&r.storyboardApproval==='delegated-after-checks'&&
  JSON.stringify(r.inputs)===JSON.stringify(inputs(project)),stopAt:'review'};}catch{return {enabled:false};}
}
export function approveDelegatedTalkcraftStoryboard(root,runId){
 const project=talkcraftProject(root,runId),policy=readTalkcraftContinuation(project);
 if(!policy.enabled||!readTalkcraftStatus(root,runId).planningPassed)throw Error('未授权当前通路或07原规则未通过，不得代记录分镜通过');
 const result=approveTalkcraftStoryboard(root,runId,'用户授权本次通路测试：07数据补全后按原规则通过，推进至14停止；不代表已人工观看样片或成片');
 const file=path.join(project,'qa/storyboard-approved.json'),record=JSON.parse(fs.readFileSync(file));
 fs.writeFileSync(file,JSON.stringify({...record,method:'delegated-after-checks',authorizationSha256:fileSha256(path.join(project,key))},null,2));return result;
}
