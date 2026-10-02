import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {readStoredProviderConfig} from './provider-config.mjs';
import {validateSpeechRate} from './voice-speed.mjs';

const TTS_URL = process.env.VOLCENGINE_TTS_URL || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
export const CLONE_URL = process.env.VOLCENGINE_CLONE_URL || 'https://openspeech.bytedance.com/api/v3/tts/voice_clone';

const env = (name, fallback = '') => String(process.env[name] || fallback).trim();

export function volcengineVoiceConfig() {
  const stored = readStoredProviderConfig();
  return {
    apiKey: env('VOLCENGINE_TTS_API_KEY', env('VOLCENGINE_API_KEY') || stored.volcengineApiKey),
    ttsResourceId: env('VOLCENGINE_TTS_RESOURCE_ID', stored.volcengineTtsResourceId || 'seed-icl-2.0'),
    model: env('VOLCENGINE_TTS_MODEL', stored.volcengineModel || 'seed-tts-2.0-standard'),
  };
}

export function volcengineVoiceReadiness() {
  const config = volcengineVoiceConfig();
  const apiKeyConfigured = Boolean(config.apiKey);
  return {
    apiKeyConfigured,
    synthesisConfigured: Boolean(apiKeyConfigured && config.ttsResourceId),
    cloneTrainingConfigured: apiKeyConfigured,
    tts2Configured: apiKeyConfigured,
    resourceId: config.ttsResourceId,
  };
}

function stripBase64(value) {
  const text = String(value || '').trim();
  return text.replace(/^data:[^;]+;base64,/u, '');
}

function splitSentences(text) {
  return (String(text || '').replace(/\r/gu, '').match(/[^。！？!?\n]+[。！？!?]?/gu) || [])
    .map(value => value.trim()).filter(Boolean);
}

export function completeVolcengineTiming({timingFile, audioFile, text}) {
  const timing = JSON.parse(readFileSync(timingFile, 'utf8'));
  const durationSeconds = Number(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration',
    '-of','default=noprint_wrappers=1:nokey=1', audioFile], {encoding:'utf8'}).trim());
  const totalFrames = Math.max(1, Math.round(durationSeconds * 30));
  const sentences = splitSentences(text);
  const totalChars = Math.max(1, sentences.reduce((sum, value) => sum + value.replace(/\s+/gu, '').length, 0));
  let cursor = 0;
  const segments = sentences.map((value, index) => {
    const last = index === sentences.length - 1;
    const frames = last ? Math.max(1, totalFrames - cursor) : Math.max(1, Math.round(totalFrames * value.replace(/\s+/gu, '').length / totalChars));
    const segment = {text:value, fromFrame:cursor, durationInFrames:frames};
    cursor += frames;
    return segment;
  });
  writeFileSync(timingFile, JSON.stringify({...timing, fps:30, durationSeconds, totalFrames, segments,
    timingMethod:timing.timingMethod || 'volcengine-word-timestamps'}, null, 2), 'utf8');
  return {...timing, durationSeconds, totalFrames, segments};
}

function flattenResponseRecords(value) {
  if (Array.isArray(value)) return value.flatMap(flattenResponseRecords);
  if (value && typeof value === 'object') return [value];
  return [];
}

export function parseVolcengineTtsResponse(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('火山语音接口返回为空');
  const records = [];
  try {
    records.push(...flattenResponseRecords(JSON.parse(raw)));
  } catch {
    for (const line of raw.split(/\r?\n/u).map(line => line.trim()).filter(Boolean)) {
      try { records.push(...flattenResponseRecords(JSON.parse(line))); } catch {}
    }
  }
  const audioRecords = records.filter(record => stripBase64(record.data));
  const errors = records.filter((record, index) => {
    const completed = index === records.length - 1 && Number(record.code) === 20000000 &&
      record.message === 'OK' && !record.data && audioRecords.length > 0;
    return !completed && (Number(record.code || 0) !== 0 || record.message && record.message !== 'OK');
  });
  if (errors.length) {
    const error = errors[0];
    throw new Error(`火山语音合成失败（code ${String(error.code ?? 'unknown')}）：${String(error.message || '未知错误').slice(0, 300)}`);
  }
  const audioParts = audioRecords.map(record => Buffer.from(stripBase64(record.data), 'base64'));
  if (!audioParts.length) throw new Error(`火山语音接口未返回音频: ${raw.slice(0, 300)}`);
  const words = records.flatMap(record => Array.isArray(record.sentence?.words) ? record.sentence.words : []);
  return {audioBytes:Buffer.concat(audioParts), words, records};
}

export async function synthesizeVolcengineVoice({text, speakerId, speechRate = 0, outputFile, timingFile}) {
  speechRate = validateSpeechRate(speechRate);
  const config = volcengineVoiceConfig();
  if (!config.apiKey) throw new Error('未配置 VOLCENGINE_TTS_API_KEY，未调用火山语音服务');
  if (!speakerId) throw new Error('火山复刻音色缺少 speaker_id');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.VOLCENGINE_TIMEOUT_MS || 60000));
  try {
    const response = await fetch(TTS_URL, {
      method:'POST',
      headers:{'content-type':'application/json', 'X-Api-Key':config.apiKey,
        'X-Api-Resource-Id':config.ttsResourceId, 'X-Api-Request-Id':randomUUID()},
      body:JSON.stringify({req_params:{text:String(text).trim(), speaker:String(speakerId), model:config.model,
        audio_params:{format:'mp3', sample_rate:24000, speech_rate:speechRate}, additions:JSON.stringify({enable_subtitle:true, explicit_language:'zh-cn'})}}),
      signal:controller.signal,
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`火山语音 HTTP ${response.status}: ${body.slice(0, 300)}`);
    const parsed = parseVolcengineTtsResponse(body);
    writeFileSync(outputFile, parsed.audioBytes);
    if (timingFile) writeFileSync(timingFile, JSON.stringify({voice:speakerId, voiceEngine:'volcengine-seed-icl-2.0', timingMethod:'volcengine-word-timestamps', words:parsed.words}, null, 2), 'utf8');
    return {...parsed, voiceEngine:'volcengine-seed-icl-2.0'};
  } finally {
    clearTimeout(timer);
  }
}

export async function trainVolcengineVoice({audioBytes, audioFormat, speakerId, promptText = '', language = 0, fetchImpl = globalThis.fetch}) {
  const config = volcengineVoiceConfig();
  if (!config.apiKey) throw new Error('未配置火山 API Key，未上传音色样本');
  if (!speakerId || !/^[A-Za-z0-9_-]{2,128}$/u.test(speakerId)) throw new Error('请填写火山控制台提供的有效 speaker_id');
  if (!['wav','mp3','ogg','m4a','aac'].includes(audioFormat)) throw new Error('不支持的声音样本格式');
  if (!audioBytes?.length || audioBytes.length > 10 * 1024 * 1024) throw new Error('声音样本需在 10 MB 以内');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.VOLCENGINE_TIMEOUT_MS || 60000));
  try {
    const response = await fetchImpl(CLONE_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json', 'X-Api-Key':config.apiKey, 'X-Api-Request-Id':randomUUID()},
      body:JSON.stringify({speaker_id:speakerId, audio:{data:Buffer.from(audioBytes).toString('base64'), format:audioFormat},
        text:String(promptText || '').trim() || undefined, language:Number(language),
        extra_params:{enable_audio_denoise:false}}),
      signal:controller.signal,
    });
    const result = await response.json();
    if (!response.ok || Number(result.code || 0) !== 0) {
      throw new Error(`火山复刻训练失败（HTTP ${response.status}）：${String(result.message || result.code || '未知错误').slice(0, 300)}`);
    }
    return {speakerId:result.speaker_id || speakerId, status:result.status, message:result.message || '',
      availableTrainingTimes:result.available_training_times, logId:response.headers.get('X-Tt-Logid') || null};
  } finally {
    clearTimeout(timer);
  }
}

export async function getVolcengineVoiceStatus() {
  throw new Error('当前提供的 v3 文档未包含独立状态查询接口；请在火山控制台查看训练状态');
}

if (process.argv[1]?.endsWith('volcengine-voice.mjs')) {
  const [command, inputFile, outputFile, timingFile, speakerId, speechRate = 0] = process.argv.slice(2);
  if (command === 'synthesize') {
    const text = readFileSync(inputFile, 'utf8');
    await synthesizeVolcengineVoice({text, speakerId, speechRate, outputFile, timingFile});
    console.log(JSON.stringify({ok:true, outputFile, timingFile}, null, 2));
  }
}
