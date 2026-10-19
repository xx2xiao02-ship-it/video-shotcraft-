// 只衔接本地阶段；费用授权、创作审核与失败重试均保留显式边界。
export const LOCAL_AUTO_STAGES = new Set(['word-timing', 'semantic-check', 'editorial-check', 'candidates',
  'planning-check','media-preflight','host-preflight','preflight', 'scaffold', 'sample', 'render-all', 'qa', 'deliver']);

export function automaticTalkcraftStage(run) {
  if(run?.continuationPolicy?.enabled===true&&['approve-final','deliver'].includes(run.nextStage))return null;
  const revisionPreparation=run?.editorialChecked===true&&['media-preflight','candidates','planning-check'].includes(run.nextStage);
  const delegatedApproval=run?.nextStage==='approve-storyboard'&&run.continuationPolicy?.enabled===true&&run.planningPassed===true;
  if (!run?.provenance?.verified || run.activeTask || run.lastFailure || run.failureReport ||
      run.storyboardAdjustmentPending&&!revisionPreparation&&!delegatedApproval || run.factReview?.revisionPending) return null;
  if(run.nextStage==='digital-human'&&run.digitalHumanAutomation?.enabled===true&&
    run.planningPassed===true&&run.storyboardApproved===true)return 'digital-human';
  if(run.nextStage==='approve-storyboard'&&run.continuationPolicy?.enabled===true&&run.planningPassed===true)return 'approve-storyboard';
  return LOCAL_AUTO_STAGES.has(run.nextStage) ? run.nextStage : null;
}

export function parallelPreparationAllowed(run){
  return run?.provenance?.verified===true&&run.digitalHumanGenerationPlanned===true&&
    run.storyboardApproved===true&&run.planningPassed===true&&!run.storyboardAdjustmentPending&&
    !run.factReview?.revisionPending&&(!run.parallelPreparation||run.parallelPreparation.status==='stale')&&
    run.activeTask?.name==='talkcraft-digital-human'&&run.activeTask.status==='running';
}

export function createTalkcraftAutoAdvance({readRun, readRecord, writeRecord, queueStage, port,prepareParallel,correct}) {
  const runs = new Set(), locks = new Set();
  const save = (runId, record, changes) => {
    const next = {...record, ...changes};
    if (JSON.stringify(next) !== JSON.stringify(record)) writeRecord(runId, next);
    return next;
  };
  function enable(runId) {
    writeRecord(runId, {schema:'talkcraft-auto-advance-v1', enabled:true, port,
      state:'ready', lastStage:null, lastTaskId:null, error:null});
    runs.add(runId);
  }
  function restore(runId) {
    const record = readRecord(runId);
    if (record?.enabled && record.port === port) runs.add(runId);
  }
  async function advance(runId) {
    if (locks.has(runId)) return;
    locks.add(runId);
    let record;
    try {
      record = readRecord(runId);
      if (!record?.enabled || record.port !== port) return;
      const run = await readRun(runId);
      if(correct&&!run.activeTask&&(run.lastFailure||run.failureReport)){
        const correction=await correct(runId,run);
        save(runId,record,{state:correction.decision?.state||'needs-repair',waitingFor:correction.decision?.reason||run.waitingFor,
          correction:correction.decision,error:correction.decision?.state==='needs-repair'?correction.decision.reason:null});
        return;
      }
      if(prepareParallel&&parallelPreparationAllowed(run)){
        save(runId,record,{state:'running',waitingFor:'RunningHub 与本地准备并行执行'});
        await prepareParallel(runId);
        return;
      }
      const stage = automaticTalkcraftStage(run);
      if (!stage) {
        save(runId, record, {state:run.activeTask ? 'running' : run.lastFailure || run.failureReport ? 'blocked' : 'waiting',
          waitingFor:run.waitingFor || null});
        return;
      }
      // 成功退出但产物未推进也必须暂停，不能反复启动同一阶段。
      if (record.lastStage === stage && record.lastTaskId != null) {
        save(runId, record, {state:'blocked', error:`${stage} 执行后状态未推进，请检查产物；未自动重试。`});
        return;
      }
      save(runId, record, {state:'starting', waitingFor:run.waitingFor || null});
      const task = await queueStage({runId, stage});
      save(runId, record, {state:'running', lastStage:stage, lastTaskId:task.id, error:null});
    } catch (error) {
      if (record) save(runId, record, {enabled:false, state:'blocked', error:String(error.message || error)});
    } finally { locks.delete(runId); }
  }
  return {enable, restore, advance, tick:async () => {
    for (const runId of runs) await advance(runId);
  }};
}
