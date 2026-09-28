// Local API center registry for the isolated digital-human integration.
// Keep provider identity and public contract here; secrets come from env or local DPAPI storage.
import {readStoredProviderConfig} from './provider-config.mjs';

export const API_CENTER = Object.freeze({
  runninghub: Object.freeze({
    id: 'runninghub',
    name: 'RunningHub / InfiniteTalk',
    baseUrl: 'https://www.runninghub.cn/openapi/v2',
    appId: '2006270540499128322',
    nodes: Object.freeze({
      image: '284',
      maxSide: '312',
      audio: '125',
      prompt: '314',
      intensity: '369',
      scale: '370',
    }),
    uploadPath: '/media/upload/binary',
    createPath: '/run/ai-app/{appId}',
    queryPath: '/query',
    resultTtlHours: 24,
    pollIntervalMs: 10000,
    maxWaitMs: 900000,
  }),
});

export function getApiProvider(id) {
  const provider = API_CENTER[id];
  if (!provider) throw new Error(`未注册的 API provider: ${id}`);
  return provider;
}

export function runningHubRuntimeConfig(env = process.env) {
  const provider = getApiProvider('runninghub');
  const stored = readStoredProviderConfig();
  return {
    ...provider,
    baseUrl: String(env.RUNNINGHUB_API_BASE || stored.runninghubBaseUrl || provider.baseUrl).replace(/\/$/, ''),
    appId: String(env.RUNNINGHUB_APP_ID || stored.runninghubAppId || provider.appId).trim(),
    pollIntervalMs: Number(env.INFINITETALK_POLL_INTERVAL_MS || provider.pollIntervalMs),
    maxWaitMs: Number(env.INFINITETALK_MAX_WAIT_MS || provider.maxWaitMs),
    apiKey: String(env.INFINITETALK_API_KEY || stored.runninghubApiKey || '').trim(),
  };
}
