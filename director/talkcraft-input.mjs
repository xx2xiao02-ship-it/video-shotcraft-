import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {HOST_LIMIT} from './talkcraft-host-input.mjs';
import {copyFileSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {normalizeTheme} from './theme-contract.mjs';
import {validateSpeechRate} from './voice-speed.mjs';
import {assertNewVoiceSelection} from './talkcraft-voice-contract.mjs';
import {findApprovedFactRevision} from './talkcraft-fact-review.mjs';

export function splitTalkcraftSentences(text) {
  return (text.replace(/\r/gu, '').match(/[^。！？!?\n]+[。！？!?]?/gu) || [])
    .map(sentence => sentence.trim()).filter(Boolean);
}

export function createTalkcraftInput(root, {text, voice, voiceMode, speakerId = '', speechRate = 0, avatarBytes, hostVideoBytes, generationMode = 'segments', enableDigitalHuman = false, themeSnapshot}) {
  const recorded=hostVideoBytes!==undefined&&hostVideoBytes!==null;
  if(recorded&&(!Buffer.isBuffer(hostVideoBytes)||!hostVideoBytes.length||hostVideoBytes.length>HOST_LIMIT))throw Error('真人口播视频不能为空且不能超过 300 MB');
  if(recorded){voiceMode='recorded-original';speechRate=0;generationMode='imported';enableDigitalHuman=true;}
  speechRate = validateSpeechRate(speechRate);
  const theme = normalizeTheme(themeSnapshot);
  const submittedScript = typeof text === 'string' ? text.replace(/\r\n/gu, '\n').trim() : '';
  const factRevision=findApprovedFactRevision(root,submittedScript);
  const script = factRevision?.text || submittedScript;
  const sentences = splitTalkcraftSentences(script);
  if (!script || script.length > 1200 || !sentences.length) throw new Error('TalkCraft 文案需为 1–1200 字');
  const selectedVoice=recorded?{voice:'recorded-original',speakerId:''}:assertNewVoiceSelection({voiceMode,speakerId});
  if (!recorded && generationMode !== null && !['segments', 'combined'].includes(generationMode)) throw new Error('不支持的数字人生成方式');
  if (voiceMode === 'volcengine-clone' && !/^[A-Za-z0-9_-]{2,128}$/u.test(String(speakerId))) {
    throw new Error('火山复刻音色需要有效的 speaker_id');
  }
  if (voiceMode === 'volcengine-tts2' && !/^[A-Za-z0-9_-]{2,256}$/u.test(String(speakerId))) {
    throw new Error('火山语音合成 2.0 需要有效的音色 ID');
  }
  const avatars = recorded?[]:Array.isArray(avatarBytes) ? avatarBytes : [avatarBytes];
  if ((!recorded&&!avatars.length) || avatars.length > 8 || avatars.some(bytes => !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 7*1024*1024)) {
    throw new Error('角色图需为不超过 7 MB 的 PNG、JPG 或 WebP');
  }
  for (const bytes of avatars) {
    const png = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216;
    const webp = bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
    if (!png && !jpeg && !webp) throw new Error('角色图格式不是 PNG、JPG 或 WebP');
  }

  const runId = randomUUID();
  const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  mkdirSync(path.join(project, 'audio'), {recursive:true});
  mkdirSync(path.join(project, 'assets'), {recursive:true});
  mkdirSync(path.join(project, 'remotion', 'public', 'broll'), {recursive:true});
  if(factRevision)mkdirSync(path.join(project,'qa'),{recursive:true});
  const avatarFiles = avatars.map((bytes, index) => {
    const name = `avatar-${String(index + 1).padStart(2, '0')}.png`;
    const target = path.join(project,'assets',name);
    // 已经是 PNG 的角色图无需再次启动 ffmpeg；这也避免 Windows 受限进程上下文在上传阶段触发 spawnSync EPERM。
    if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      writeFileSync(target, bytes);
    } else {
      execFileSync('ffmpeg', ['-y','-hide_banner','-loglevel','error','-i','pipe:0','-frames:v','1',
        '-vf','scale=1600:1600:force_original_aspect_ratio=decrease','-update','1',target], {input:bytes, timeout:15000});
    }
    return name;
  });
  if(recorded)writeFileSync(path.join(project,'assets/host-original.mp4'),hostVideoBytes);
  else copyFileSync(path.join(project,'assets',avatarFiles[0]), path.join(project,'assets','avatar.png'));
  writeFileSync(path.join(project,'input.txt'), script+'\n','utf8');
  writeFileSync(path.join(project,'script.txt'), sentences.join('\n')+'\n','utf8');
  writeFileSync(path.join(project,'script.json'), JSON.stringify({sentences},null,2),'utf8');
  writeFileSync(path.join(project,'source-run.json'), JSON.stringify({schema:'talkcraft-input-v1',
    // These fields are the persisted B-mode contract. The browser may submit values,
    // but it cannot change the orchestrator or renderer after the run is created.
    mode:'B', pipeline:'video-talkcraft', orchestrator:'director/talkcraft-stages.mjs',
    rendererEntry:'src/index.ts', composition:'Main', frontendRole:'parameters-and-observation-only',
    runId, fps:30, totalFrames:null, voice:selectedVoice.voice, voiceMode, speechRate, speakerId:selectedVoice.speakerId, isDigitalHuman:Boolean(enableDigitalHuman),
    workflowPath:recorded?'recorded-host':'planned-runninghub',workflowVersion:2,
    ...(recorded?{hostInputSha256:createHash('sha256').update(hostVideoBytes).digest('hex')}:{}),
    digitalHumanMode:generationMode, avatarFiles, aspectRatio:theme.aspectRatio, themeSnapshot:theme,
    ...(factRevision?{factRevisionApplied:true,factApprovalRunId:factRevision.approvalRunId,
      originalScriptSha256:factRevision.record.originalScriptSha256,
      approvedScriptSha256:factRevision.record.approvedScriptSha256}:{}),
    cardCallsRequired:true,
    visualTextLocale:'zh-CN'},null,2),'utf8');
  if(factRevision){
    writeFileSync(path.join(project,'qa','fact-approved-script.txt'),script+'\n','utf8');
    writeFileSync(path.join(project,'qa','fact-script-approval.json'),JSON.stringify({
      ...factRevision.record,appliedToRunId:runId,appliedAt:new Date().toISOString()
    },null,2)+'\n','utf8');
  }
  writeFileSync(path.join(project,'sources.md'), `# 素材来源\n\n- 角色图：本次用户输入；${enableDigitalHuman ? '作为数字人生成输入，生成前仅作静态预览。' : '仅作为静态角色图，不会调用数字人生成。'}\n- 其余素材：待语义标注后逐镜采集并登记。\n`,'utf8');
  if(recorded)writeFileSync(path.join(project,'sources.md'),'# 素材来源\n\n- 真人口播：用户上传 assets/host-original.mp4；使用视频原声，不合成、不变速。\n- 其他素材按语义采集。\n');
  return {runId, project, sentences:sentences.length, characters:script.length,
    workflowPath:recorded?'recorded-host':'planned-runninghub',
    factRevisionApplied:Boolean(factRevision),factApprovalRunId:factRevision?.approvalRunId||null};
}
