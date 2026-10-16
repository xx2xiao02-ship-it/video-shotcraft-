import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RunningHubInfiniteTalkTransport} from './runninghub-infinitetalk.mjs';
import {runningHubRuntimeConfig} from './api-center.mjs';
import {createCombinedDigitalHumanAudio, planCombinedDigitalHumanAudio,
  splitCombinedDigitalHumanVideo} from './b-mode-digital-human-batch.mjs';
import {digitalHumanShotsHash, fileSha256} from './talkcraft-digital-human-plan.mjs';
import {assertTalkcraftDigitalHumanAdmission} from './talkcraft-digital-human-admission.mjs';
import {prepareHostFramerate} from './talkcraft-host-framerate.mjs';

const ROOT = process.env.SHOTCRAFT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// RunningHub 输出的是带绿幕的普通 MP4。B 模式渲染前必须把绿幕转换为
// 带 alpha 的 WebM，不能把绿幕视频直接叠到背景上造成过曝/色块。
export function createTransparentDigitalHuman(input, output) {
  if (!existsSync(input)) throw new Error(`数字人源视频不存在：${input}`);
  if (existsSync(output)) throw new Error(`透明数字人素材已存在，拒绝覆盖：${output}`);
  execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-i',input,
    // Upstream host-footage.md §2: RGB-radius keys erase the dark shirt/skin.
    // Green dominance removes the screen while preserving opaque body pixels.
    '-vf',"format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255-clip((g(X,Y)-max(r(X,Y),b(X,Y))-6)*24,0,255)',despill=type=green:mix=0.18:expand=0.1,boxblur=0:0:0:0:1:1,format=yuva420p",
    '-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-auto-alt-ref','0',output],
    {stdio:'inherit'});
  const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-select_streams','v:0',
    '-show_entries','stream=codec_name,pix_fmt,width,height,nb_frames:stream_tags=alpha_mode','-of','json',output], {encoding:'utf8'}));
  const stream = probe.streams?.[0];
  if (stream?.codec_name !== 'vp9' || stream?.tags?.alpha_mode !== '1')
    throw new Error(`透明数字人素材未生成 alpha WebM：${output}`);
  return {output, codec:stream.codec_name, pixelFormat:stream.pix_fmt, frames:Number(stream.nb_frames || 0)};
}
export async function generateTalkcraftDigitalHuman({root = ROOT, runId, provider = null, resumeExisting=false}) {
if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId)) throw new Error('Invalid TalkCraft run ID');
const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
const reportFile = path.join(project, 'digital-human-report.json');
if (existsSync(reportFile)&&!resumeExisting) throw new Error('数字人任务记录已存在；拒绝重复提交付费任务');
if(resumeExisting&&!existsSync(reportFile))throw Error('恢复缺少原任务记录，不允许新建任务');
const plan = assertTalkcraftDigitalHumanAdmission(root, runId);
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
const shotsHash = digitalHumanShotsHash(path.join(project, 'remotion', 'shots.json'));
const audioHash = fileSha256(sourceAudio);
const mediaDir = path.join(project, 'remotion', 'public', 'digital-human');
if (existsSync(mediaDir)&&!resumeExisting) throw new Error('数字人素材目录已存在；拒绝覆盖已有素材');
const config = provider ? null : runningHubRuntimeConfig();
const transport = provider || new RunningHubInfiniteTalkTransport({apiKey:config.apiKey, appId:config.appId,
  baseUrl:config.baseUrl, maxWaitMs:config.maxWaitMs, pollIntervalMs:config.pollIntervalMs});
mkdirSync(mediaDir, {recursive:true});
const report = resumeExisting?JSON.parse(readFileSync(reportFile,'utf8')):{schema:'talkcraft-digital-human-v1', runId, mode:plan.mode, fps:30,
  shotsHash, audioHash, status:'PREPARING', taskIds:[], units:plan.units.map(unit => ({...unit, status:'PENDING'}))};
if(resumeExisting){
  if(report.status==='SUCCESS'||report.shotsHash!==shotsHash||report.audioHash!==audioHash||report.mode!==plan.mode||
    report.units.length!==plan.units.length||report.units.some((u,i)=>u.fromFrame!==plan.units[i].fromFrame||u.durationInFrames!==plan.units[i].durationInFrames||JSON.stringify(u.shotIds)!==JSON.stringify(plan.units[i].shotIds)))
    throw Error('恢复任务与当前审核版本不一致，或任务已经成功，拒绝继续');
  if(report.status==='SUBMITTING')throw Error('存在提交结果未知的任务，须先核对供应商，不可重提');
  const backup=reportFile+'.before-optical-recovery.json';
  if(!existsSync(backup))writeFileSync(backup,readFileSync(reportFile),{flag:'wx'});
  report.recoveryMethod='reuse-provider-task-ids-and-optical-flow';
  report.recoveryVersion=new Date().toISOString().replace(/[:.]/g,'-');
}
const save = () => writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
save();
try {
  const fullWav = path.join(mediaDir, 'full.wav');
  if(!existsSync(fullWav))execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-i',sourceAudio,
    '-ar','48000','-ac','2','-c:a','pcm_s16le',fullWav]);
  const packed = planCombinedDigitalHumanAudio(plan.units);
  const batches = plan.mode === 'combined' ? [packed] : packed.map(segment => [{...segment, fromFrame:0}]);
  for (const [index, batch] of batches.entries()) {
    const audioFile = path.join(mediaDir, `input-${index + 1}.wav`);
    if(!existsSync(audioFile))createCombinedDigitalHumanAudio(fullWav, audioFile, batch);
    const avatarIndex = stableChoice(plan.mode === 'combined' ? runId : `${runId}:${index}`, avatars.length);
    for (const segment of batch) report.units[segment.index].avatarIndex = avatarIndex;
    save();
    // An earlier provider task can take minutes. Recheck approval before each
    // additional submission; do not spend against a changed plan or voice.
    assertTalkcraftDigitalHumanAdmission(root, runId);
    if (digitalHumanShotsHash(path.join(project, 'remotion', 'shots.json')) !== shotsHash || fileSha256(sourceAudio) !== audioHash)
      throw new Error('分镜或配音在生成期间发生变化；已保留任务记录，停止后续提交');
    let taskId=report.units[batch[0].index].taskId;
    if(taskId&&!report.taskIds.includes(taskId))throw Error('已有任务号与供应商提交记录不一致，拒绝重复提交');
    if(!taskId){
      if(batch.some(segment=>report.units[segment.index].status!=='PENDING'))throw Error('片段提交状态不明确，不能重新提交');
      report.status='SUBMITTING';
      for(const segment of batch)report.units[segment.index].status='SUBMITTING';
      save();
      const created=await transport.create({imageBytes:readFileSync(avatars[avatarIndex]),audioBytes:readFileSync(audioFile),
        imageName:'avatar.png',audioName:`talkcraft-${index+1}.wav`});
      taskId=created.taskId;report.taskIds.push(taskId);
    }
    report.status = 'RUNNING';
    for (const segment of batch) {
      const unit = report.units[plan.mode === 'combined' ? segment.index : index];
      unit.taskId = taskId;
      unit.status = 'RUNNING';
    }
    save();
    const raw = path.join(mediaDir, `provider-${index + 1}.mp4`);
    if(!existsSync(raw)){
    const result = await transport.waitForResult(taskId, {onUpdate:update => {
      report.providerStatus = update.status;
      save();
    }});
    writeFileSync(`${raw}.part`, await transport.download(result.outputUrl));
    execFileSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=codec_name',
      '-of','json',`${raw}.part`]);
    renameSync(`${raw}.part`, raw);
    }
    const normalized=prepareHostFramerate(raw,path.join(mediaDir,`provider-${index+1}-optical30.mp4`));
    report.units[batch[0].index].frameratePreparation=normalized;save();
    const targets = batch.map(segment => path.join(mediaDir, `unit-${segment.index + 1}${resumeExisting?'-recovered-'+report.recoveryVersion:''}.mp4`));
    const split = splitCombinedDigitalHumanVideo(normalized.file, targets, batch);
    batch.forEach((segment, partIndex) => {
      const unit = report.units[segment.index];
      if (split[partIndex].frames !== unit.durationInFrames) {
        throw new Error(`第 ${unit.index + 1} 个数字人片段帧数不足`);
      }
      unit.status = 'SUCCESS';
      unit.frames = split[partIndex].frames;
      unit.file = `digital-human/${path.basename(targets[partIndex])}`;
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
      const input = path.join(project,'remotion/public',unit.file);
      execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-i',input,
        '-vf',`trim=start_frame=${offset}:end_frame=${offset + frames},setpts=PTS-STARTPTS`,
        '-an','-c:v','libx264','-pix_fmt','yuv420p',target]);
      const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-select_streams','v:0',
        '-show_entries','stream=nb_frames','-of','json',target], {encoding:'utf8'}));
      if (Number(probe.streams?.[0]?.nb_frames) !== frames) throw new Error(`人物镜头 ${shotId} 切分帧数不符`);
      offset += frames;
    }
  }
  for (const unit of report.units) {
    for (const shotId of unit.shotIds) {
      const sourceVideo = path.join(mediaDir, `${shotId}.mp4`);
      const transparent = path.join(mediaDir, `${shotId}-transparent.webm`);
      const result = createTransparentDigitalHuman(sourceVideo, transparent);
      const entry = report.units.find(item => item.shotIds.includes(shotId));
      if (entry) entry.transparentFiles = {...entry.transparentFiles, [shotId]: `digital-human/${shotId}-transparent.webm`};
      report.lastTransparent = result;
      save();
    }
  }
  report.status = 'SUCCESS';
  delete report.error;
  save();
  console.log(JSON.stringify({runId, mode:plan.mode, taskIds:report.taskIds, units:report.units.length}));
  return report;
} catch (error) {
  const message = String(error.message || error);
  const stillRunning = /任务超过\s*\d+\s*秒仍为\s*(RUNNING|QUEUED|PENDING)/u.test(message);
  report.status = stillRunning ? 'RUNNING' : 'FAILED';
  report.providerStatus = stillRunning ? (message.match(/仍为\s*(RUNNING|QUEUED|PENDING)/u)?.[1] || 'RUNNING') : report.providerStatus;
  report.error = stillRunning ? '供应商长任务仍在生成，继续查询已有 taskId；不会重复提交。' : message.slice(0, 500);
  save();
  if (!stillRunning) throw error;
}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateTalkcraftDigitalHuman({runId:process.argv[2] || '',resumeExisting:process.argv.includes('--resume-authorized')});
}
