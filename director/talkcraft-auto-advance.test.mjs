import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {automaticTalkcraftStage, createTalkcraftAutoAdvance, LOCAL_AUTO_STAGES} from './talkcraft-auto-advance.mjs';

const ready = nextStage => ({provenance:{verified:true},nextStage});

test('授权推进14时样片按机器门禁委托继续，未授权与人工终审仍停止',()=>{
 const r={...ready('approve-sample'),continuationPolicy:{enabled:true,stopAt:'review'},sample:true,
  preflightPassed:true,storyboardApproved:true,storyboardAdjustmentPending:true};
 assert.equal(automaticTalkcraftStage(r),'approve-sample');
 for(const patch of [{sample:false},{preflightPassed:false},{storyboardApproved:false},
  {continuationPolicy:{enabled:false}},{activeTask:{id:1}},{lastFailure:{code:'failure'}}])
  assert.equal(automaticTalkcraftStage({...r,...patch}),null);
 for(const nextStage of ['approve-final','deliver'])assert.equal(automaticTalkcraftStage({...r,nextStage}),null);
});
function harness(queueOverride) {
  let run = ready('word-timing'), record = null;
  const queued = [];
  const auto = createTalkcraftAutoAdvance({port:18866,
    readRun:()=>run, readRecord:()=>record, writeRecord:(_id, value)=>{record=value;},
    queueStage:async body=>{queued.push(body); return queueOverride ? queueOverride(body) : {id:queued.length};},
  });
  return {auto, queued, setRun:value=>{run=value;}, getRecord:()=>record,
    setRecord:value=>{record=value;}};
}
test('普通阶段允许自动衔接，所有费用和人工审核阶段均停下', () => {
  for (const stage of LOCAL_AUTO_STAGES) assert.equal(automaticTalkcraftStage(ready(stage)),stage);
  for (const stage of ['editorial','digital-human','approve-storyboard','approve-sample','approve-final','fact-revision',null])
    assert.equal(automaticTalkcraftStage(ready(stage)),null);
  for (const blocked of [{activeTask:{id:1}},{lastFailure:{code:'FAILED'}},{failureReport:{}},
    {provenance:{verified:false}},{storyboardAdjustmentPending:true},{factReview:{revisionPending:true}}])
    assert.equal(automaticTalkcraftStage({...ready('preflight'),...blocked}),null);
});
test('未启用的历史任务不执行；明确启用后只串联本地步骤', async () => {
  const h = harness(); await h.auto.advance('run'); assert.equal(h.queued.length,0);
  h.auto.enable('run'); await h.auto.tick();
  assert.deepEqual(h.queued,[{runId:'run',stage:'word-timing'}]);
  h.setRun(ready('editorial')); await h.auto.tick(); assert.equal(h.queued.length,1);
  h.setRun(ready('candidates')); await h.auto.tick(); assert.equal(h.queued[1].stage,'candidates');
  assert.ok(h.queued.every(body=>!body.approveModelCost && !body.approveDigitalHumanCost));
});
test('并发触发只启动一次；产物未推进和阶段失败不会无限重试', async () => {
  const h = harness(); h.auto.enable('run');
  await Promise.all([h.auto.tick(),h.auto.tick(),h.auto.advance('run')]);
  assert.equal(h.queued.length,1);
  await h.auto.tick(); assert.equal(h.queued.length,1);
  assert.equal(h.getRecord().state,'blocked');
  h.setRun({...ready('qa'),lastFailure:{code:'QA_FAILED'}}); await h.auto.tick();
  assert.equal(h.queued.length,1);
});
test('重启只恢复相同端口的明确任务，阶段启动异常暂停', async () => {
  const h = harness(async()=>{throw Error('启动被拒绝');});
  h.setRecord({enabled:true,port:8769}); h.auto.restore('run'); await h.auto.tick();
  assert.equal(h.queued.length,0);
  h.setRecord({enabled:true,port:18866}); h.auto.restore('run'); await h.auto.tick();
  assert.equal(h.queued.length,1); assert.equal(h.getRecord().enabled,false);
  await h.auto.tick(); assert.equal(h.queued.length,1);
});
test('通过审核后自动衔接渲染；整片 QA 通过仍停在独立审片', async () => {
  const h = harness(); h.auto.enable('run'); h.setRun(ready('approve-sample'));
  await h.auto.tick(); assert.equal(h.queued.length,0);
  h.setRun(ready('render-all')); await h.auto.tick();
  h.setRun(ready('qa')); await h.auto.tick();
  h.setRun({...ready(null),waitingFor:'独立审片'}); await h.auto.tick();
  assert.deepEqual(h.queued.map(item=>item.stage),['render-all','qa']);
});
test('真实异步子进程结束后自动启动下一本地阶段并停在费用边界', async () => {
  let run = ready('candidates'), record, taskNumber = 0;
  const stages = [], children = [];
  const auto = createTalkcraftAutoAdvance({port:18866,
    readRecord:()=>record, writeRecord:(_id,value)=>{record=value;}, readRun:()=>run,
    queueStage:async ({stage})=>{
      stages.push(stage);
      const id = ++taskNumber;
      run = {...run,activeTask:{id}};
      const child = spawn(process.execPath,['-e','process.stdout.write("local-stage-finished")'],{windowsHide:true});
      children.push(new Promise((resolve,reject)=>{
        let output=''; child.stdout.on('data',chunk=>{output+=chunk;});
        child.on('error',reject); child.on('close',code=>{
          if(code!==0 || output!=='local-stage-finished') return reject(Error('本地进程失败'));
          // 候选选卡完成后必须先进入规划校验，再等待分镜人工审核。
          run=ready(stage==='candidates'?'planning-check':'approve-storyboard'); resolve();
        });
      }));
      return {id};
    }});
  auto.enable('run'); await auto.tick(); await children[0];
  await auto.tick(); await children[1]; await auto.tick();
  assert.deepEqual(stages,['candidates','planning-check']);
  assert.equal(record.state,'waiting');
});

test('正式自动推进把失败交给统一修正中心，保留校验结果而不是只停在blocked',async()=>{
 let record={enabled:true,port:18866},called=0,queued=0;
 const auto=createTalkcraftAutoAdvance({port:18866,readRecord:()=>record,writeRecord:(_id,r)=>record=r,
  readRun:()=>({...ready('candidates'),lastFailure:{code:'MATERIAL_FAILED'}}),
  queueStage:()=>{queued++;},correct:async()=>{called++;return {handled:true,decision:{state:'correcting',reason:'当前节点补全'}};}});
 auto.restore('current');await auto.tick();assert.equal(called,1);assert.equal(queued,0);assert.equal(record.state,'correcting');
});


test('修正调度接管阶段标记，恢复后不被此前同名节点的旧任务阻塞；无推进仍不重复',async()=>{
 let record={schema:'talkcraft-auto-advance-v1',enabled:true,port:18866,lastStage:'candidates',lastTaskId:12};
 let run={provenance:{verified:true},lastFailure:{cause:'当前素材问题'},nextStage:null};let queued=0;
 const auto=createTalkcraftAutoAdvance({port:18866,readRecord:()=>record,writeRecord:(_id,r)=>record=r,readRun:()=>run,
  correct:()=>({handled:true,task:{id:15},decision:{state:'ready-to-correct',body:{stage:'editorial-recover'}}}),
  queueStage:({stage})=>{assert.equal(stage,'candidates');queued++;return {id:16};}});
 auto.restore('current');await auto.advance('current');assert.equal(record.lastStage,'editorial-recover');assert.equal(record.lastTaskId,15);
 run={provenance:{verified:true},nextStage:'candidates',editorialChecked:true};
 await auto.advance('current');assert.equal(queued,1);await auto.advance('current');assert.equal(queued,1);assert.equal(record.state,'blocked');
});
