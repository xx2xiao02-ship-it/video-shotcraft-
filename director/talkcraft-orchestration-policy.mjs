// The UI may request continuation, never select a creative or rendering stage.
// Decisions are made from fresh backend state, not from a browser's cached state.
export function selectTalkcraftContinuation(run, body = {}) {
  if (body.intent !== 'continue' || Object.hasOwn(body, 'stage'))
    throw new Error('前端只能提交继续意图，不能指定编导阶段');
  if (run.provenance?.verified !== true)
    throw new Error('B 模式管线来源未核验，请先由编导核对运行记录');
  if(body.repairPresentation===true){
    const repairable=run.qaPassed&&run.nextStage==='approve-final'||run.final===true&&run.nextStage==='qa';
    if(run.activeTask||body.approveModelCost||body.approveDigitalHumanCost||!repairable||run.reviewPassed)throw Error(`展示修正只允许当前待审成片或成片质检阶段的免费修正，不接受并发、费用或已验收版本；当前节点=${run.nextStage||'无'}，成片=${run.final===true}，质检=${run.qaPassed===true}，活动任务=${!!run.activeTask}`);
    return 'presentation-repair';
  }
  if(body.recoverProviderResponse===true&&(!run.nodeRepair?.providerSubmitted||run.nodeRepair.status!=='blocked'||run.nodeRepair.node!=='storyboard-review'))
    throw Error('没有当前07已提交的失败响应可恢复');
  if(body.resumeRevision===true||body.recheckNodeBase===true||body.recoverProviderResponse===true){
    if(run.activeTask||body.approveModelCost||body.reviseStoryboard)throw Error('已有授权恢复不接受并发或追加费用授权');
    return 'planning-repair';
  }
  if(body.recoverExisting===true){
    if(body.reviseStoryboard||body.approveModelCost||!run.editorialResponseSaved||run.shotbook||run.activeTask)
      throw new Error('本地恢复只允许无并发的已保存未落地结果，不接受费用授权');
    return 'editorial-recover';
  }
  if(body.reviseStoryboard===true){
    if(body.approveModelCost!==true||typeof body.authorizationNote!=='string'||body.authorizationNote.trim().length<4)
      throw new Error('分镜修订需要本次明确费用授权');
    if(!(run.shotbook||run.editorialRepairReady===true)||!run.storyboardAdjustmentPending||!run.inputReady||run.activeTask)
      throw new Error('当前任务不满足正式分镜修订条件');
    return 'editorial-revision';
  }
  const revisionPreparation=run.editorialChecked===true&&['media-preflight','candidates','planning-check'].includes(run.nextStage);
  const delegatedApproval=run.nextStage==='approve-storyboard'&&run.continuationPolicy?.enabled===true&&
    run.planningPassed===true&&!run.activeTask&&!run.lastFailure&&!run.failureReport&&!run.factReview?.revisionPending;
  if (run.storyboardAdjustmentPending && !['editorial-recover','editorial-check','semantic-check'].includes(run.nextStage) && !revisionPreparation && !delegatedApproval &&
      !(run.nextStage==='editorial' && body.approveModelCost===true))
    throw new Error('分镜修改要求已记录，等待编导处理并重新预检');
  const stage = run.nextStage;
  const supported = new Set(['recover-timing','recover-alignment','word-timing','semantic-check','editorial','editorial-check','editorial-recover',
    'candidates','planning-check','media-preflight','host-preflight','preflight','scaffold','digital-human','sample','render-all','qa','deliver',...(run.continuationPolicy?.enabled===true?['approve-storyboard']:[])]);
  if (!supported.has(stage)) throw new Error(run.waitingFor || '当前阶段需要审核或修复，不能启动任务');
  if (stage === 'editorial' && body.approveModelCost !== true)
    throw new Error('当前下一步为付费分镜生成，需要本次明确授权');
  if (stage === 'digital-human' && body.approveDigitalHumanCost !== true&&run.digitalHumanAutomation?.enabled!==true)
    throw new Error('当前下一步为付费数字人生成，需要本次明确授权');
  return stage;
}
