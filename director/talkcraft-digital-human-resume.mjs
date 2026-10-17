import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RunningHubInfiniteTalkTransport, pickRunningHubVideo} from './runninghub-infinitetalk.mjs';
import {planCombinedDigitalHumanAudio, splitCombinedDigitalHumanVideo} from './b-mode-digital-human-batch.mjs';
import {runningHubRuntimeConfig} from './api-center.mjs';
import {createTransparentDigitalHuman} from './talkcraft-digital-human.mjs';

const ROOT = process.env.SHOTCRAFT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = process.argv[2] || '';
const project = path.join(ROOT, 'director', 'b-mode-runs', runId, 'talkcraft');
const reportFile = path.join(project, 'digital-human-report.json');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const save = report => writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
function frameCount(file) {
  const result = execFileSync('ffmpeg', ['-hide_banner','-nostats','-i',file,'-map','0:v:0','-an','-progress','pipe:1','-f','null','-'], {encoding:'utf8',stdio:['ignore','pipe','ignore']});
  const matches = [...String(result).matchAll(/frame=(\d+)/g)];
  return matches.length ? Number(matches.at(-1)[1]) : 0;
}

export async function resumeTalkcraftDigitalHuman(id = runId) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) throw new Error('Invalid TalkCraft run ID');
  const dir = path.join(ROOT, 'director', 'b-mode-runs', id, 'talkcraft');
  const file = path.join(dir, 'digital-human-report.json');
  if (!existsSync(file)) throw new Error('没有数字人任务记录');
  const report = read(file);
  const taskId = report.taskIds?.[0];
  if (!taskId) throw new Error('数字人任务没有 provider task ID');
  const config = runningHubRuntimeConfig();
  const transport = new RunningHubInfiniteTalkTransport({apiKey:config.apiKey, appId:config.appId, baseUrl:config.baseUrl, maxWaitMs:30000, pollIntervalMs:10000});
  const data = await transport.queryOnce(taskId);
  const status = String(data.status || '').toUpperCase();
  report.providerStatus = status;
  if (status !== 'SUCCESS') {
    report.status = status === 'FAILED' || status === 'CANCELED' ? 'FAILED' : 'RUNNING';
    report.error = status === 'FAILED' || status === 'CANCELED' ? String(data.errorMessage || data.failedReason || 'RunningHub 任务失败') : '本地轮询超时，已恢复为可继续查询状态';
    save(report);
    return {status:report.status, providerStatus:status, taskId};
  }
  const outputUrl = pickRunningHubVideo(data);
  if (!outputUrl) throw new Error('RunningHub 成功但没有 MP4 结果');
  const mediaDir = path.join(dir, 'remotion', 'public', 'digital-human');
  const providerFile = path.join(mediaDir, 'provider-1.mp4');
  if (!existsSync(providerFile)) writeFileSync(providerFile, await transport.download(outputUrl));
  const packed = planCombinedDigitalHumanAudio(report.units);
  const unitFiles = report.units.map(unit => path.join(mediaDir, `unit-${unit.index + 1}.mp4`));
  if (!unitFiles.every(existsSync)) {
    packed.forEach((segment, index) => {
      const output = unitFiles[index];
      execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-i',providerFile,
        '-vf',`fps=30,trim=start_frame=${segment.fromFrame}:end_frame=${segment.fromFrame + segment.durationInFrames},setpts=PTS-STARTPTS`,
        '-an','-c:v','libx264','-pix_fmt','yuv420p',`${output}.part.mp4`]);
      if (frameCount(`${output}.part.mp4`) !== segment.durationInFrames) throw new Error(`数字人单元 ${index + 1} 帧数不符`);
      execFileSync('cmd.exe', ['/d','/c','move','/y',`${output}.part.mp4`,output], {stdio:'ignore'});
    });
  }
  const shots = read(path.join(dir, 'remotion', 'shots.json'));
  for (const unit of report.units) {
    let offset = 0;
    for (const shotId of unit.shotIds) {
      const shot = shots.find(item => item.id === shotId);
      const frames = Math.round(shot.end * 30) - Math.round(shot.start * 30);
      const target = path.join(mediaDir, `${shotId}.mp4`);
      if (!existsSync(target)) execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-i',unitFiles[unit.index],'-vf',`trim=start_frame=${offset}:end_frame=${offset + frames},setpts=PTS-STARTPTS`,'-an','-c:v','libx264','-pix_fmt','yuv420p',target]);
      if (frameCount(target) !== frames) throw new Error(`${shotId} 数字人素材帧数不符`);
      const transparent = path.join(mediaDir, `${shotId}-transparent.webm`);
      if (!existsSync(transparent)) createTransparentDigitalHuman(target, transparent);
      offset += frames;
    }
    unit.status = 'SUCCESS';
    unit.frames = unit.durationInFrames;
  }
  report.status = 'SUCCESS';
  report.outputUrlAvailable = true;
  report.recoveredAt = new Date().toISOString();
  save(report);
  return {status:'SUCCESS', providerStatus:'SUCCESS', taskId, units:report.units.length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await resumeTalkcraftDigitalHuman(runId)));
}
