// The user has opted into a 60-second sample review window. This gate records
// that policy separately from manual acceptance and never bypasses production QA.
export const SAMPLE_REVIEW_MS = 60_000;

export function sampleReviewEligible(run) {
  return run?.provenance?.verified === true && run.sample === true && !run.sampleApproved &&
    run.nextStage === 'approve-sample' && !run.activeTask && !run.lastFailure &&
    !run.intervention && !(run.blockers?.length) && !run.storyboardAdjustmentPending &&
    !run.factReview?.revisionPending && /^[a-f0-9]{64}$/i.test(run.sampleSha256 || '');
}

export function createSampleReviewGate({readRun, readRecord, writeRecord, approve,
  now = Date.now, owner = 'console'}) {
  const pending = new Set(), locks = new Set();
  const save = (id, record) => { writeRecord(id, record); return record; };
  const current = (id, hash) => {
    const run = readRun(id);
    if (!sampleReviewEligible(run)) throw Error('当前样片不能自动确认，请检查后端状态');
    if (hash !== run.sampleSha256) throw Error('样片版本已变化，请重新加载当前样片');
    const record = readRecord(id);
    if (record?.sampleSha256 === hash && record.owner !== owner && ['countdown','approving'].includes(record.state))
      throw Error('当前样片正在另一个操作台审核，请返回原操作台');
    return run;
  };
  function view(id, suppliedRun) {
    const run = suppliedRun || readRun(id), record = readRecord(id);
    const same = record?.sampleSha256 === run.sampleSha256;
    const foreign = same && record.owner !== owner && ['countdown','approving'].includes(record.state);
    const eligible = sampleReviewEligible(run) && !foreign;
    const state = run.sampleApproved ? 'approved' : !eligible ? 'unavailable' :
      same ? record.state : 'ready';
    return {state, eligible, sampleSha256:run.sampleSha256 || null,
      durationSeconds:SAMPLE_REVIEW_MS / 1000, serverNow:now(),
      dueAt:state === 'countdown' ? record.dueAt : null,
      remainingSeconds:state === 'countdown' ? Math.max(0, Math.ceil((record.dueAt-now())/1000)) : null,
      reason:foreign ? '当前样片正在另一个操作台审核' : same ? record.reason || null : null};
  }
  function start(id, hash, resume = false) {
    current(id, hash);
    const record = readRecord(id);
    if (record?.sampleSha256 === hash) {
      if (record.state === 'countdown') {pending.add(id);return view(id);}
      if (record.state === 'paused' && !resume) return view(id);
      if (record.state === 'approving') throw Error('正在确认当前样片，请稍候');
    }
    const time = now();
    save(id, {schema:'talkcraft-sample-review-v1', owner, sampleSha256:hash,
      policy:'visible-sample-timeout-60s', state:'countdown', startedAt:time,
      dueAt:time + SAMPLE_REVIEW_MS, reason:null});
    pending.add(id);return view(id);
  }
  function pause(id, hash, reason = '已暂停自动确认') {
    current(id, hash);
    if (locks.has(id)) throw Error('样片确认已开始，请刷新后端状态');
    const prior = readRecord(id);
    save(id, {...(prior?.sampleSha256 === hash ? prior : {}),
      schema:'talkcraft-sample-review-v1', owner, sampleSha256:hash,
      state:'paused', dueAt:null, reason, pausedAt:now()});
    pending.delete(id);return view(id);
  }
  async function confirm(id, hash, method = 'manual') {
    if (locks.has(id)) return view(id);
    current(id, hash);
    const prior = readRecord(id);
    if (method === 'timeout' && (prior?.state !== 'countdown' || prior.sampleSha256 !== hash || now() < prior.dueAt))
      throw Error('样片审核倒计时尚未结束');
    locks.add(id);
    const record = {...(prior?.sampleSha256 === hash ? prior : {}),
      schema:'talkcraft-sample-review-v1', owner, sampleSha256:hash,
      state:'approving', method, confirmedAt:now()};
    try {
      save(id, record);
      await approve(id, hash, method);
      save(id, {...record, state:'approved', dueAt:null});
      pending.delete(id);return view(id);
    } catch (error) {
      save(id, {...record, state:'paused', dueAt:null, reason:String(error.message || error)});
      pending.delete(id);throw error;
    } finally {locks.delete(id);}
  }
  function restore(id) {
    const record = readRecord(id);
    if (record?.owner !== owner) return;
    if (record.state === 'countdown') pending.add(id);
    // After an interrupted confirmation, re-read actual acceptance first. Never
    // assume an interrupted request succeeded or repeatedly submit it.
    if (record.state === 'approving') {
      const run = readRun(id);
      save(id, {...record, state:run.sampleApproved && run.sampleSha256 === record.sampleSha256 ? 'approved' : 'paused',
        dueAt:null, reason:'服务恢复后已核对样片确认状态'});
    }
  }
  async function tick() {
    for (const id of pending) {
      if (locks.has(id)) continue;
      const record = readRecord(id), run = readRun(id);
      if (record?.state !== 'countdown' || record.owner !== owner) {pending.delete(id);continue;}
      if (!sampleReviewEligible(run) || record.sampleSha256 !== run.sampleSha256) {
        save(id, {...record, state:run.sampleApproved && record.sampleSha256 === run.sampleSha256 ? 'approved' : 'paused',
          dueAt:null, reason:'样片版本或后端状态变化，已停止自动确认'});
        pending.delete(id);continue;
      }
      if (now() >= record.dueAt) {
        try {await confirm(id, record.sampleSha256, 'timeout');} catch {/* Reason is persisted; no automatic retry. */}
      }
    }
  }
  return {view, start, pause, confirm, restore, tick};
}
