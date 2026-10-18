// The UI may request continuation, never select a creative or rendering stage.
// Decisions are made from fresh backend state, not from a browser's cached state.
export function selectTalkcraftContinuation(run, body = {}) {
  if (body.intent !== 'continue' || Object.hasOwn(body, 'stage'))
    throw new Error('前端只能提交继续意图，不能指定编导阶段');
  if (run.provenance?.verified !== true)
    throw new Error('B 模式管线来源未核验，请先由编导核对运行记录');
  if(body.reviseStoryboard===true){
    if(body.approveModelCost!==true||typeof body.authorizationNote!=='string'||body.authorizationNote.trim().length<4)
      throw new Error('分镜修订需要本次明确费用授权');
    if(!run.shotbook||!run.storyboardAdjustmentPending||!run.inputReady||run.activeTask)
      throw new Error('当前任务不满足正式分镜修订条件');
    return 'editorial-revision';
  }
  if (run.storyboardAdjustmentPending && run.nextStage!=='editorial-recover')
    throw new Error('分镜修改要求已记录，等待编导处理并重新预检');
  const stage = run.nextStage;
  const supported = new Set(['recover-timing','recover-alignment','word-timing','editorial','editorial-check','editorial-recover',
    'candidates','planning-check','media-preflight','host-preflight','preflight','scaffold','digital-human','sample','render-all','qa','deliver']);
  if (!supported.has(stage)) throw new Error(run.waitingFor || '当前阶段需要审核或修复，不能启动任务');
  if (stage === 'editorial' && body.approveModelCost !== true)
    throw new Error('当前下一步为付费分镜生成，需要本次明确授权');
  if (stage === 'digital-human' && body.approveDigitalHumanCost !== true)
    throw new Error('当前下一步为付费数字人生成，需要本次明确授权');
  return stage;
}
