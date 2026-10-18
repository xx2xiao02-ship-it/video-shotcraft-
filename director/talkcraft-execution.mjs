import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,renameSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {talkcraftWorkflowProgress} from './talkcraft-progress.mjs';

const context=new AsyncLocalStorage();
const labels={editorial:'生成分镜', 'editorial-revision':'修订分镜', 'editorial-check':'校验已有分镜',bootstrap:'配音与时间轴处理',
  'word-timing':'字级对齐','semantic-check':'逐句语义校验','media-preflight':'素材体检',preflight:'分镜预检',candidates:'镜头候选',scaffold:'搭建渲染工程',
  sample:'首镜样板渲染','render-all':'整片渲染',qa:'机器质检',deliver:'交付导出'};
export const executionLabel=stage=>labels[stage] || stage;
function persist(record,file) {
  writeFileSync(file+'.tmp',JSON.stringify(record,null,2));renameSync(file+'.tmp',file);
}

// Applies equally to CLI and imported operations; nested stages keep one owner.
// PID liveness works during synchronous Python/FFmpeg calls without a JS heartbeat.
export function trackTalkcraftExecution(project,stage,operation) {
  if(!existsSync(path.join(project,'source-run.json')))throw Error('TalkCraft run was not found');
  const parent=context.getStore();
  if(parent?.project===path.resolve(project)) return operation();
  const dir=path.join(project,'qa/executions');mkdirSync(dir,{recursive:true});
  const id=randomUUID(),file=path.join(dir,id+'.json');
  const record={schema:'talkcraft-execution-v1',executionId:id,stage,name:'talkcraft-'+stage,
    pid:process.pid,startedAt:Date.now(),finishedAt:null,status:'running',message:executionLabel(stage)+'中',error:null};
  persist(record,file);
  const finish=(status,error)=>{
    Object.assign(record,{status,finishedAt:Date.now(),error:error?String(error.message||error):null,
      message:error?String(error.message||error):executionLabel(stage)+(status==='done'?'完成':'未通过')});
    persist(record,file);
  };
  return context.run({project:path.resolve(project),record,file},()=>{
    try {
      const result=operation();
      const success=value=>{finish(value?.passed===false?'error':'done',value?.passed===false?Error('阶段校验未通过'):null);return value;};
      const failure=error=>{finish('error',error);throw error;};
      return result?.then ? result.then(success,failure) : success(result);
    } catch(error) {finish('error',error);throw error;}
  });
}
export function updateTalkcraftExecution(message) {
  const owner=context.getStore();if(!owner)return;
  owner.record.message=String(message);persist(owner.record,owner.file);
}
export function readTalkcraftExecutions(project,{alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}}}={}) {
  const dir=path.join(project,'qa/executions');
  let files;try{files=readdirSync(dir);}catch{return [];}
  return files.filter(name=>name.endsWith('.json')).flatMap(name=>{
    try {
      const row=JSON.parse(readFileSync(path.join(dir,name),'utf8'));
      if(row.schema!=='talkcraft-execution-v1'||!Number.isInteger(row.pid)||!Number.isFinite(row.startedAt))return [];
      if(row.status==='running'&&!alive(row.pid))return [{...row,status:'interrupted',
        message:'执行进程已结束，退出结果未记录；请核对产物',error:'执行进程已中断，未自动重试'}];
      return [row];
    }catch{return [];}
  }).sort((a,b)=>b.startedAt-a.startedAt);
}

export function talkcraftExecutionView(run) {
  return {...executionState(run),workflow:talkcraftWorkflowProgress(run)};
}
function executionState(run) {
  const task=run.activeTask;
  if(task) return {status:task.status==='stopping'?'stopping':'running',label:task.message ||
    executionLabel(task.name.replace(/^talkcraft-/u,''))+'中',startedAt:task.startedAt,progress:null};
  if(run.lastFailure)return {status:'blocked',label:run.lastFailure.title,detail:run.lastFailure.cause,progress:null};
  if(run.delivery)return {status:'completed',label:'交付成片已就绪',progress:100};
  return {status:'waiting',label:run.waitingFor || '等待后端下一阶段',progress:null};
}
