import {createHash, randomUUID} from 'node:crypto';
import {copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const spoken = text => String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

function span(start, end, total, previous = 0) {
  if (![start, end].every(Number.isFinite) || start < previous - 0.001 || end <= start || end > total + 0.05) {
    throw new Error('TTS 时间戳无效：时间倒序、重叠或超出配音时长');
  }
}

// Read the provider evidence, never the character-weighted segments produced by
// completeVolcengineTiming. Edge offsets/durations are 100 ns; Volcengine's
// startTime/endTime contract is seconds. No unit guessing or ASR confidence.
export function readNativeTiming(project) {
  const voiceFile = path.join(project, 'audio', 'voice-timing.json');
  if (!existsSync(voiceFile)) return null;
  const voice = read(voiceFile);
  const texts = read(path.join(project, 'script.json')).sentences;
  const total = voice.durationSeconds;
  if (!Array.isArray(texts) || !texts.length || !Number.isFinite(total) || total <= 0) {
    throw new Error('TTS 时间戳缺少有效文案或音频时长');
  }
  const boundaryFile = path.join(project, 'audio', 'voice-timing.boundary.jsonl');
  let events = null;
  let granularity;
  let provider;
  if (voice.voiceEngine === 'edge-tts' && existsSync(boundaryFile)) {
    const rows = readFileSync(boundaryFile, 'utf8').trim().split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
    const words = rows.filter(row => row.type === 'WordBoundary');
    const sentences = rows.filter(row => row.type === 'SentenceBoundary');
    const selected = words.length ? words : sentences;
    if (!selected.length) return null;
    granularity = words.length ? 'word' : 'sentence';
    provider = 'edge-tts';
    events = selected.map(row => ({text:row.text, start:row.offset / 10_000_000,
      end:(row.offset + row.duration) / 10_000_000}));
  } else if (String(voice.voiceEngine || '').startsWith('volcengine-') && voice.words?.length) {
    granularity = 'word';
    provider = voice.voiceEngine;
    events = voice.words.map(word => ({text:word.word, start:word.startTime, end:word.endTime}));
  }
  if (!events) return null;
  // Edge can report a sentence duration extending slightly beyond the next
  // sentence onset. Keep its raw evidence; close the derived span at that onset.
  if (provider === 'edge-tts' && granularity === 'sentence') {
    events = events.map((event, i) => {
      const next = events[i + 1];
      if (next && event.end > next.start && event.end - next.start <= 0.1) return {...event, end:next.start};
      return event;
    });
  }
  let previous = 0;
  for (const event of events) {
    if (typeof event.text !== 'string' || !event.text.trim()) throw new Error('TTS 时间戳缺少文本');
    span(event.start, event.end, total, previous);
    previous = event.end;
  }
  const sentences = [];
  let cursor = 0;
  for (const [i, text] of texts.entries()) {
    const tokens = [];
    const target = spoken(text);
    let joined = '';
    do {
      const event = events[cursor++];
      if (!event) throw new Error(`TTS 时间戳与第 ${i + 1} 句原稿不匹配`);
      tokens.push(event);
      joined += spoken(event.text);
      if (!target.startsWith(joined)) throw new Error(`TTS 时间戳与第 ${i + 1} 句原稿不匹配`);
    } while (granularity === 'word' && joined !== target);
    if (!target || joined !== target) throw new Error(`TTS 时间戳与第 ${i + 1} 句原稿不匹配`);
    sentences.push({i, text, start:tokens[0].start, end:tokens.at(-1).end,
      match:null, ok:true, textMatched:true, words:granularity === 'word' ? tokens : []});
  }
  if (cursor !== events.length) throw new Error('TTS 时间戳含原稿之外的文本');
  const files = ['audio/full.mp3', 'script.json', 'audio/voice-timing.json',
    ...(provider === 'edge-tts' ? ['audio/voice-timing.boundary.jsonl'] : [])];
  return {total, timingSource:'tts-native', timingGranularity:granularity, provider,
    matchMeaning:'provider-text-mapping',
    provenance:Object.fromEntries(files.map(file => [file, hash(path.join(project, file))])), sentences};
}

export function timingHealth(timing) {
  const native = timing?.timingSource === 'tts-native';
  const sentences = timing?.sentences || [];
  const sentenceReady = sentences.length > 0 && sentences.every(sentence =>
    sentence.ok === true && Number.isFinite(sentence.start) && Number.isFinite(sentence.end) && sentence.end > sentence.start &&
    (native ? sentence.textMatched === true : Number.isFinite(sentence.match) && sentence.match >= 0.9));
  const wordReady = sentenceReady && timing?.timingGranularity !== 'sentence' && sentences.every(sentence => sentence.words?.length > 0);
  return {timingSource:native ? 'tts-native' : timing ? 'asr' : null,
    timingGranularity:timing?.timingGranularity || (timing ? 'word' : null),
    sentenceTimingReady:sentenceReady, wordTimingReady:wordReady};
}

export function validateNativeTiming(project, timing) {
  if (timing?.timingSource !== 'tts-native') return;
  const expected = readNativeTiming(project);
  if (!expected || JSON.stringify(expected) !== JSON.stringify(timing)) {
    throw new Error('TTS 时间戳与当前配音、原稿或供应商原始记录不一致');
  }
}

export function writeNativeTiming(project) {
  const timing = readNativeTiming(project);
  if (!timing) return null;
  const timestampFile = path.join(project, 'audio', 'timestamps.json');
  const renderFile = path.join(project, 'remotion', 'timing.json');
  if (existsSync(timestampFile) || existsSync(renderFile)) throw new Error('Existing timestamps were preserved');
  mkdirSync(path.dirname(renderFile), {recursive:true});
  writeFileSync(timestampFile, JSON.stringify(timing, null, 2), {flag:'wx'});
  if (timing.timingGranularity === 'sentence') {
    // Empty chars is deliberate: sentence spans must not become fake word anchors.
    writeFileSync(renderFile, JSON.stringify({totalSec:timing.total, timingGranularity:'sentence',
      scenes:timing.sentences.map(sentence => ({id:`s${sentence.i + 1}`, text:sentence.text,
        startSec:sentence.start, durationSec:sentence.end - sentence.start, chars:[]}))}, null, 2), {flag:'wx'});
  }
  return timing;
}

export function requireWordTiming(project) {
  const timing = read(path.join(project, 'audio', 'timestamps.json'));
  validateNativeTiming(project, timing);
  if (!timingHealth(timing).wordTimingReady) {
    throw new Error('WORD_TIMING_REQUIRED：当前已采用 TTS 句级时间戳；词语动效和逐字字幕需要补充真实字级时间戳，已有配音无需重做');
  }
}

// Recovery creates an input-only sibling. Old ASR results, review state, rendered
// media and paid assets stay in the source run; none are promoted to a new pass.
export function createTimingRecovery(root, sourceRunId) {
  if (!RUN_ID.test(sourceRunId)) throw new Error('Invalid TalkCraft run ID');
  const original = path.join(root, 'director', 'b-mode-runs', sourceRunId, 'talkcraft');
  if (!readNativeTiming(original)) throw new Error('该运行没有可复用的 TTS 原始时间戳');
  const source = read(path.join(original, 'source-run.json'));
  if (source.runId !== sourceRunId) throw new Error('Source run ID mismatch');
  const runId = randomUUID();
  const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  mkdirSync(path.join(project, 'audio'), {recursive:true});
  mkdirSync(path.join(project, 'remotion', 'public', 'broll'), {recursive:true});
  for (const name of ['input.txt','script.txt','script.json','sources.md','theme.json',
    'audio/full.mp3','audio/voice-timing.json','audio/voice-timing.boundary.jsonl']) {
    if (existsSync(path.join(original, name))) copyFileSync(path.join(original, name), path.join(project, name));
  }
  if (existsSync(path.join(original, 'assets'))) cpSync(path.join(original, 'assets'), path.join(project, 'assets'), {recursive:true});
  const audioSha256 = hash(path.join(original, 'audio', 'full.mp3'));
  if (hash(path.join(project, 'audio', 'full.mp3')) !== audioSha256) throw new Error('Recovered audio hash mismatch');
  writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({...source, runId, sourceRunId,
    timingRecoveryOf:sourceRunId, reusedAudioSha256:audioSha256}, null, 2), {flag:'wx'});
  return {runId, sourceRunId, project, audioSha256};
}
