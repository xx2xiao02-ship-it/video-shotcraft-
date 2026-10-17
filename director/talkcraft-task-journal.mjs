import fs from 'node:fs';
import path from 'node:path';

export function taskJournal(root,port,{alive=()=>false}={}) {
  if(!/^\d{1,5}$/u.test(String(port)))throw Error('Invalid journal port');
  const file=path.join(root,'director/b-mode-runs',`task-history-${port}.json`);
  const saved=()=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return [];}};
  function save(tasks) {
    const rows=[...tasks.values()].filter(t=>t.name?.startsWith('talkcraft-')).map(t=>({
      id:t.id,name:t.name,runId:t.runId,cmd:t.cmd||null,cwd:t.cwd||null,status:t.status,logs:t.logs,startedAt:t.startedAt,finishedAt:t.finishedAt||null,
      workerPid:t.proc?.pid||t.workerPid||null,error:t.error||null,exitCode:t.exitCode??null,failureReport:t.failureReport||null}));
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file+'.tmp',JSON.stringify(rows));fs.renameSync(file+'.tmp',file);
  }
  function reconcile(t) {
    if(!t.recoveredWorker || !['starting','running','stopping'].includes(t.status))return t;
    const row=saved().find(r=>r.id===t.id&&r.runId===t.runId);
    if(row?.logs)t.logs=row.logs;
    if(alive(t.workerPid))return t;
    t.status='error';t.exitCode=null;t.error='服务重启后执行进程已结束，退出结果无法确认。已有资产已保留，请核对产物后继续；不会自动重新提交外部任务。';
    t.logs.push(t.error);return t;
  }
  function restore() {
    return saved().filter(t=>Number.isSafeInteger(t.id)&&t.name?.startsWith('talkcraft-')).map(t=>reconcile({...t,proc:null,recoveredWorker:true}));
  }
  return {file,save,restore,reconcile};
}
