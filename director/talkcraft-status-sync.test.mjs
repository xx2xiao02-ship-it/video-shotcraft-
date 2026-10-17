import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../console-ui.html',import.meta.url),'utf8');
const sync=html.slice(html.indexOf('async function refreshBExecutionStatus()'),html.indexOf('let bAuditRunId',html.indexOf('async function refreshBExecutionStatus()')));
function harness({fresh=false,busy=false}={}){
 const elements=new Map(),runId='e39e8a9d-0740-43df-8729-43d034f0d62a',progress=[];
 const run={runId,execution:{status:'running',label:'正在复用分镜本地校验'},activeTask:{name:'talkcraft-editorial',status:'running'}};
 const c=vm.createContext({activeProductionMode:'B',bModeBusy:busy,bFreshInput:fresh,bAuditRunId:fresh?null:runId,
  bBackendSyncPending:false,bBackendRunStatus:null,bBackendSnapshotAt:0,bAuditRunStatus:null,Date,AbortSignal,
  document:{hidden:false},
  initialRoute:new URLSearchParams(fresh?{}:{runId}),$:id=>{if(!elements.has(id))elements.set(id,{dataset:{},hidden:true});return elements.get(id);},
  fetch:async()=>({ok:true,json:async()=>({ok:true,run})}),setBProgress:(...v)=>progress.push(v),setProductionStartState:()=>{},renderBAuditNextAction:()=>{}});
 vm.runInContext(sync,c);return {c,elements,progress,run,runId};
}
test('按钮请求未结束时仍读取后端，并覆盖历史停止状态',async()=>{
 const {c,elements,progress}=harness({busy:true});await c.refreshBExecutionStatus();
 assert.match(elements.get('#b-backend-summary').textContent,/正在复用/);
 assert.equal(elements.get('#b-backend-monitor').dataset.status,'running');assert.equal(progress.length,1);
});
test('编辑新文案期间仍显示后台任务，不覆盖草稿和运行归属',async()=>{
 const {c,elements,progress}=harness({fresh:true});await c.refreshBExecutionStatus();
 assert.equal(elements.get('#b-backend-monitor').hidden,false);assert.equal(elements.get('#b-backend-draft-note').hidden,false);
 assert.equal(progress.length,0);assert.equal(c.bAuditRunId,null);assert.equal(c.bFreshInput,true);
});
test('慢请求去重，后续失败和断线分别显示真实状态',async()=>{
 const {c,elements,run}=harness();let release,requests=0;
 c.fetch=async()=>{requests++;await new Promise(r=>{release=r;});return {ok:true,json:async()=>({ok:true,run})};};
 const first=c.refreshBExecutionStatus();await c.refreshBExecutionStatus();assert.equal(requests,1);release();await first;
 run.activeTask=null;run.execution={status:'blocked',label:'s02 句子覆盖重叠'};
 c.fetch=async()=>({ok:true,json:async()=>({ok:true,run})});await c.refreshBExecutionStatus();
 assert.equal(elements.get('#b-backend-monitor').dataset.status,'blocked');
 c.fetch=async()=>{throw Error('服务断开');};await c.refreshBExecutionStatus();
 assert.equal(elements.get('#b-backend-monitor').dataset.status,'disconnected');assert.match(elements.get('#gen-status').textContent,/无法确认后台是否结束/);
});
test('前端不再用全局任务表清空后端实际活动任务，状态轮询不被 busy 阻断',()=>{
 const audit=html.slice(html.indexOf('async function renderBProductionAudit('),html.indexOf('async function reprocessBAuditScript('));
 assert.doesNotMatch(audit,/activeTask:active \|\| null/u);
 assert.match(html,/setInterval\(refreshBExecutionStatus, 2000\)/u);
 assert.doesNotMatch(sync,/if\s*\([^)]*bModeBusy[^)]*\)\s*return/u);
});
