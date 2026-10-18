import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withTalkcraftProject} from './talkcraft-project-context.mjs';
import {responseFailureDetails} from './talkcraft-editorial-response.mjs';

const hash=f=>fs.existsSync(f)?createHash('sha256').update(fs.readFileSync(f)).digest('hex'):null;
const read=f=>JSON.parse(fs.readFileSync(f));
// Failure-report generation refreshes this derived diagnostic after a worker
// exits. It is not creative input and must not resurrect its old worker copy.
const derivedFailureReport=n=>n==='qa/audit-feedback.json'||n.startsWith('qa/failures/');
// Sender preflight is an immutable diagnostic, not a production contract.
// The actual request, raw response and authorization remain fingerprinted.
const inputPreflightReport=n=>n==='qa/editorial-input-preflight'||n.startsWith('qa/editorial-input-preflight/');
const excluded=n=>n==='workflow-automation.json'||n==='qa/node-repairs'||n==='qa/node-repair.json'||n==='qa/auto-advance.json'||n==='qa/executions'||n==='qa/storyboard-revisions'||
  inputPreflightReport(n)||/(^|\/)(node_modules|out|\.cache)(\/|$)/u.test(n)||/\.lock$/u.test(n);
function files(project){
  const result=[];
  const walk=dir=>{for(const entry of fs.readdirSync(path.join(project,dir),{withFileTypes:true})){
    const n=dir?dir+'/'+entry.name:entry.name;if(excluded(n))continue;
    if(entry.isSymbolicLink())throw Error('补全工作区不接受未核验符号链接：'+n);
    if(entry.isDirectory())walk(n);else if(entry.isFile())result.push(n);
  }};walk('');return result;
}
const put=(p,n,bytes)=>{const f=path.join(p,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,bytes);};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const publishedBytes=(work,project,n)=>{
 let bytes=fs.readFileSync(path.join(work,n));
 if(/\.(json|md|txt)$/u.test(n))bytes=Buffer.from(bytes.toString().replaceAll(work.replaceAll('\\','\\\\'),project.replaceAll('\\','\\\\')).replaceAll(work.replaceAll('\\','/'),project.replaceAll('\\','/')).replaceAll(work,project));
 return bytes;
};

// Only the provider reservation/result journal is published on failure. The
// accepted production data remains byte-for-byte intact until validation ends.
export async function executeNodeRepair({root,runId,project,node,operation,resumeProviderResponse=false}){
  if(!['storyboard-review','preflight'].includes(node))throw Error('补全只能属于07或09');
  recoverNodePublication(project);
  const journalFile=path.join(project,'qa/node-repair.json');
  const prior=resumeProviderResponse?read(journalFile):null;
  if(prior&&(prior.schema!=='talkcraft-node-repair-v1'||prior.runId!==runId||prior.node!==node||prior.status!=='blocked'||!prior.providerSubmitted))throw Error('只能免费恢复本次已提交且阻断的节点请求');
  const directory=prior?path.resolve(project,prior.directory):path.join(project,'qa/node-repairs',randomUUID());
  const relative=path.relative(path.join(project,'qa/node-repairs'),directory);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('响应恢复目录不属于当前任务');
  const work=path.join(directory,'work'),backup=path.join(directory,'before');
  if(prior){
    if(fs.realpathSync(directory)!==directory||fs.realpathSync(work)!==work)throw Error('响应恢复目录不能是链接');
    const changed=Object.keys({...prior.initial,...Object.fromEntries(files(project).map(n=>[n,true]))})
      .filter(n=>n!=='qa/editorial-single-submission.json'&&!derivedFailureReport(n)&&!inputPreflightReport(n)&&hash(path.join(project,n))!==(prior.initial[n]??null));
    if(changed.length)throw Error('正式输入已变化，拒绝恢复旧请求：'+changed.join('、'));
    if(hash(path.join(project,'qa/editorial-single-submission.json'))!==hash(path.join(work,'qa/editorial-single-submission.json')))throw Error('当前与恢复工作区不是同一次提交');
    files(work); // reject links before entering the retained working directory
    for(const n of files(project).filter(derivedFailureReport))put(work,n,fs.readFileSync(path.join(project,n)));
  }else fs.mkdirSync(work,{recursive:true});
  const initial=Object.fromEntries(files(project).map(n=>[n,hash(path.join(project,n))]));
  if(!prior)for(const n of Object.keys(initial)){
    fs.mkdirSync(path.dirname(path.join(work,n)),{recursive:true});fs.copyFileSync(path.join(project,n),path.join(work,n));
  }
  const registry=path.join(project,'qa/reviewed-material-recovery.json');
  if(!prior&&fs.existsSync(registry)){
    const snapshot=read(registry).snapshot;
    if(!/^qa\/storyboard-revisions\/[^/]+\/material-binding-plan\.json$/u.test(snapshot))throw Error('素材登记快照路径不合法');
    fs.cpSync(path.dirname(path.join(project,snapshot)),path.dirname(path.join(work,snapshot)),{recursive:true});
  }
  const journal={schema:'talkcraft-node-repair-v1',runId,node,directory:path.relative(project,directory),
    status:'running',pid:process.pid,startedAt:prior?.startedAt||new Date().toISOString(),initial,providerSubmitted:!!prior,
    ...(prior?{recoveryStartedAt:new Date().toISOString(),previousError:prior.error}: {})};
  const save=()=>fs.writeFileSync(journalFile,JSON.stringify(journal,null,2));save();
  try{
    const result=await withTalkcraftProject(root,runId,work,()=>operation(work));
    if(result?.passed===false)throw Error('节点补全复检未通过，保留正式数据');
    if(Object.entries(initial).some(([n,h])=>hash(path.join(project,n))!==h))throw Error('节点补全期间正式输入发生变化，拒绝发布');
    const after=Object.fromEntries(files(work).map(n=>[n,hash(path.join(work,n))]));
    const changes=Object.keys({...initial,...after}).filter(n=>initial[n]!==after[n]);
    for(const n of changes)if(!Object.hasOwn(initial,n)&&fs.existsSync(path.join(project,n)))throw Error('节点补全期间正式新增文件发生变化，拒绝发布：'+n);
    // The exact rollback set is durable before the first production write.
    for(const n of changes)if(initial[n]){fs.mkdirSync(path.dirname(path.join(backup,n)),{recursive:true});fs.copyFileSync(path.join(project,n),path.join(backup,n));}
    journal.status='publishing';journal.changes=changes;
    journal.publishedHashes=Object.fromEntries(changes.map(n=>[n,after[n]?digest(publishedBytes(work,project,n)):null]));save();
    for(const n of changes){
      const source=path.join(work,n),target=path.join(project,n);
      if(!after[n]){if(fs.existsSync(target))fs.unlinkSync(target);continue;}
      put(project,n,publishedBytes(work,project,n));
    }
    journal.status='completed';journal.completedAt=new Date().toISOString();save();return result;
  }catch(error){
    // A partially published transaction rolls back before exposing continuation.
    if(journal.status==='publishing')for(const n of journal.changes){
      if(initial[n])put(project,n,fs.readFileSync(path.join(backup,n)));
      else if(fs.existsSync(path.join(project,n)))fs.unlinkSync(path.join(project,n));
    }
    const submission='qa/editorial-single-submission.json',record=fs.existsSync(path.join(work,submission))?read(path.join(work,submission)):{};
    if(record.submittedAt&&hash(path.join(work,submission))!==initial[submission]){
      // Never turn a submitted/unknown request back into unused authorization.
      put(project,submission,fs.readFileSync(path.join(work,submission)));journal.providerSubmitted=true;
    }
    journal.status='blocked';journal.error=String(error.message||error);
    if(error.code)journal.responseFailure={...responseFailureDetails(error),...(resumeProviderResponse?{paidCalls:0}: {})};
    save();throw error;
  }
}

// A process can die between publication writes. Recover only the journal's
// exact rollback set, retaining all work/provider evidence for free inspection.
export function recoverNodePublication(project){
  const file=path.join(project,'qa/node-repair.json');if(!fs.existsSync(file))return false;
  const r=read(file);if(r.schema!=='talkcraft-node-repair-v1'||r.status!=='publishing')return false;
  if(r.pid&&r.pid!==process.pid){let alive=false;try{process.kill(r.pid,0);alive=true;}catch(error){if(error.code!=='ESRCH')alive=true;}if(alive)throw Error('节点发布进程仍在运行，不得并发恢复');}
  const base=path.join(project,'qa/node-repairs'),dir=path.resolve(project,r.directory),rel=path.relative(base,dir);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('节点恢复目录不属于当前任务');
  for(const n of r.changes){
    if(n.split(/[\\/]/u).includes('..')||path.isAbsolute(n))throw Error('非法节点恢复路径');
    const work=path.join(dir,'work',n),target=path.join(project,n);
    if(r.initial[n]&&hash(path.join(dir,'before',n))!==r.initial[n])throw Error('节点回滚备份哈希不符：'+n);
    const expected=r.publishedHashes?.[n]??(fs.existsSync(work)?digest(publishedBytes(path.join(dir,'work'),project,n)):null);
    if(hash(target)!==(r.initial[n]??null)&&hash(target)!==expected)throw Error('发布后文件被修改，不能覆盖：'+n);
  }
  for(const n of r.changes){if(r.initial[n])put(project,n,fs.readFileSync(path.join(dir,'before',n)));else if(fs.existsSync(path.join(project,n)))fs.unlinkSync(path.join(project,n));}
  const submission='qa/editorial-single-submission.json',saved=fs.existsSync(path.join(dir,'work',submission))?read(path.join(dir,'work',submission)):{};
  if(saved.submittedAt&&hash(path.join(dir,'work',submission))!==r.initial[submission])put(project,submission,fs.readFileSync(path.join(dir,'work',submission)));
  fs.writeFileSync(file,JSON.stringify({...r,status:'blocked',error:'中断发布已回滚；保留已有请求结果，需本地复检'},null,2));return true;
}
