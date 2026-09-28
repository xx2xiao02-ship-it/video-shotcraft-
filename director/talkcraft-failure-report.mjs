import {randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {talkcraftProject} from './talkcraft-status.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = file => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;

export function buildTalkcraftFailureReport(root, runId, task) {
  const project = talkcraftProject(root, runId);
  const source = readJson(path.join(project, 'source-run.json')) || {};
  const timing = readJson(path.join(project, 'audio', 'timestamps.json'));
  const sentences = Array.isArray(timing?.sentences) ? timing.sentences : [];
  const low = sentences.filter(sentence => !Number.isFinite(sentence.match) || sentence.match < 0.9);
  const matches = sentences.map(sentence => sentence.match).filter(Number.isFinite);
  const logs = (task.logs || []).join('\n');
  const edgeNoAudio = /Edge TTS failed \(NoAudioReceived:/u.test(logs);
  const alignmentFailed = /Aligned sentence \d+ failed|match<0\.90/u.test(logs) || low.length > 0;
  const failedChecks = logs.split(/\r?\n/u).map(line => line.trim())
    .filter(line => /^\[[^\]]+\]\s+FAIL:/u.test(line));
  const preflightFailed = String(task.name || '').includes('preflight') && failedChecks.length > 0;
  const audioFile = path.join(project, 'audio', 'full.mp3');
  const script = existsSync(path.join(project, 'input.txt')) ? readFileSync(path.join(project, 'input.txt'), 'utf8') : '';
  const contentWarning = /显著降低你真正学习它的概率|记忆通道全部关闭/u.test(script)
    ? '本次输入仍含此前已确认需要修正的研究表述，不能直接进入成片。' : null;
  const code = alignmentFailed ? 'ALIGNMENT_QUALITY_GATE' : edgeNoAudio ? 'VOICE_PROVIDER_NO_AUDIO' :
    preflightFailed ? 'TALKCRAFT_PREFLIGHT_FAILED' : 'TASK_FAILED';
  const cause = alignmentFailed
    ? `字级对齐未通过：${low.length}/${sentences.length} 句匹配率低于 0.90，不能用这份时间戳编导。`
    : edgeNoAudio ? '在线配音未返回音频，任务未取得可用配音。'
    : preflightFailed ? `分镜预检未通过：${failedChecks.length} 项检查失败。`
    : '任务未通过当前阶段的校验。';
  const actions = alignmentFailed ? [
    '先试听本次已保存的配音，确认离线音色是否准确朗读原稿；不要覆盖现有音频。',
    '如配音准确，在独立输出中换用更可靠的对齐方式，并逐句复核匹配率达到 0.90。',
    '内容继续制作前改用已批准的研究校正版；在线配音恢复后如需重配音，应新建独立运行。',
  ] : preflightFailed ? [
    '按“具体失败项”补齐 SHOTBOOK 的素材行、选卡行和语义承载；不要用占位内容绕过预检。',
    '更新分镜后重新运行预检；通过前不会开放样板镜和整片渲染。',
  ] : [
    '保留本次运行和日志，核对失败阶段的输入与服务状态。',
    '确认原因后只处理失败单元，不覆盖已成功素材。',
  ];
  return {schema:'talkcraft-failure-report-v1', runId, createdAt:new Date().toISOString(),
    task:{id:task.id ?? null, name:task.name || 'talkcraft', exitCode:task.exitCode ?? null},
    code, title:alignmentFailed ? '字级对齐失败' : edgeNoAudio ? '配音服务未返回音频' :
      preflightFailed ? '分镜预检未通过' : '任务处理失败',
    cause, evidence:{edgeTtsNoAudio:edgeNoAudio, fallbackVoice:source.voiceEngine || null,
      audioSaved:existsSync(audioFile) && statSync(audioFile).size > 0,
      audioSeconds:source.totalFrames && source.fps ? source.totalFrames/source.fps : null,
      sentences:sentences.length, belowThreshold:low.length,
      minimumMatch:matches.length ? Math.min(...matches) : null,
      maximumMatch:matches.length ? Math.max(...matches) : null},
    contentWarning, failedChecks, actions,
    technicalTail:logs.split(/\r?\n/u).map(line => line.trim()).filter(Boolean).slice(-12)};
}

export function writeTalkcraftFailureReport(root, runId, task) {
  const report = buildTalkcraftFailureReport(root, runId, task);
  const directory = path.join(talkcraftProject(root, runId), 'qa', 'failures');
  mkdirSync(directory, {recursive:true});
  const file = path.join(directory, `${Date.now()}-${randomUUID()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n', {encoding:'utf8', flag:'wx'});
  return {file, report};
}

export function latestTalkcraftFailureReport(root, runId) {
  const directory = path.join(talkcraftProject(root, runId), 'qa', 'failures');
  if (!existsSync(directory)) return null;
  for (const file of readdirSync(directory).filter(name => name.endsWith('.json'))
    .sort((a,b) => statSync(path.join(directory,b)).mtimeMs-statSync(path.join(directory,a)).mtimeMs)) {
    try {
      const report = readJson(path.join(directory, file));
      if (report?.schema === 'talkcraft-failure-report-v1' && report.runId === runId) return report;
    } catch {}
  }
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runId = process.argv[2] || '';
  const taskId = Number(process.argv[3]);
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 8774}/api/task?id=${taskId}&since=0`);
  const task = await response.json();
  if (!response.ok || !task.done || task.exitCode === 0 || task.runId !== runId) throw new Error('Matching failed task not found');
  console.log(JSON.stringify(writeTalkcraftFailureReport(ROOT, runId, {...task, id:taskId, name:'talkcraft-bootstrap'}), null, 2));
}
