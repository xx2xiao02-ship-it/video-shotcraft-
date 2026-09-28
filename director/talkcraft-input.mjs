import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {copyFileSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const VOICES = new Set(['zh-CN-YunxiNeural', 'zh-CN-XiaoxiaoNeural']);
const VOICE_MODES = new Set(['standard', 'volcengine-clone', 'volcengine-tts2']);

export function splitTalkcraftSentences(text) {
  return (text.replace(/\r/gu, '').match(/[^。！？!?\n]+[。！？!?]?/gu) || [])
    .map(sentence => sentence.trim()).filter(Boolean);
}

export function createTalkcraftInput(root, {text, voice, voiceMode = 'standard', speakerId = '', avatarBytes, generationMode = 'segments'}) {
  const script = typeof text === 'string' ? text.replace(/\r\n/gu, '\n').trim() : '';
  const sentences = splitTalkcraftSentences(script);
  if (!script || script.length > 1200 || !sentences.length) throw new Error('TalkCraft 文案需为 1–1200 字');
  if (!VOICE_MODES.has(voiceMode)) throw new Error('不支持的音色来源');
  if (generationMode !== null && !['segments', 'combined'].includes(generationMode)) throw new Error('不支持的数字人生成方式');
  if (voiceMode === 'standard' && !VOICES.has(voice)) throw new Error('当前仅支持已接通的现成音色');
  if (voiceMode === 'volcengine-clone' && !/^[A-Za-z0-9_-]{2,128}$/u.test(String(speakerId))) {
    throw new Error('火山复刻音色需要有效的 speaker_id');
  }
  if (voiceMode === 'volcengine-tts2' && !/^[A-Za-z0-9_-]{2,256}$/u.test(String(speakerId))) {
    throw new Error('火山语音合成 2.0 需要有效的音色 ID');
  }
  const avatars = Array.isArray(avatarBytes) ? avatarBytes : [avatarBytes];
  if (!avatars.length || avatars.length > 8 || avatars.some(bytes => !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 7*1024*1024)) {
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
  const avatarFiles = avatars.map((bytes, index) => {
    const name = `avatar-${String(index + 1).padStart(2, '0')}.png`;
    execFileSync('ffmpeg', ['-y','-hide_banner','-loglevel','error','-i','pipe:0','-frames:v','1',
      '-vf','scale=1600:1600:force_original_aspect_ratio=decrease','-update','1',
      path.join(project,'assets',name)], {input:bytes, timeout:15000});
    return name;
  });
  copyFileSync(path.join(project,'assets',avatarFiles[0]), path.join(project,'assets','avatar.png'));
  writeFileSync(path.join(project,'input.txt'), script+'\n','utf8');
  writeFileSync(path.join(project,'script.txt'), sentences.join('\n')+'\n','utf8');
  writeFileSync(path.join(project,'script.json'), JSON.stringify({sentences},null,2),'utf8');
  writeFileSync(path.join(project,'source-run.json'), JSON.stringify({schema:'talkcraft-input-v1',
    runId, fps:30, totalFrames:null, voice, voiceMode, speakerId:voiceMode === 'standard' ? null : String(speakerId), isDigitalHuman:false,
    digitalHumanMode:generationMode, avatarFiles,
    visualTextLocale:'zh-CN'},null,2),'utf8');
  writeFileSync(path.join(project,'sources.md'), '# 素材来源\n\n- 角色图：本次用户输入；数字人生成前用作静态占位。\n- 其余素材：待语义标注后逐镜采集并登记。\n','utf8');
  return {runId, project, sentences:sentences.length, characters:script.length};
}
