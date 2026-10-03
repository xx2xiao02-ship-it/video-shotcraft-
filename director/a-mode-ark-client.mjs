import {Agent} from 'undici';

export const ARK_RESPONSES_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses';

function transportError(error, config, phase) {
  const code = String(error?.cause?.code || error?.code || error?.name || 'UNKNOWN');
  const detail = String(error?.cause?.message || error?.message || error)
    .replaceAll(config.apiKey, '[REDACTED]').slice(0, 300);
  const retryable = ['TimeoutError', 'AbortError'].includes(error?.name) ||
    ['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(code);
  return Object.assign(new Error(`火山方舟 ${phase} 连接失败（${code}）：${detail}`), {retryable});
}

export function parseArkJsonResponse(response) {
  if (response.status && response.status !== 'completed')
    throw new Error(`火山方舟响应未完成: ${response.status}`);
  const output = response.output_text || response.output?.flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text' || item.type === 'text')
    .map(item => item.text || '').join('');
  if (!output || typeof output !== 'string') throw new Error('火山方舟未返回可读取的文字结果');
  const cleaned = output.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
  try { return JSON.parse(cleaned); }
  catch { throw new Error('火山方舟未返回合法 JSON 分镜'); }
}

async function arkDirectorAttempt(prompt, {config, phase, fetchImpl = globalThis.fetch, timeoutMs = 480000}) {
  const choice = phase === 'global' ? config.globalModel : phase === 'shot' ? config.shotModel : null;
  if (!choice) throw new Error('A 模式编导阶段无效');
  const model = config[`${choice}Endpoint`];
  if (!config.apiKey || !model) throw new Error(`A 模式 ${choice === 'pro' ? 'Pro' : 'Turbo'} 未配置 API Key 或模型接入点`);
  const dispatcher = new Agent({headersTimeout:timeoutMs + 1000, bodyTimeout:timeoutMs + 1000});
  try {
    let response;
    try {
      response = await fetchImpl(ARK_RESPONSES_URL, {
        method:'POST', signal:AbortSignal.timeout(timeoutMs), dispatcher,
        headers:{Authorization:`Bearer ${config.apiKey}`, 'Content-Type':'application/json'},
        body:JSON.stringify({model, store:false, input:[{role:'user', content:[{type:'input_text', text:prompt}]}]}),
      });
    } catch (error) { throw transportError(error, config, phase); }
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).error?.message || ''; } catch {}
      const safeDetail = String(detail).replaceAll(config.apiKey, '[REDACTED]');
      const retryAfter = response.headers?.get?.('retry-after');
      const retryAfterMs = retryAfter ? (/^\d+$/u.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now())) : 0;
      throw Object.assign(new Error(`火山方舟 ${phase} 请求失败（HTTP ${response.status}）${safeDetail ? `: ${safeDetail.slice(0, 300)}` : ''}`),
        {retryable:response.status === 429 || response.status >= 500 && response.status <= 599, retryAfterMs});
    }
    let payload;
    try { payload = await response.json(); }
    catch (error) { throw transportError(error, config, phase); }
    return parseArkJsonResponse(payload);
  } finally {
    await dispatcher.close();
  }
}

export async function arkDirector(prompt, {config, phase, fetchImpl = globalThis.fetch, timeoutMs = 480000,
  waitImpl = ms => new Promise(resolve => setTimeout(resolve, ms)), onAttempt = () => {}}) {
  const enabled = config.fallbackEnabled === true;
  const choice = phase === 'global' ? config.globalModel : config.shotModel;
  const fallbackEndpoint = config[choice === 'pro' ? 'fallbackProEndpoint' : 'fallbackTurboEndpoint'] ?? config.fallbackEndpoint;
  if (enabled && (!fallbackEndpoint || !(config.fallbackApiKey || config.apiKey))) {
    throw new Error('自动跌落已启用，但备用接入点或密钥未配置');
  }
  const attempts = enabled ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const fallback = attempt === 3;
    const selected = fallback ? {...config, apiKey:config.fallbackApiKey || config.apiKey,
      proEndpoint:fallbackEndpoint, turboEndpoint:fallbackEndpoint} : config;
    onAttempt({phase, attempt, fallback});
    try { return await arkDirectorAttempt(prompt, {config:selected, phase, fetchImpl, timeoutMs}); }
    catch (error) {
      // Never expose either credential, even if the provider echoes it in an error.
      for (const key of [config.apiKey, config.fallbackApiKey].filter(Boolean)) error.message = error.message.replaceAll(key, '[REDACTED]');
      if (!error.retryable || attempt === attempts) throw error;
      if (error.retryAfterMs > 120000) throw error;
      await waitImpl(Math.max(5000, Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : 0));
    }
  }
}
