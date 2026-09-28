import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RunningHubInfiniteTalkTransport} from './runninghub-infinitetalk.mjs';
import {runningHubRuntimeConfig} from './api-center.mjs';
import {createCombinedDigitalHumanAudio, planCombinedDigitalHumanAudio,
  splitCombinedDigitalHumanVideo} from './b-mode-digital-human-batch.mjs';
import {fileSha256, planTalkcraftDigitalHuman} from './talkcraft-digital-human-plan.mjs';

const ROOT = process.env.SHOTCRAFT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function generateTalkcraftDigitalHuman({root = ROOT, runId, provider = null}) {
if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId)) throw new Error('Invalid TalkCraft run ID');
const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
const reportFile = path.join(project, 'digital-human-report.json');
if (existsSync(reportFile)) throw new Error('数字人任务记录已存在；拒绝重复提交付费任务');
const plan = planTalkcraftDigitalHuman(project);
const sourceAudio = path.join(project, 'audio', 'full.mp3');
const source = JSON.parse(readFileSync(path.join(project, 'source-run.json'), 'utf8'));
const avatarFiles = source.avatarFiles?.length ? source.avatarFiles : ['avatar.png'];
const avatars = avatarFiles.map(name => path.join(project, 'assets', path.basename(name)));
if (!existsSync(sourceAudio) || !avatars.every(existsSync)) throw new Error('主配音或角色图缺失');
const stableChoice = (seed, size) => {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % size;
};
const shotsHash = fileSha256(path.join(project, 'remotion', 'shots.json'));
const audioHash = fileSha256(sourceAudio);
const mediaDir = path.join(project, 'remotion', 'public', 'digital-human');
if (existsSync(mediaDir)) throw new Error('数字人素材目录已存在；拒绝覆盖已有素材');
const config = provider ? null : runningHubRuntimeConfig();
const transport = provider || new RunningHubInfiniteTalkTransport({apiKey:config.apiKey, appId:config.appId,
  baseUrl:config.baseUrl, maxWaitMs:config.maxWaitMs, pollIntervalMs:config.pollIntervalMs});
mkdirSync(mediaDir, {recursive:true});
const report = {schema:'talkcraft-digital-human-v1', runId, mode:plan.mode, fps:30,
  shotsHash, audioHash, status:'PREPARING', taskIds:[], units:plan.units.map(unit => ({...unit, status:'PENDING'}))};
const save = () => writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
save();
try {
  const fullWav = path.join(mediaDir, 'full.wav');
  execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-i',sourceAudio,
    '-ar','48000','-ac','2','-c:a','pcm_s16le',fullWav]);
  const packed = planCombinedDigitalHumanAudio(plan.units);
  const batches = plan.mode === 'combined' ? [packed] : packed.map(segment => [{...segment, fromFrame:0}]);
  for (const [index, batch] of batches.entries()) {
    const audioFile = path.join(mediaDir, `input-${index + 1}.wav`);
    createCombinedDigitalHumanAudio(fullWav, audioFile, batch);
    report.status = 'SUBMITTING';
    save();
    const avatarIndex = stableChoice(plan.mode === 'combined' ? runId : `${runId}:${index}`, avatars.length);
    for (const segment of batch) report.units[segment.index].avatarIndex = avatarIndex;
    save();
    const created = await transport.create({imageBytes:readFileSync(avatars[avatarIndex]), audioBytes:readFileSync(audioFile),
      imageName:'avatar.png', audioName:`talkcraft-${index + 1}.wav`});
    report.taskIds.push(created.taskId);
    report.status = 'RUNNING';
    for (const segment of batch) {
      const unit = report.units[plan.mode === 'combined' ? segment.index : index];
      unit.taskId = created.taskId;
      unit.status = 'RUNNING';
    }
    save();
    const result = await transport.waitForResult(created.taskId, {onUpdate:update => {
      report.providerStatus = update.status;
      save();
    }});
    const raw = path.join(mediaDir, `provider-${index + 1}.mp4`);
    writeFileSync(`${raw}.part`, await transport.download(result.outputUrl));
    execFileSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=codec_name',
      '-of','json',`${raw}.part`]);
    renameSync(`${raw}.part`, raw);
    const targets = batch.map(segment => path.join(mediaDir, `unit-${segment.index + 1}.mp4`));
    const split = splitCombinedDigitalHumanVideo(raw, targets, batch);
    batch.forEach((segment, partIndex) => {
      const unit = report.units[segment.index];
      if (split[partIndex].frames !== unit.durationInFrames) {
        throw new Error(`第 ${unit.index + 1} 个数字人片段帧数不足`);
      }
      unit.status = 'SUCCESS';
      unit.frames = split[partIndex].frames;
      unit.file = `digital-human/unit-${unit.index + 1}.mp4`;
      for (const shotId of unit.shotIds) {
        const target = path.join(mediaDir, `${shotId}.mp4`);
        if (existsSync(target)) throw new Error(`人物镜头 ${shotId} 素材已存在`);
      }
      save();
    });
  }
  // Adjacent shots share one provider generation; each shot starts at its own offset in the unit.
  for (const unit of report.units) {
    let offset = 0;
    const shots = JSON.parse(readFileSync(path.join(project, 'remotion', 'shots.json'), 'utf8'));
    for (const shotId of unit.shotIds) {
      const shot = shots.find(item => item.id === shotId);
      const frames = Math.round(shot.end * 30) - Math.round(shot.start * 30);
      const target = path.join(mediaDir, `${shotId}.mp4`);
      const input = path.join(mediaDir, `unit-${unit.index + 1}.mp4`);
      execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-i',input,
        '-vf',`trim=start_frame=${offset}:end_frame=${offset + frames},setpts=PTS-STARTPTS`,
        '-an','-c:v','libx264','-pix_fmt','yuv420p',target]);
      const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-select_streams','v:0',
        '-show_entries','stream=nb_frames','-of','json',target], {encoding:'utf8'}));
      if (Number(probe.streams?.[0]?.nb_frames) !== frames) throw new Error(`人物镜头 ${shotId} 切分帧数不符`);
      offset += frames;
    }
  }
  report.status = 'SUCCESS';
  save();
  console.log(JSON.stringify({runId, mode:plan.mode, taskIds:report.taskIds, units:report.units.length}));
  return report;
} catch (error) {
  report.status = 'FAILED';
  report.error = String(error.message || error).slice(0, 500);
  save();
  throw error;
}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateTalkcraftDigitalHuman({runId:process.argv[2] || ''});
}
