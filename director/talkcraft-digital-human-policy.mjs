import fs from 'node:fs';import path from 'node:path';import {fileSha256} from './talkcraft-digital-human-plan.mjs';
const file=p=>path.join(p,'qa/digital-human-automation.json');
const inputs=p=>Object.fromEntries(['source-run.json','input.txt','audio/full.mp3'].map(n=>[n,fileSha256(path.join(p,n))]));
export function authorizeDigitalHumanAutomation(project,{approval}={}){
 if(typeof approval!=='string'||approval.trim().length<4)throw Error('缺少本次任务数字人自动补足的用户授权');
 const record={schema:'talkcraft-digital-human-automation-v1',enabled:true,inputs:inputs(project),approval,
  reuseFirst:true,generateMissingOnly:true,queryExistingTaskIdsOnly:true,stopOnUnknownSubmission:true,stopAt:'review'};
 if(fs.existsSync(file(project))){const previous=JSON.parse(fs.readFileSync(file(project)));if(JSON.stringify(previous)!==JSON.stringify(record))throw Error('已有不同的数字人自动补足授权，停止核对');return previous;}
 fs.writeFileSync(file(project),JSON.stringify(record,null,2),{flag:'wx'});return record;
}
export function readDigitalHumanAutomation(project){
 try{const r=JSON.parse(fs.readFileSync(file(project)));return {enabled:r.schema==='talkcraft-digital-human-automation-v1'&&r.enabled===true&&
  r.reuseFirst===true&&r.generateMissingOnly===true&&r.queryExistingTaskIdsOnly===true&&r.stopOnUnknownSubmission===true&&
  JSON.stringify(r.inputs)===JSON.stringify(inputs(project)),stopAt:'review'};}catch{return {enabled:false};}
}
