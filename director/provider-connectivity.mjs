import {runningHubRuntimeConfig} from './api-center.mjs';
import {normalizeApiKey} from './runninghub-infinitetalk.mjs';
import {CLONE_URL, volcengineVoiceConfig} from './volcengine-voice.mjs';

export async function checkProviderConnectivity(provider, {taskId = '', fetchImpl = globalThis.fetch} = {}) {
  const runninghub = provider === 'runninghub';
  if (!runninghub && provider !== 'volcengine') throw new Error('未知服务');
  const config = runninghub ? runningHubRuntimeConfig() : volcengineVoiceConfig();
  const configured = Boolean(config.apiKey && (!runninghub || config.appId));
  const existingTaskId = String(taskId || '').trim();
  if (existingTaskId && (!runninghub || !/^[A-Za-z0-9_-]{1,128}$/u.test(existingTaskId))) throw new Error('已有任务 ID 格式无效');
  const endpoint = runninghub ? `${config.baseUrl}/query` : CLONE_URL;
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('联通测试只允许 HTTPS 服务地址');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    if (runninghub && existingTaskId) {
      if (!config.apiKey) return {provider, reachable:null, configured:false, authVerified:false, authStatus:'not_configured', detail:'请先保存 RunningHub API Key'};
      const response = await fetchImpl(url, {method:'POST', redirect:'manual', signal:controller.signal,
        headers:{Authorization:`Bearer ${normalizeApiKey(config.apiKey)}`, 'Content-Type':'application/json'},
        body:JSON.stringify({taskId:existingTaskId})});
      if (response.status === 401 || response.status === 403) return {provider, reachable:true, configured, httpStatus:response.status,
        authVerified:false, authStatus:'invalid_credentials', detail:'服务端拒绝密钥或权限；请检查 API Key'};
      if (!response.ok) return {provider, reachable:true, configured, httpStatus:response.status,
        authVerified:false, authStatus:'inconclusive', detail:'任务查询失败，无法确认鉴权是否通过'};
      const data = await response.json().catch(() => null);
      if (data && String(data.taskId || data.data?.taskId || '') === existingTaskId &&
          ![false, 'false'].includes(data.success) && Number(data.code || 0) === 0) {
        return {provider, reachable:true, configured, httpStatus:response.status, authVerified:true,
          authStatus:'authenticated', detail:'已有任务查询成功，API Key 鉴权已验证；未创建新任务'};
      }
      return {provider, reachable:true, configured, httpStatus:response.status, authVerified:false,
        authStatus:'inconclusive', detail:'服务有响应，但未返回匹配的任务；不能据此判定鉴权成功'};
    }
    const response = await fetchImpl(url, {method:'GET', redirect:'manual', signal:controller.signal});
    return {provider, reachable:true, configured, httpStatus:response.status, authVerified:false,
      authStatus:'not_tested', detail:runninghub ? '仅验证网络；填写已有任务 ID 后可验证 RunningHub 鉴权' :
        '仅验证网络；当前火山文档未提供安全的只读鉴权接口，未调用训练服务'};
  } catch (error) {
    return {provider, reachable:false, configured, authVerified:false, authStatus:'network_error',
      detail:`连接失败：${String(error.cause?.code || error.name || 'network_error')}`};
  } finally {
    clearTimeout(timer);
  }
}
