// RunningHub InfiniteTalk transport.
// Adapted from the read-only workflow_1256 transport. No credentials are stored here.

import {getApiProvider, runningHubRuntimeConfig} from './api-center.mjs';

const RUNNINGHUB_PROVIDER = getApiProvider('runninghub');
const DEFAULT_BASE_URL = RUNNINGHUB_PROVIDER.baseUrl;
const DEFAULT_APP_ID = RUNNINGHUB_PROVIDER.appId;
export const RUNNINGHUB_NODES = RUNNINGHUB_PROVIDER.nodes;

export class RunningHubTransportError extends Error {}
export class RunningHubValidationError extends Error {}

const sleepDefault = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function normalizeApiKey(value) {
  let key = String(value || '').trim().replace(/^Bearer\s+/i, '').trim();
  if (key.length >= 2 && key[0] === key.at(-1) && ['"', "'"].includes(key[0])) key = key.slice(1, -1).trim();
  if (key.length !== 32 || /\s/.test(key) || !/^[\x20-\x7e]+$/.test(key)) {
    throw new RunningHubValidationError('RunningHub API Key 必须是 32 位可打印字符');
  }
  return key;
}

function normalizeNumber(value, fallback) {
  const text = String(value ?? '').trim();
  return Number.isFinite(Number(text)) ? text : fallback;
}

function normalizePositiveInteger(value, fallback) {
  const number = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(number) && number > 0 ? String(number) : fallback;
}

export function buildRunningHubPayload({
  imageFile,
  audioFile,
  maxSide = '1080',
  prompt = '人物自然说话，身体保持稳定，配合轻微自然手势',
  intensity = '0',
  scale = '1.05',
  instanceType = 'plus',
}) {
  const instance = ['default', 'plus', 'ultra'].includes(String(instanceType)) ? String(instanceType) : 'plus';
  return {
    instanceType: instance,
    usePersonalQueue: false,
    nodeInfoList: [
      {nodeId: RUNNINGHUB_NODES.image, fieldName: 'image', fieldValue: String(imageFile)},
      {nodeId: RUNNINGHUB_NODES.maxSide, fieldName: 'value', fieldValue: normalizePositiveInteger(maxSide, '1080')},
      {nodeId: RUNNINGHUB_NODES.audio, fieldName: 'audio', fieldValue: String(audioFile)},
      {nodeId: RUNNINGHUB_NODES.prompt, fieldName: 'prompt', fieldValue: String(prompt || '')},
      {nodeId: RUNNINGHUB_NODES.intensity, fieldName: 'value', fieldValue: normalizeNumber(intensity, '0')},
      {nodeId: RUNNINGHUB_NODES.scale, fieldName: 'value', fieldValue: normalizeNumber(scale, '1.05')},
    ],
  };
}

export function normalizeRunningHubStatus(data) {
  const raw = String(data?.status || '').trim().toUpperCase().replace(/[- ]/g, '_');
  if (['SUCCEEDED', 'COMPLETED', 'COMPLETE', 'SUCCESS'].includes(raw)) return 'SUCCESS';
  if (['FAIL', 'ERROR', 'FAILED'].includes(raw)) return 'FAILED';
  if (['PENDING', 'WAITING', 'QUEUED'].includes(raw)) return 'QUEUED';
  if (['PROCESSING', 'IN_PROGRESS', 'RUNNING'].includes(raw)) return 'RUNNING';
  if (['CANCELLED', 'CANCELED', 'STOPPED', 'TERMINATED', 'ABORTED'].includes(raw)) return 'CANCELED';
  if (String(data?.errorCode || '').trim() || String(data?.errorMessage || data?.message || '').trim()) return 'FAILED';
  return raw;
}

function findTaskId(value) {
  if (value && typeof value === 'object') {
    for (const key of ['taskId', 'task_id', 'taskID']) {
      if (String(value[key] || '').trim()) return String(value[key]).trim();
    }
    for (const child of Object.values(value)) {
      const found = findTaskId(child);
      if (found) return found;
    }
  } else if (Array.isArray(value)) {
    for (const child of value) {
      const found = findTaskId(child);
      if (found) return found;
    }
  }
  return '';
}

export function pickRunningHubVideo(data) {
  const results = Array.isArray(data?.results) ? data.results : [];
  const video = results.find(item => item && item.url && ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(String(item.outputType || '').toLowerCase()));
  return String(video?.url || results.find(item => item?.url)?.url || '');
}

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function assertResponse(response, data, stage) {
  const code = data?.code;
  if (!response.ok || (code !== undefined && ![0, '0', 200, '200', 202, '202'].includes(code))) {
    const detail = String(data?.errorMessage || data?.message || '').trim();
    throw new RunningHubTransportError(`RunningHub ${stage} 失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`);
  }
  return data;
}

export class RunningHubInfiniteTalkTransport {
  constructor({
    apiKey,
    appId = runningHubRuntimeConfig().appId || DEFAULT_APP_ID,
    baseUrl = runningHubRuntimeConfig().baseUrl || DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
    sleep = sleepDefault,
    pollIntervalMs = runningHubRuntimeConfig().pollIntervalMs,
    maxWaitMs = runningHubRuntimeConfig().maxWaitMs,
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new RunningHubTransportError('当前 Node 运行时没有可用 fetch');
    this.apiKey = normalizeApiKey(apiKey || runningHubRuntimeConfig().apiKey);
    this.appId = String(appId || DEFAULT_APP_ID).trim();
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.sleep = sleep;
    this.pollIntervalMs = Math.max(100, Number(pollIntervalMs) || 10000);
    this.maxWaitMs = Math.max(this.pollIntervalMs, Number(maxWaitMs) || 3600000);
  }

  get runUrl() { return `${this.baseUrl}/run/ai-app/${this.appId}`; }
  get uploadUrl() { return `${this.baseUrl}/media/upload/binary`; }
  get queryUrl() { return `${this.baseUrl}/query`; }

  jsonHeaders() {
    return {'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json'};
  }

  async upload(bytes, filename, mimeType) {
    const form = new FormData();
    form.append('file', new Blob([bytes], {type: mimeType}), filename);
    const response = await this.fetch(this.uploadUrl, {method: 'POST', headers: {'Authorization': `Bearer ${this.apiKey}`}, body: form});
    const data = assertResponse(response, await readJson(response), '文件上传');
    const nested = data?.data && typeof data.data === 'object' ? data.data : data;
    const file = nested?.fileName || nested?.download_url;
    if (!file) throw new RunningHubTransportError('RunningHub 上传成功但没有返回文件标识');
    return String(file);
  }

  async create({imageBytes, audioBytes, imageName = 'image.png', audioName = 'audio.wav', imageMime = 'image/png', audioMime = 'audio/wav', maxSide = '1080', prompt = '', intensity = '0', scale = '1.05', instanceType = 'plus'}) {
    if (!imageBytes?.length || !audioBytes?.length) throw new RunningHubValidationError('数字人创建需要角色图和音频');
    const imageFile = await this.upload(imageBytes, imageName, imageMime);
    const audioFile = await this.upload(audioBytes, audioName, audioMime);
    const payload = buildRunningHubPayload({imageFile, audioFile, maxSide, prompt, intensity, scale, instanceType});
    const response = await this.fetch(this.runUrl, {method: 'POST', headers: this.jsonHeaders(), body: JSON.stringify(payload)});
    const data = assertResponse(response, await readJson(response), '创建任务');
    const taskId = findTaskId(data);
    if (!taskId) throw new RunningHubTransportError('RunningHub 创建响应没有 taskId');
    return {taskId, status: normalizeRunningHubStatus(data) || 'QUEUED', payload, raw: data};
  }

  async queryOnce(taskId) {
    const response = await this.fetch(this.queryUrl, {method: 'POST', headers: this.jsonHeaders(), body: JSON.stringify({taskId: String(taskId)})});
    return assertResponse(response, await readJson(response), '查询任务');
  }

  async waitForResult(taskId, {onUpdate} = {}) {
    const started = Date.now();
    let last = 'QUEUED';
    while (Date.now() - started <= this.maxWaitMs) {
      const data = await this.queryOnce(taskId);
      const status = normalizeRunningHubStatus(data);
      last = status || last;
      onUpdate?.({taskId, status: status || last, data});
      if (status === 'SUCCESS') {
        const outputUrl = pickRunningHubVideo(data);
        if (!outputUrl) throw new RunningHubTransportError('RunningHub 任务成功但没有视频结果');
        return {taskId, status, outputUrl, usage: data.usage || {}, raw: data};
      }
      if (status === 'FAILED' || status === 'CANCELED') {
        throw new RunningHubTransportError(`RunningHub 任务${status === 'CANCELED' ? '已取消' : '失败'}${data.errorMessage ? `：${data.errorMessage}` : ''}`);
      }
      await this.sleep(this.pollIntervalMs);
    }
    throw new RunningHubTransportError(`RunningHub 任务超过 ${Math.round(this.maxWaitMs / 1000)} 秒仍为 ${last}`);
  }

  async download(url) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.fetch(url, {headers: {'User-Agent': 'Video-ShotCraft/1.0', 'Accept': '*/*'}});
        const type = String(response.headers?.get?.('content-type') || '').toLowerCase();
        if (!response.ok) throw new RunningHubTransportError(`视频下载失败（HTTP ${response.status}）`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length || type.includes('text/html')) throw new RunningHubTransportError('视频下载为空或返回 HTML');
        return bytes;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await this.sleep(1500 * (attempt + 1));
      }
    }
    throw lastError || new RunningHubTransportError('视频下载失败');
  }
}

export const runningHubDefaults = Object.freeze({appId: DEFAULT_APP_ID, baseUrl: DEFAULT_BASE_URL, nodes: RUNNINGHUB_NODES});


