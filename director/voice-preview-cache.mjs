import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {validateSpeechRate} from './voice-speed.mjs';

export function voicePreviewFile(root, speakerId, text, speechRate = 0) {
  const rate = validateSpeechRate(speechRate);
  const speaker = String(speakerId || '').trim();
  if (!/^[A-Za-z0-9_-]{2,256}$/u.test(speaker)) throw new Error('音色 ID 无效');
  const digest = createHash('sha256').update(`${speaker}\0${text}${rate ? `\0${rate}` : ''}`).digest('hex').slice(0, 16);
  return path.join(root, 'materials', '_voice-previews', `${speaker.slice(0, 48)}-${digest}.mp3`);
}

function validMp3(audio) {
  return audio.length >= 128 && (audio.toString('ascii', 0, 3) === 'ID3' ||
    audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0);
}

function readPreview(file) {
  if (!existsSync(file)) return null;
  const audio = readFileSync(file);
  if (!validMp3(audio)) throw new Error('已有试听文件无效，请检查文件；未重新调用火山接口');
  return audio;
}

export function createVoicePreviewCache(root, text, synthesize) {
  const pending = new Map();
  const read = (speakerId, speechRate = 0) => readPreview(voicePreviewFile(root, speakerId, text, speechRate));
  async function getOrCreate(speakerId, speechRate = 0) {
    speechRate = validateSpeechRate(speechRate);
    const file = voicePreviewFile(root, speakerId, text, speechRate);
    const existing = readPreview(file);
    if (existing) return existing;
    if (pending.has(file)) return pending.get(file);
    const request = (async () => {
      const audio = await synthesize({text, speakerId, speechRate});
      if (!Buffer.isBuffer(audio) || !validMp3(audio)) throw new Error('火山接口未返回有效试听音频');
      mkdirSync(path.dirname(file), {recursive:true});
      try { writeFileSync(file, audio, {flag:'wx'}); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      return readPreview(file);
    })().finally(() => pending.delete(file));
    pending.set(file, request);
    return request;
  }
  return {read, getOrCreate};
}
