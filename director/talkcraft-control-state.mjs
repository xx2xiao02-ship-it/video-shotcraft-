import {isVisualDiagnosticFailure} from './talkcraft-acceptance-policy.mjs';
import {MANAGED_WORKFLOW_NODES,workflowNodeForTask} from './talkcraft-workflow-contract.mjs';
// One recoverable stage contract shared by the console's status readers.
const completed = (run, name) => ({
  'talkcraft-bootstrap':run.inputReady,
  'talkcraft-recover-timing':run.inputReady,
  'talkcraft-recover-alignment':run.inputReady&&run.wordTimingReady,
  'talkcraft-word-timing':run.wordTimingReady,
  'talkcraft-semantic-check':run.semanticPassed,
  'talkcraft-media-preflight':run.mediaPreparationPassed??run.mediaPreflightPassed,
  'talkcraft-editorial':run.semanticPassed && !!run.shotbook && run.editorialChecked!==false,
  'talkcraft-editorial-check':run.semanticPassed && !!run.shotbook && run.editorialChecked!==false,
  'talkcraft-editorial-revision':run.semanticPassed && !!run.shotbook && run.editorialChecked!==false,
  'talkcraft-editorial-recover':run.semanticPassed && !!run.shotbook && run.editorialChecked!==false,
  'talkcraft-candidates':run.candidatesReady,
  'talkcraft-preflight':run.preflightPassed,
  'talkcraft-planning-check':run.planningPassed,
  'talkcraft-host-preflight':run.mediaPreflightPassed,
  'talkcraft-digital-human':run.digitalHuman?.ready,
  'talkcraft-scaffold':run.scaffoldReady??run.workbenchReady,
  'talkcraft-sample':run.sample,
  'talkcraft-render-all':run.final,
  'talkcraft-qa':run.qaPassed,
  'talkcraft-deliver':run.delivery,
})[name] === true;

export function currentFailure(run, report) {
  if (!report || isVisualDiagnosticFailure(report) || completed(run, report.task?.name)) return null;
  // A human approval gate is explicit evidence of the real frontier. A
  // failure recorded by a later node stays on disk as history, but must not
  // block that earlier approval after storyboard/sample inputs were revised.
  const approvalFrontier=run.planningPassed===true&&run.storyboardApproved===false?'storyboard-review':
    run.sample===true&&run.sampleApproved===false?'sample':null;
  if(approvalFrontier){
    const currentIndex=MANAGED_WORKFLOW_NODES.findIndex(node=>node.id===approvalFrontier);
    const failedIndex=MANAGED_WORKFLOW_NODES.findIndex(node=>node.id===workflowNodeForTask(report.task?.name));
    if(failedIndex>currentIndex)return null;
  }
  const active = run.activeTask;
  // A newer retry supersedes the current failure display, while the report stays on disk.
  if (active && ['starting','running','stopping'].includes(active.status) &&
      active.name === report.task?.name &&
      (!Number.isSafeInteger(report.task?.id) || active.id > report.task.id)) return null;
  return report;
}

export function talkcraftControlState(run, report, execution = {ok:true}) {
  const failure = currentFailure(run, report);
  const lastFailure = failure ? {code:failure.code || 'TASK_FAILED', title:failure.title,
    cause:failure.cause || '', task:failure.task || null} : null;
  const state = (nextStage, waitingFor, blockers=[]) => ({nextStage, waitingFor, blockers, lastFailure});
  if (!execution.ok) return state(null, '修复任务启动环境', ['TASK_EXECUTION_UNAVAILABLE']);
  if (run.activeTask && ['starting','running','stopping'].includes(run.activeTask.status))
    return state(null, run.activeTask.name === 'talkcraft-render-all' ? '整片渲染中' : '任务执行中');
  if(failure?.code==='CHINESE_ALIGNMENT_DEPENDENCY')return state('recover-alignment','修复依赖后检查并恢复失败句',['CHINESE_ALIGNMENT_DEPENDENCY']);
  if(run.factReview?.revisionPending)return state('fact-revision','用已批准文案创建校正版',['FACT_SCRIPT_REVISION_REQUIRED']);
  if(run.canRecoverAlignment)return state('recover-alignment','复用配音重对齐失败句',['SENTENCE_ALIGNMENT_FAILED']);
  if (!run.inputReady) return state(run.canRecoverTiming ? 'recover-timing' : null, '配音与时间轴', ['INPUT_NOT_READY']);
  if (!run.wordTimingReady) return state('word-timing', '补齐真实字级时间轴', ['WORD_TIMING_REQUIRED']);
  // Ready sentence annotations must be checked at node 03 before any later
  // editorial recovery or paid request. A failed check requires intervention.
  if (!run.shotbook && !run.semanticPassed && run.semanticReady &&
      failure?.task?.name !== 'talkcraft-semantic-check')
    return state('semantic-check', '校验已有逐句语义，不调用模型');
  if(run.workflowPath==='recorded-host'&&!run.mediaPreflightPassed)return state('media-preflight','检查真人视频素材与原声',['RECORDED_MEDIA_REQUIRED']);
  if(failure?.task?.name==='talkcraft-media-preflight')
    return state(null,'补齐当前素材输入后重新检查；RunningHub 口型按分镜生成',['MEDIA_PREFLIGHT_FAILED']);
  if(!run.shotbook&&run.editorialRepairReady===true)return state(null,'当前分镜校验未通过，等待本次分镜修订费用授权',['EDITORIAL_REVISION_REQUIRED']);
  if(!run.shotbook&&run.editorialResponseSaved)return state('editorial-recover','复用已保存分镜恢复校验，不调用模型',['CACHED_EDITORIAL_RECOVERY']);
  if(!run.shotbook&&run.editorialSubmission?.requiresAuthorization)return state(null,'核对火山接入点和已提交结果；再次调用需要新的单次授权',['EDITORIAL_AUTHORIZATION_USED']);
  if (!run.shotbook) return state('editorial', '生成分镜', ['SHOTBOOK_NOT_READY']);
  if (!run.semanticPassed) return state('editorial-check', '校验已有分镜', ['SEMANTIC_NOT_PASSED']);
  if (run.editorialChecked===false) return state('editorial-check', '完成04分镜校验，文件存在不代表通过', ['EDITORIAL_CHECK_NOT_PASSED']);
  if(run.digitalHumanGenerationPlanned&&!run.mediaPreparationPassed)return state('media-preflight','核对数字人生成输入');
  if (!run.candidatesReady) return state('candidates', '生成候选并完成正式选卡',run.candidateIssues||[]);
  if(!run.planningPassed)return state('planning-check','校验当前候选版本的分镜规划',run.planningIssues||[]);
  if(!run.storyboardApproved)return state('approve-storyboard','审核当前分镜规划');
  if(run.digitalHumanGenerationPlanned){
    if(!run.digitalHuman?.ready)return state('digital-human','按已审核人物区间生成口型');
    if(!run.mediaPreflightPassed)return state('host-preflight','验收已生成的口型视频');
  }
  if (!run.preflightPassed) {
    if(run.parallelPreparation&&run.parallelPreparation.status!=='done')return state(null,
      '并行支线尚未汇合：'+(run.parallelPreparation.error||run.parallelPreparation.status),['PARALLEL_PREPARATION_NOT_PASSED']);
    return state('preflight', '执行 GitHub 原版分镜全量预检', run.preflightIssues || ['PREFLIGHT_NOT_PASSED']);
  }
  if (!(run.scaffoldReady??run.workbenchReady)) return state('scaffold', '搭建渲染工程');
  if (run.digitalHuman?.required && !run.digitalHuman.ready) return state('digital-human', '数字人素材');
  if (!run.sample) return state('sample', '首镜样板');
  if (!run.sampleApproved) return state('approve-sample', '审核首镜样板');
  if (!run.final) return state('render-all', '整片渲染');
  if (!run.qaPassed) return state('qa', '机器质检');
  if (!run.reviewPassed) return state('approve-final', '人工视觉审核', ['HUMAN_VISUAL_REVIEW_REQUIRED']);
  if (!run.delivery) return state('deliver', '交付导出');
  return state(null, '已交付');
}
