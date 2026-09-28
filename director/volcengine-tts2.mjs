import {randomUUID} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import WebSocket from 'ws';
import {parseVolcengineTtsResponse, volcengineVoiceConfig} from './volcengine-voice.mjs';

export const TTS2_URL = process.env.VOLCENGINE_TTS2_URL || 'wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream';
export const TTS2_HTTP_URL = process.env.VOLCENGINE_TTS2_HTTP_URL || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 48 * 1024 * 1024;

export function encodeTts2Frame(event, payload, sessionId = '') {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const id = Buffer.from(sessionId, 'utf8');
  const connectionEvent = event === 1 || event === 2;
  const frame = Buffer.alloc(4 + 4 + (connectionEvent ? 0 : 4 + id.length) + 4 + body.length);
  frame.set([0x11, 0x14, 0x10, 0x00]);
  let offset = 4;
  frame.writeInt32BE(event, offset); offset += 4;
  if (!connectionEvent) {
    frame.writeUInt32BE(id.length, offset); offset += 4;
    id.copy(frame, offset); offset += id.length;
  }
  frame.writeUInt32BE(body.length, offset); offset += 4;
  body.copy(frame, offset);
  return frame;
}

export function decodeTts2Frame(data) {
  const frame = Buffer.from(data);
  if (frame.length < 8 || frame[0] >> 4 !== 1 || (frame[2] & 0x0f) !== 0) throw new Error('火山语音响应帧无效');
  const headerSize = (frame[0] & 0x0f) * 4;
  const type = frame[1] >> 4;
  const flag = frame[1] & 0x0f;
  let offset = headerSize;
  const takeInt = () => {
    if (offset + 4 > frame.length) throw new Error('火山语音响应帧截断');
    const value = frame.readUInt32BE(offset); offset += 4;
    return value;
  };
  let errorCode = 0;
  if (type === 15) errorCode = takeInt();
  else if (flag === 1 || flag === 3) takeInt();
  else if (![9, 11, 12].includes(type)) throw new Error('火山语音响应类型无效');
  let event = 0;
  if (flag === 4) {
    event = takeInt();
    if (![50, 51, 52].includes(event)) {
      const size = takeInt();
      if (offset + size > frame.length) throw new Error('火山语音会话 ID 截断');
      offset += size;
    } else {
      const size = takeInt();
      if (offset + size > frame.length) throw new Error('火山语音连接 ID 截断');
      offset += size;
    }
  }
  const size = takeInt();
  if (offset + size !== frame.length) throw new Error('火山语音响应长度无效');
  return {type, event, errorCode, payload:frame.subarray(offset)};
}

export function tts2Request(text, speakerId) {
  const speaker = String(speakerId || '').trim();
  if (!/^[A-Za-z0-9_-]{2,256}$/u.test(speaker)) throw new Error('请填写火山语音合成 2.0 音色 ID');
  if (!String(text || '').trim()) throw new Error('合成文案不能为空');
  return {req_params:{text:String(text).trim(), speaker,
    audio_params:{format:'mp3', sample_rate:24000, enable_subtitle:true}}};
}

export async function synthesizeVolcengineTts2({text, speakerId, outputFile, timingFile,
  fetchImpl = globalThis.fetch, url = TTS2_HTTP_URL, timeoutMs = Number(process.env.VOLCENGINE_TIMEOUT_MS || 120000)}) {
  const config = volcengineVoiceConfig();
  if (!config.apiKey) throw new Error('未配置火山 API Key，未调用语音合成 2.0');
  const request = tts2Request(text, speakerId);
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) {
    throw new Error('火山语音合成只允许安全 HTTP 地址');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {method:'POST', signal:controller.signal,
      headers:{'Content-Type':'application/json', 'X-Api-Key':config.apiKey,
        'X-Api-Resource-Id':'seed-tts-2.0', 'X-Api-Request-Id':randomUUID()},
      body:JSON.stringify(request)});
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body || []) {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) throw new Error('火山语音响应超过 48 MB');
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    if (!response.ok) throw new Error(`火山语音 HTTP ${response.status}: ${body.slice(0, 300)}`);
    let parsed;
    try { parsed = parseVolcengineTtsResponse(body); }
    catch (error) {
      const logId = response.headers.get('X-Tt-Logid');
      throw new Error(`${error.message}${logId ? `（Logid: ${logId}）` : ''}`);
    }
    if (parsed.audioBytes.length > MAX_AUDIO_BYTES) throw new Error('火山语音输出超过 32 MB');
    const result = {audioBytes:parsed.audioBytes, words:parsed.words, voiceEngine:'volcengine-seed-tts-2.0'};
    if (outputFile) writeFileSync(outputFile, result.audioBytes);
    if (timingFile) writeFileSync(timingFile, JSON.stringify({voice:speakerId, voiceEngine:result.voiceEngine,
      timingMethod:'volcengine-word-timestamps', words:result.words}, null, 2), 'utf8');
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export async function synthesizeVolcengineTts2WebSocket({text, speakerId, outputFile, timingFile,
  WebSocketImpl = WebSocket, url = TTS2_URL, timeoutMs = Number(process.env.VOLCENGINE_TIMEOUT_MS || 120000)}) {
  const config = volcengineVoiceConfig();
  if (!config.apiKey) throw new Error('未配置火山 API Key，未调用语音合成 2.0');
  const request = tts2Request(text, speakerId);
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'wss:' && !(endpoint.protocol === 'ws:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) {
    throw new Error('火山语音合成只允许安全 WebSocket 地址');
  }
  const sessionId = randomUUID();
  const socket = new WebSocketImpl(url, {headers:{'X-Api-Key':config.apiKey,
    'X-Api-Resource-Id':'seed-tts-2.0', 'X-Api-Request-Id':randomUUID()}});
  const audio = [];
  const words = [];
  let totalBytes = 0;
  const result = await new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => fail(new Error('火山语音合成超时')), timeoutMs);
    function fail(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.close();
      reject(error);
    }
    socket.on('open', () => socket.send(encodeTts2Frame(1, {})));
    socket.on('error', () => fail(new Error('火山语音 WebSocket 连接失败')));
    socket.on('close', () => { if (!finished) fail(new Error('火山语音连接提前关闭')); });
    socket.on('message', (data, isBinary) => {
      if (finished) return;
      try {
        if (!isBinary) throw new Error('火山语音返回非二进制帧');
        const frame = decodeTts2Frame(data);
        if (frame.type === 15 || frame.event === 51 || frame.event === 153) {
          throw new Error(`火山语音服务失败（${frame.errorCode || frame.event}）：${frame.payload.toString('utf8').slice(0, 200)}`);
        }
        if (frame.event === 50) socket.send(encodeTts2Frame(100, request, sessionId));
        if (frame.type === 11 && frame.event === 352) {
          totalBytes += frame.payload.length;
          if (totalBytes > MAX_AUDIO_BYTES) throw new Error('火山语音输出超过 32 MB');
          audio.push(frame.payload);
        }
        if (frame.event === 364) {
          const subtitle = JSON.parse(frame.payload.toString('utf8'));
          words.push(...(subtitle.words || subtitle.sentence?.words || subtitle.data?.words || []));
        }
        if (frame.event === 152) {
          if (!totalBytes) throw new Error('火山语音会话结束但未返回音频');
          finished = true;
          clearTimeout(timer);
          socket.close();
          resolve({audioBytes:Buffer.concat(audio), words, voiceEngine:'volcengine-seed-tts-2.0'});
        }
      } catch (error) { fail(error); }
    });
  });
  if (outputFile) writeFileSync(outputFile, result.audioBytes);
  if (timingFile) writeFileSync(timingFile, JSON.stringify({voice:speakerId, voiceEngine:result.voiceEngine,
    timingMethod:'volcengine-word-timestamps', words:result.words}, null, 2), 'utf8');
  return result;
}

if (process.argv[1]?.endsWith('volcengine-tts2.mjs') && process.argv[2] === 'synthesize') {
  const [, inputFile, outputFile, timingFile, speakerId] = process.argv.slice(2);
  await synthesizeVolcengineTts2({text:readFileSync(inputFile, 'utf8'), speakerId, outputFile, timingFile});
}
