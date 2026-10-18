import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {prepareResearchBindings} from './talkcraft-research-binding.mjs';
import {allocateTemplateMaterials} from './talkcraft-template-materials.mjs';
const binding=p=>Object.fromEntries(['input.txt','audio/full.mp3','semantics.json','remotion/shots.json','material-research-plan.json','material-binding-plan.json'].map(n=>[n,fs.existsSync(path.join(p,n))?createHash('sha256').update(fs.readFileSync(path.join(p,n))).digest('hex'):null]));
// Shared deterministic completion for 07/09. No model/provider transport is
// available here. Source rights, actual slots and the original checks still own
// admission; an incompatible old binding is skipped, never forced onto a card.
export function completeTalkcraftNodeInputs(project,{node,catalog,index,deferGeneratedHost=false,bind=prepareResearchBindings,allocate=allocateTemplateMaterials}){
 if(!['storyboard-review','preflight'].includes(node))throw Error('补全节点必须是07或09');
 const before=binding(project),record={schema:'talkcraft-node-completion-v1',node,before,paidCalls:0,attemptedAt:new Date().toISOString()};
 try{
  const research=fs.existsSync(path.join(project,'material-research-plan.json'))?bind(project,catalog,{index}):{applied:[],issues:[]};
  const materials=allocate(project,{deferGeneratedHost});
  Object.assign(record,{passed:!research.issues.length&&!materials.unresolved.length,issues:[...research.issues,...materials.unresolved],after:binding(project)});
 }catch(error){Object.assign(record,{passed:false,issues:[{code:'NODE_COMPLETION_BLOCKED',message:String(error.message||error)}],after:binding(project)});}
 fs.mkdirSync(path.join(project,'qa'),{recursive:true});fs.writeFileSync(path.join(project,`qa/${node}-completion.json`),JSON.stringify(record,null,2));
 return record;
}

export async function completeTalkcraftPreflightNode({project,runId,read,complete,stage,approve,prepare}){
 const entry=read();
 const file=path.join(project,'qa/preflight-node-completion.json');
 let prior;try{prior=JSON.parse(fs.readFileSync(file));}catch{}
 const recovering=prior?.schema==='talkcraft-preflight-completion-v1'&&prior.runId===runId&&prior.entryReviewed===true&&
   ['blocked','running'].includes(prior.status)&&JSON.stringify(prior.afterInputs)===JSON.stringify(binding(project));
 if((!entry.planningPassed||!entry.storyboardApproved)&&!recovering||entry.digitalHumanGenerationPlanned&&!entry.digitalHuman?.ready)
   throw Error('09入口须已完成当前分镜审核与人物素材；不会越级执行');
 const record={schema:'talkcraft-preflight-completion-v1',runId,node:'preflight',pid:process.pid,status:'running',
   entryInputs:binding(project),entryReviewed:true,phase:'bindings',paidCalls:0,startedAt:new Date().toISOString()};
 const save=()=>{record.afterInputs=binding(project);fs.writeFileSync(file,JSON.stringify(record,null,2));};
 const step=phase=>{record.phase=phase;save();};save();
 try{
  const completed=await complete();if(!completed.passed)throw Error('09素材补全未通过：'+completed.issues.map(i=>i.message||i.code).join('；'));
  let current=read();
  if(!current.candidatesReady){step('candidate-recheck');await stage('candidates');}
  if(!read().planningPassed){step('planning-recheck');const r=await stage('planning-check');if(r?.passed===false)throw Error('09内部规划复检未通过');}
  if(!read().storyboardApproved){step('review-binding');await approve();}
  current=read();
  if(current.digitalHumanGenerationPlanned&&!current.mediaPreflightPassed){step('host-recheck');await stage('host-preflight');}
  current=read();
  if(current.digitalHumanGenerationPlanned&&current.parallelPreparation?.status!=='done'){
    step('join-preparation');await prepare();
  }
  step('full-preflight');const result=await stage('preflight');
  if(result?.passed===false)throw Error('09原版全量预检未通过；保留完整失败清单，未回退04或调用模型');
  record.status='completed';record.completedAt=new Date().toISOString();save();return result;
 }catch(error){record.status='blocked';record.error=String(error.message||error);save();throw error;}
}
