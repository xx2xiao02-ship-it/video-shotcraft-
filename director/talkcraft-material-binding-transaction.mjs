import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const sha=value=>createHash('sha256').update(value).digest('hex');
const targets=new Set(['remotion/shots.json','material-research-plan.json']);
const guards=['input.txt','aligned-sentences.json','audio/full.mp3','semantics.json','source-run.json','material-binding-plan.json','qa/ark-editorial-response.json'];
const fingerprints=p=>Object.fromEntries(guards.map(n=>[n,fs.existsSync(path.join(p,n))?sha(fs.readFileSync(path.join(p,n))):null]));
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}};
function atomic(file,text){
  const temp=file+'.'+randomUUID()+'.tmp',fd=fs.openSync(temp,'wx');
  try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}

// A local write-ahead record protects the two business files as one recoverable
// operation. Recovery never searches, downloads or invokes a paid provider.
export function withMaterialBindingTransaction(project,operation,{afterWrite}={}){
  const qa=path.join(project,'qa');fs.mkdirSync(qa,{recursive:true});
  const lock=path.join(qa,'material-binding.lock'),token=randomUUID();
  const ownerFile=path.join(lock,token+'.json');
  for(let attempt=0;;attempt++){
    try{fs.mkdirSync(lock);fs.writeFileSync(ownerFile,JSON.stringify({pid:process.pid,token}),{flag:'wx'});break;}
    catch(error){
      if(error.code!=='EEXIST'||attempt)throw error;
      let owner,name;try{
        const names=fs.readdirSync(lock);if(names.length!==1)throw Error('unknown owner');
        name=names[0];owner=JSON.parse(fs.readFileSync(path.join(lock,name),'utf8'));
        if(name!==owner.token+'.json')throw Error('unknown owner');
      }catch{throw Error('素材绑定执行锁损坏，保留现场待核对');}
      if(!Number.isInteger(owner.pid)||owner.pid<=0||!owner.token||alive(owner.pid))throw Error('已有素材绑定进程，禁止重复继续');
      // Delete only the dead owner's unique file, then remove an empty lock
      // directory. A simultaneous recovery cannot delete a new owner's file.
      try{fs.unlinkSync(path.join(lock,name));}catch(e){if(e.code!=='ENOENT')throw e;}
      try{fs.rmdirSync(lock);}catch(e){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;}
    }
  }
  const journal=path.join(qa,'material-binding-transaction.json');
  const complete=record=>{
    if(record.schema!=='talkcraft-material-binding-transaction-v1'||record.state!=='prepared'||
      JSON.stringify(record.inputs)!==JSON.stringify(fingerprints(project))||
      !Array.isArray(record.files)||!record.files.length||new Set(record.files.map(f=>f.name)).size!==record.files.length)
      throw Error('素材绑定恢复记录或输入已变化，保留现场，不覆盖当前数据');
    for(const file of record.files){
      if(!targets.has(file.name)||typeof file.before!=='string'||typeof file.after!=='string'||
        sha(file.before)!==file.beforeSha256||sha(file.after)!==file.afterSha256)
        throw Error('素材绑定恢复内容或文件范围不合法');
      const current=sha(fs.readFileSync(path.join(project,file.name)));
      if(current!==file.beforeSha256&&current!==file.afterSha256)throw Error('素材绑定目标有并发修改，停止恢复');
    }
    for(const file of record.files){
      const target=path.join(project,file.name);
      if(sha(fs.readFileSync(target))!==file.afterSha256){atomic(target,file.after);afterWrite?.(file.name);}
    }
    const completed={...record,state:'committed'};
    const history=path.join(qa,'material-binding-transactions');fs.mkdirSync(history,{recursive:true});
    const saved=path.join(history,record.id+'.json');
    if(!fs.existsSync(saved))fs.writeFileSync(saved,JSON.stringify(completed,null,2)+'\n',{flag:'wx'});
    atomic(journal,JSON.stringify(completed,null,2)+'\n');
  };
  try{
    let recovered=false;
    if(fs.existsSync(journal)){
      const previous=JSON.parse(fs.readFileSync(journal,'utf8'));
      if(previous.state==='prepared'){complete(previous);recovered=true;}
      else if(previous.state!=='committed')throw Error('素材绑定恢复记录状态不合法');
    }
    return operation({recovered,commit(values){
      const files=Object.entries(values).map(([name,value])=>{
        if(!targets.has(name))throw Error('素材绑定写入范围不合法');
        const before=fs.readFileSync(path.join(project,name),'utf8');
        const after=JSON.stringify(value,null,2)+'\n';
        return {name,before,after,beforeSha256:sha(before),afterSha256:sha(after)};
      }).filter(f=>JSON.stringify(JSON.parse(f.before))!==JSON.stringify(JSON.parse(f.after)));
      if(!files.length)return;
      const record={schema:'talkcraft-material-binding-transaction-v1',id:randomUUID(),state:'prepared',inputs:fingerprints(project),files};
      atomic(journal,JSON.stringify(record,null,2)+'\n');complete(record);
    }});
  }finally{
    if(fs.existsSync(ownerFile)){
      fs.unlinkSync(ownerFile);
      try{fs.rmdirSync(lock);}catch(error){if(error.code!=='ENOTEMPTY')throw error;}
    }
  }
}
