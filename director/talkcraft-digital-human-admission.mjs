import {readTalkcraftStatus, talkcraftProject} from './talkcraft-status.mjs';
import {planTalkcraftDigitalHuman} from './talkcraft-digital-human-plan.mjs';

// Re-read hash-bound gates at each execution boundary. A cached nextStage or an
// existing shots.json is not approval to generate billable person footage.
export function assertTalkcraftDigitalHumanAdmission(root, runId) {
  const status = readTalkcraftStatus(root, runId);
  const missing = [];
  if (!status.inputReady || !status.wordTimingReady) missing.push('配音与字级时间轴');
  if (!status.shotbook || !status.shots) missing.push('SHOTBOOK 分镜编排');
  if (!status.semanticPassed) missing.push('当前分镜语义校验');
  if (!status.planningPassed) missing.push('当前分镜规划校验');
  if (!status.storyboardApproved) missing.push('当前分镜审核');
  if (status.storyboardAdjustmentPending) missing.push('分镜修改要求尚未处理');
  if (!status.digitalHumanGenerationPlanned) missing.push('RunningHub 分镜生成模式');
  if (missing.length) {
    const error = new Error(`RunningHub 依赖未满足：${missing.join('、')}。先完成分镜编排、预检和审核，再按人物出镜区间生成。`);
    error.code = 'DIGITAL_HUMAN_DEPENDENCY_NOT_READY';
    throw error;
  }
  return planTalkcraftDigitalHuman(talkcraftProject(root, runId));
}
