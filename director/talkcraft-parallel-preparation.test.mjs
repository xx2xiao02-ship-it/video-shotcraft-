import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {runPreparationLanes,readParallelPreparation,assertParallelPreparationJoined,preparedTalkcraftFile,createPreparedTalkcraftResolver} from './talkcraft-parallel-preparation.mjs';
import {parallelPreparationAllowed,createTalkcraftAutoAdvance} from './talkcraft-auto-advance.mjs';
import {talkcraftControlState} from './talkcraft-control-state.mjs';

const eligible={provenance:{verified:true},digitalHumanGenerationPlanned:true,planningPassed:true,storyboardApproved:true,
  activeTask:{name:'talkcraft-digital-human',status:'running'}};
test('只有已审数字人任务运行时启动本地准备；停止、已处理与审批变化不会重复启动',()=>{
  assert.equal(parallelPreparationAllowed(eligible),true);
  for(const change of [{storyboardApproved:false},{planningPassed:false},{storyboardAdjustmentPending:true},
    {digitalHumanGenerationPlanned:false},{parallelPreparation:{status:'failed'}},
    {activeTask:{name:'talkcraft-digital-human',status:'stopping'}},{activeTask:{name:'talkcraft-render-all',status:'running'}}])
    assert.equal(parallelPreparationAllowed({...eligible,...change}),false);
});
test('调度并行分支仍持有单次锁，不能提前排队预检、渲染或费用节点',async()=>{
  let record,run={...eligible},calls=0,queued=0,release;
  const wait=new Promise(r=>{release=r;});
  const auto=createTalkcraftAutoAdvance({port:18866,readRun:()=>run,readRecord:()=>record,
    writeRecord:(_id,r)=>{record=r;},queueStage:()=>{queued++;},
    prepareParallel:async()=>{calls++;await wait;run={...run,parallelPreparation:{status:'done'}};}});
  auto.enable('run');const executing=auto.advance('run');
  await new Promise(r=>setImmediate(r));await auto.advance('run');
  assert.equal(calls,1);assert.equal(queued,0);release();await executing;await auto.advance('run');
  assert.equal(calls,1);assert.equal(queued,0);
});
test('真实子进程并行重叠，最多两个准备分支；单分支失败保留其他成果',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'talkcraft-parallel-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const script=path.join(dir,'worker.mjs');
  fs.writeFileSync(script,`import fs from 'node:fs';import path from 'node:path';
const [dir,id]=process.argv.slice(2);fs.writeFileSync(path.join(dir,id+'.started'),'yes');
if(id!=='2'){const other=path.join(dir,id==='0'?'1.started':'0.started');
for(let n=0;!fs.existsSync(other);n++){if(n>100)throw Error('没有真正并行启动');await new Promise(r=>setTimeout(r,10));}}
if(id==='2')throw Error('test failure');`);
  let active=0,peak=0;const rows=[0,1,2].map(id=>({id:String(id)}));
  const passed=await runPreparationLanes(rows,row=>new Promise((resolve,reject)=>{
    active++;peak=Math.max(peak,active);
    const child=spawn(process.execPath,[script,dir,row.id],{windowsHide:true,stdio:'ignore'});
    child.on('error',e=>{active--;reject(e);});child.on('close',code=>{active--;code===0?resolve({files:1}):reject(Error('test failure'));});
  }),()=>{});
  assert.equal(passed,false);assert.equal(peak,2);
  assert.deepEqual(rows.map(r=>r.status),['done','done','failed']);
  assert.ok(rows[0].startedAt<rows[1].finishedAt&&rows[1].startedAt<rows[0].finishedAt);
});
test('准备输入和资产哈希变化立即阻断消费，旧任务无准备记录保持兼容',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'talkcraft-prepared-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  assert.equal(assertParallelPreparationJoined(dir),null);
  assert.equal(preparedTalkcraftFile(dir,'legacy file'),'legacy file');
  fs.mkdirSync(path.join(dir,'qa'));const input=path.join(dir,'input'),asset=path.join(dir,'staged');
  fs.writeFileSync(input,'approved');fs.writeFileSync(asset,'original card');
  const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const report={schema:'talkcraft-parallel-preparation-v1',pid:process.pid,status:'done',inputs:{[input]:hash(input)},
    lanes:[{status:'done',assets:[{source:'card',file:asset,sha256:hash(asset)}]}]};
  fs.writeFileSync(path.join(dir,'qa/parallel-preparation.json'),JSON.stringify(report));
  assert.equal(preparedTalkcraftFile(dir,'card'),asset);
  const resolver=createPreparedTalkcraftResolver(dir);assert.equal(resolver('card'),asset);
  fs.writeFileSync(asset,'modified');assert.equal(readParallelPreparation(dir).status,'failed');
  assert.throws(()=>resolver('card'),/使用期间发生变化/);
  assert.throws(()=>assertParallelPreparationJoined(dir),/准备尚未通过/);
  fs.writeFileSync(asset,'original card');fs.writeFileSync(input,'new approval');
  assert.equal(readParallelPreparation(dir).status,'stale');assert.throws(()=>preparedTalkcraftFile(dir,'card'),/不能消费/);
});
test('口型验收后必须汇合准备分支，失败时不能进入全量预检或搭建场景',()=>{
  const run={inputReady:true,wordTimingReady:true,shotbook:true,semanticPassed:true,candidatesReady:true,
    digitalHumanGenerationPlanned:true,mediaPreparationPassed:true,planningPassed:true,storyboardApproved:true,
    digitalHuman:{ready:true},mediaPreflightPassed:true,parallelPreparation:{status:'failed',error:'素材缺失'}};
  let control=talkcraftControlState(run,null);assert.equal(control.nextStage,null);assert.match(control.waitingFor,/素材缺失/);
  control=talkcraftControlState({...run,parallelPreparation:{status:'done'}},null);assert.equal(control.nextStage,'preflight');
});
test('原任务恢复成功后关闭旧的数字人失败提示，继续口型验收而非停在旧错误',()=>{
  const run={inputReady:true,wordTimingReady:true,shotbook:true,semanticPassed:true,candidatesReady:true,
    digitalHumanGenerationPlanned:true,mediaPreparationPassed:true,planningPassed:true,storyboardApproved:true,
    digitalHuman:{ready:true},mediaPreflightPassed:false,parallelPreparation:{status:'done'}};
  const control=talkcraftControlState(run,{code:'TASK_FAILED',task:{name:'talkcraft-digital-human'}});
  assert.equal(control.lastFailure,null);assert.equal(control.nextStage,'host-preflight');
});
test('旧服务读取真实准备报告需核对审批版本，前端不会自行推进主节点',async()=>{
  const code=fs.readFileSync(new URL('./talkcraft-progress-ui.js',import.meta.url),'utf8');
  const approval=Buffer.from('approved version');const hash=createHash('sha256').update(approval).digest('hex');
  let report={schema:'talkcraft-parallel-preparation-v1',runId:'11111111-1111-4111-8111-111111111111',approvalSha256:hash,status:'done',lanes:[]};
  const c=vm.createContext({crypto:webcrypto,AbortSignal,fetch:async url=>url.endsWith('parallel-preparation.json')?
    {ok:true,status:200,json:async()=>report}:{ok:true,arrayBuffer:async()=>approval}});vm.runInContext(code,c);
  const run={runId:report.runId,digitalHumanGenerationPlanned:true,storyboardApproved:true};
  assert.equal((await c.readTalkcraftParallelDisplay(run)).status,'done');
  report={...report,approvalSha256:'wrong'};assert.equal((await c.readTalkcraftParallelDisplay(run)).status,'stale');
});
