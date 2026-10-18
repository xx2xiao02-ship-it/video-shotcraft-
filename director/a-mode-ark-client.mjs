import {Agent} from 'undici';

export const ARK_RESPONSES_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses';

function fallbackPlan(config, choice) {
  const plan = [{endpoint:config[`${choice}Endpoint`], apiKey:config.apiKey, source:'primary'}];
  const add = (endpoint, apiKey, source) => {
    if (!endpoint || !apiKey) return;
    // 同一接入点和同一密钥只尝试一次；不同密钥仍保留为独立尝试。
    if (plan.some(item => item.endpoint === endpoint && item.apiKey === apiKey)) return;
    plan.push({endpoint, apiKey, source});
  };
  add(config[choice === 'pro' ? 'fallbackProEndpoint' : 'fallbackTurboEndpoint'] ?? config.fallbackEndpoint,
    config.fallbackApiKey || config.apiKey, 'model-fallback');
  for (const endpoint of Array.isArray(config.genericFallbackEndpoints) ? config.genericFallbackEndpoints : [])
    add(endpoint, config.apiKey, 'primary-generic');
  for (const endpoint of Array.isArray(config.auxiliaryGenericFallbackEndpoints) ? config.auxiliaryGenericFallbackEndpoints : [])
    add(endpoint, config.fallbackApiKey || config.apiKey, 'auxiliary-generic');
  return plan;
}

function transportError(error, config, phase) {
  const code = String(error?.cause?.code || error?.code || error?.name || 'UNKNOWN');
  const detail = String(error?.cause?.message || error?.message || error)
    .replaceAll(config.apiKey, '[REDACTED]').slice(0, 300);
  const retryable = ['TimeoutError', 'AbortError'].includes(error?.name) ||
    ['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(code);
  return Object.assign(new Error(`火山方舟 ${phase} 连接失败（${code}）：${detail}`), {retryable});
}

export function parseArkJsonResponse(response) {
  if(!response||typeof response!=='object'||Array.isArray(response))
    throw Object.assign(new Error('火山方舟响应包结构无效'),{code:'ARK_ENVELOPE_INVALID',retryable:false});
  if (response.status && response.status !== 'completed')
    throw Object.assign(new Error(`火山方舟响应未完成: ${response.status}`), {code:'ARK_RESPONSE_INCOMPLETE', retryable:false});
  const output = response.output_text || response.output?.flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text' || item.type === 'text')
    .map(item => item.text || '').join('');
  if (!output || typeof output !== 'string') throw Object.assign(new Error('火山方舟未返回可读取的文字结果'), {code:'ARK_RESPONSE_TEXT_MISSING', retryable:false});
  const cleaned = output.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
  try { return JSON.parse(cleaned); }
  catch { throw Object.assign(new Error('火山方舟未返回合法 JSON 分镜'), {code:'ARK_OUTPUT_JSON_INVALID', retryable:false, outputLength:output.length}); }
}

async function arkDirectorAttempt(prompt, {config, phase, fetchImpl = globalThis.fetch, timeoutMs = 480000, maxOutputTokens, onResponse}) {
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
        body:JSON.stringify({model, store:false, input:[{role:'user', content:[{type:'input_text', text:prompt}]}],
          ...(Number.isInteger(maxOutputTokens) && maxOutputTokens > 0 ? {max_output_tokens:maxOutputTokens} : {})}),
      });
    } catch (error) { throw transportError(error, config, phase); }
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).error?.message || ''; } catch {}
      const safeDetail = String(detail).replaceAll(config.apiKey, '[REDACTED]');
      const retryAfter = response.headers?.get?.('retry-after');
      const retryAfterMs = retryAfter ? (/^\d+$/u.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now())) : 0;
      throw Object.assign(new Error(`火山方舟 ${phase} 请求失败（HTTP ${response.status}）${safeDetail ? `: ${safeDetail.slice(0, 300)}` : ''}`),
        {retryable:response.status === 429 || response.status >= 500 && response.status <= 599,
          accountUnavailable:response.status === 403 && /overdue balance/i.test(safeDetail), retryAfterMs});
    }
    let rawBody;
    try { rawBody = typeof response.text === 'function' ? await response.text() : JSON.stringify(await response.json()); }
    catch (error) { throw transportError(error, config, phase); }
    // Persist successful HTTP bodies before either JSON layer is parsed. A
    // storage error must stop here; another endpoint could incur another bill.
    if(onResponse)try{await onResponse(rawBody,{httpStatus:response.status||200});}
    catch{throw Object.assign(new Error('火山方舟响应留存失败，已停止；禁止自动再次请求'),{code:'ARK_RESPONSE_CAPTURE_FAILED',fatal:true,retryable:false});}
    let payload;
    try{payload=JSON.parse(rawBody);}
    catch{throw Object.assign(new Error('火山方舟 HTTP 响应正文不是合法 JSON'),{code:'ARK_ENVELOPE_JSON_INVALID',retryable:false});}
    return parseArkJsonResponse(payload);
  } finally {
    await dispatcher.close();
  }
}

export async function arkDirector(prompt, {config, phase, fetchImpl = globalThis.fetch, timeoutMs = 480000,
  maxOutputTokens, requestPlan=null, waitImpl = ms => new Promise(resolve => setTimeout(resolve, ms)), onAttempt = () => {}, onResponse}) {
  const choice = phase === 'global' ? config.globalModel : config.shotModel;
  const fallbackEndpoint = config[choice === 'pro' ? 'fallbackProEndpoint' : 'fallbackTurboEndpoint'] ?? config.fallbackEndpoint;
  const hasGenericFallback = (config.genericFallbackEndpoints?.length || 0) > 0 || (config.auxiliaryGenericFallbackEndpoints?.length || 0) > 0;
  if ((fallbackEndpoint || hasGenericFallback) && !(config.fallbackApiKey || config.apiKey)) {
    throw new Error('自动跌落已启用，但备用接入点或密钥未配置');
  }
  const plan = requestPlan || fallbackPlan(config, choice);
  if(!Array.isArray(plan)||!plan.length||plan.some(t=>!t.endpoint||!t.apiKey))throw Error('分镜接入点计划无效');
  for (let attempt = 1; attempt <= plan.length; attempt++) {
    const target = plan[attempt - 1];
    const selected = {...config, apiKey:target.apiKey, proEndpoint:target.endpoint, turboEndpoint:target.endpoint};
    onAttempt({phase, attempt, fallback:attempt > 1, source:target.source, endpoint:target.endpoint, totalAttempts:plan.length});
    // 开启跌落时限制单个接入点的等待时间，避免一个失联接入点阻塞整条候选链。
    const attemptTimeoutMs = Math.min(timeoutMs, 120000);
    try { return await arkDirectorAttempt(prompt, {config:selected, phase, fetchImpl, timeoutMs:attemptTimeoutMs, maxOutputTokens,
      onResponse:onResponse?(body,meta)=>onResponse(body,{...meta,phase,attempt,source:target.source,endpoint:target.endpoint}):undefined}); }
    catch (error) {
      // Never expose either credential, even if the provider echoes it in an error.
      for (const key of [config.apiKey, config.fallbackApiKey].filter(Boolean)) error.message = error.message.replaceAll(key, '[REDACTED]');
      if(error.fatal||String(error.code||'').startsWith('ARK_'))throw error;
      if (attempt === plan.length) throw error;
      if (!error.retryable && error.status === undefined && !error.accountUnavailable && !String(error.message || '').includes('HTTP ')) throw error;
      if (error.retryAfterMs > 120000) throw error;
      if (error.retryable) await waitImpl(Math.max(5000, Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : 0));
    }
  }
}
