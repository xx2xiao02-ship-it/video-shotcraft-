// 视频外包装 - AI 通道。图像生成遵循 GPT-Image2-Skill 的 runbook：调用其打包 CLI（generate.py），
// 不自行重写 images API 调用；标题/反推走 chat completions。
// 安全约束：服务端出站请求仅允许 http/https，发请求前校验 host，拒绝 localhost、环回、私有和保留地址。
import {execFile} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {promisify} from 'node:util';
import {SKILL_REPO_DIR, SKILL_CLONE_HINT} from './packaging-gallery.mjs';

const execFileAsync = promisify(execFile);

export const MODEL_CHOICES = [
  {id:'gpt-image-2.5-flare', label:'Flare · 快速生成与草稿'},
  {id:'gpt-image-2.5-sunburst', label:'Sunburst · 精确参考编辑'},
  {id:'gpt-image-2', label:'GPT Image 2 · 兼容'},
];
export const QUALITY_TIERS = ['low', 'medium', 'high', 'xhigh', 'max', 'auto'];

function isPrivateIPv4(host) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)      // 100.64/10 CGNAT
    || (a === 169 && b === 254)                // 169.254/16 link-local / 云元数据
    || (a === 172 && b >= 16 && b <= 31)       // 172.16/12
    || (a === 192 && b === 168)                // 192.168/16
    || (a === 198 && (b === 18 || b === 19))   // 198.18/15 基准测试
    || a >= 224;                               // 组播与保留
}

function isPrivateIPv6(host) {
  const lower = host.toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (lower === '::' || lower === '::1') return true;
  const first = (lower.split(':')[0] || '').replace(/^0+(?=\w)/, '');
  const value = Number.parseInt(first, 16);
  if (!Number.isInteger(value)) return true;
  return (value & 0xfe00) === 0xfc00   // fc00::/7 unique local
    || (value & 0xffc0) === 0xfe80;    // fe80::/10 link local
}

// 校验通过返回规范化的 URL 对象（末尾带斜杠，便于拼接相对路径）
export function assertPublicHttpUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error(`非法 URL: ${raw}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`仅允许 http/https 协议，收到 ${url.protocol}`);
  }
  const host = url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (!host) throw new Error('URL 缺少主机名');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error(`拒绝本机/内网主机: ${host}`);
  }
  if (net.isIPv4(host)) {
    if (isPrivateIPv4(host)) throw new Error(`拒绝私有/保留地址: ${host}`);
  } else if (net.isIPv6(host)) {
    if (isPrivateIPv6(host)) throw new Error(`拒绝私有/保留地址: ${host}`);
  }
  const normalized = new URL(url.toString());
  normalized.pathname = normalized.pathname.replace(/\/+$/, '') + '/';
  return normalized;
}

function apiEndpoint(config, relativePath) {
  const base = assertPublicHttpUrl(config.baseUrl);
  return new URL(relativePath.replace(/^\/+/, ''), base);
}

// 纯函数：把参数面映射为 gpt-image CLI 参数（可测）
export function buildGptImageArgs({prompt, outFile, model = 'gpt-image-2.5-flare', size = 'landscape',
  quality = 'medium', referenceImages = [], inputFidelity, background, format, moderation}) {
  if (!String(prompt || '').trim()) throw new Error('prompt 不能为空');
  const args = ['--model', model, '--quality', quality, '--size', size,
    '-p', String(prompt), '-f', String(outFile)];
  for (const ref of referenceImages) args.push('-i', String(ref));
  if (inputFidelity) args.push('--input-fidelity', inputFidelity);
  if (background) {
    args.push('--background', background);
    if (background === 'transparent' && format !== 'webp') args.push('--format', 'png');
  } else if (format) {
    args.push('--format', format);
  }
  if (moderation) args.push('--moderation', moderation);
  return args;
}

// 依 SKILL.md 的 CLI resolution：优先 repo 内 launcher（本机 python 已满足 >=3.11 与 openai 依赖）
async function runGptImageCli({args, apiKey, baseUrl, timeoutMs = 480000}) {
  const launcher = path.join(SKILL_REPO_DIR, 'skills', 'gpt-image', 'scripts', 'generate.py');
  if (!existsSync(launcher)) {
    throw new Error(`GPT-Image2-Skill 未就绪，请先执行：${SKILL_CLONE_HINT}`);
  }
  if (baseUrl) assertPublicHttpUrl(baseUrl);
  const env = {...process.env};
  if (apiKey) env.OPENAI_API_KEY = apiKey;
  if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
  try {
    const {stdout} = await execFileAsync('python', [launcher, ...args],
      {env, timeout:timeoutMs, maxBuffer:16 * 1024 * 1024, windowsHide:true});
    return {stdout:String(stdout || '')};
  } catch (error) {
    const detail = String(error?.stderr || error?.stdout || error?.message || error).slice(-400);
    throw new Error(`gpt-image CLI 失败: ${detail}`);
  }
}

// 图生图/文生图：-i 带参考图时 CLI 自动走 edits 端点，否则走 generations
export async function generateAiCover({config, prompt, outFile, ratio = '16:9', quality = 'medium', model,
  referenceImages = [], inputFidelity, background}) {
  if (!config.apiKey) throw new Error('未配置 OPENAI_API_KEY，AI 生成不可用');
  const size = ratio === '9:16' ? 'portrait' : 'landscape';
  const resolvedModel = model || config.imageModel;
  const args = buildGptImageArgs({prompt, outFile, model:resolvedModel, size, quality,
    referenceImages, inputFidelity, background});
  await runGptImageCli({args, apiKey:config.apiKey, baseUrl:config.baseUrl});
  if (!existsSync(outFile)) throw new Error('CLI 执行完成但未产出图像文件');
  return {file:outFile, size, quality, model:resolvedModel, references:referenceImages.length};
}

function parseJsonObject(text) {
  const candidate = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] || text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('返回内容不是 JSON 对象');
  return JSON.parse(candidate.slice(start, end + 1));
}

const REVERSE_SYSTEM = `你是图像提示词反推专家，依据 get-prompt-from-image 分析框架工作。
先在内部判定图像媒介（摄影/写实3D/插画/平面矢量/海报排版/UI 等），提取 3-5 个最影响还原度的视觉锚点
（构图、主体特征、光线、材质、色彩关系、空间层次、关键情绪），把它们放在 prompt 的前三分之一。
不得虚构不存在的品牌、文字、物体或参数；抽象词必须用具体视觉元素解释；明确媒介边界。
用 negative_prompt 排除混淆媒介与常见生成缺陷。
只输出一个 JSON 对象：{"medium":"...","anchors":["...","..."],"prompt":"可复用的完整提示词","negative_prompt":"..."}`;

// 依 get-prompt-from-image skill：从参考图反推高保真提示词（含负向提示词）
export async function reversePromptFromImage({config, imageFile, timeoutMs = 120000}) {
  if (!config.apiKey) throw new Error('未配置 OPENAI_API_KEY，AI 反推不可用');
  const endpoint = apiEndpoint(config, 'chat/completions');
  const base64 = readFileSync(imageFile).toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {method:'POST',
      headers:{Authorization:`Bearer ${config.apiKey}`, 'Content-Type':'application/json'},
      signal:controller.signal,
      body:JSON.stringify({
        model:config.chatModel,
        temperature:0.4,
        messages:[
          {role:'system', content:REVERSE_SYSTEM},
          {role:'user', content:[
            {type:'image_url', image_url:{url:`data:image/png;base64,${base64}`}},
            {type:'text', text:'反推这张图的可复用提示词，按要求输出 JSON。'},
          ]},
        ],
      })});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(payload?.error?.message || response.statusText || '').slice(0, 300);
      throw new Error(`OpenAI chat 接口失败 HTTP ${response.status}: ${message}`);
    }
    const text = payload?.choices?.[0]?.message?.content || '';
    const parsed = parseJsonObject(text);
    if (!parsed.prompt) throw new Error('反推结果缺少 prompt 字段');
    return {medium:parsed.medium || '', anchors:parsed.anchors || [],
      prompt:parsed.prompt, negativePrompt:parsed.negative_prompt || ''};
  } finally {
    clearTimeout(timer);
  }
}

// 依文案内容策划封面：提炼核心观点 → 海报级生图提示词（标题必须来自文案，不编造）
export async function generateScriptCoverPrompt({config, text, timeoutMs = 90000}) {
  if (!config.apiKey) throw new Error('未配置 OPENAI_API_KEY，文案提炼不可用');
  const endpoint = apiEndpoint(config, 'chat/completions');
  const script = String(text || '').trim().slice(0, 6000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {method:'POST',
      headers:{Authorization:`Bearer ${config.apiKey}`, 'Content-Type':'application/json'},
      signal:controller.signal,
      body:JSON.stringify({
        model:config.chatModel,
        temperature:0.7,
        messages:[
          {role:'system', content:'你是短视频封面策划师。阅读口播文案，提炼 1-2 句核心观点，'
            + '据此设计一张海报级封面的生图提示词：主视觉概念要直接呼应核心观点，'
            + '说明构图、风格、配色与氛围；封面必须出现的精确中文大字标题不超过 12 字'
            + '且必须来自文案原意，不得编造数据或夸大。'
            + '只输出 JSON：{"viewpoint":"核心观点","title":"封面大字标题","prompt":"完整的图像生成提示词"}'},
          {role:'user', content:`口播文案：\n${script}`},
        ],
      })});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(payload?.error?.message || response.statusText || '').slice(0, 300);
      throw new Error(`OpenAI chat 接口失败 HTTP ${response.status}: ${message}`);
    }
    const content = payload?.choices?.[0]?.message?.content || '';
    const parsed = parseJsonObject(content);
    if (!parsed.prompt) throw new Error('文案提炼结果缺少 prompt 字段');
    return {viewpoint:parsed.viewpoint || '', title:parsed.title || '', prompt:parsed.prompt};
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonArray(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('AI 标题返回内容不是 JSON 数组');
  const parsed = JSON.parse(candidate.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('AI 标题返回内容不是 JSON 数组');
  return parsed.map(item => String(item)).filter(Boolean);
}

// LLM 增强标题文案；失败向上抛错，由调用方决定是否回退规则生成
export async function generateAiTitles({config, topic, keywords = [], platform = 'general', count = 8, timeoutMs = 60000}) {
  if (!config.apiKey) throw new Error('未配置 OPENAI_API_KEY，AI 标题不可用');
  const endpoint = apiEndpoint(config, 'chat/completions');
  const keywordText = keywords.map(item => String(item).trim()).filter(Boolean).join('、') || '无';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {method:'POST',
      headers:{Authorization:`Bearer ${config.apiKey}`, 'Content-Type':'application/json'},
      signal:controller.signal,
      body:JSON.stringify({
        model:config.chatModel,
        temperature:0.9,
        messages:[
          {role:'system', content:'你是中文短视频标题写手。只输出一个 JSON 字符串数组，不要解释。标题要具体、有钩子、不夸大不虚假。'},
          {role:'user', content:`主题：${topic}\n关键词：${keywordText}\n平台：${platform}\n输出 ${count} 条候选标题。`},
        ],
      })});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(payload?.error?.message || response.statusText || '').slice(0, 300);
      throw new Error(`OpenAI chat 接口失败 HTTP ${response.status}: ${message}`);
    }
    const text = payload?.choices?.[0]?.message?.content || '';
    return parseJsonArray(text).slice(0, count)
      .map(item => ({text:item, pattern:'ai', length:item.length, fitsLimit:true}));
  } finally {
    clearTimeout(timer);
  }
}

// 保留：写文件场景（如把 CLI 的 stdout 落盘）在调用方完成；此处仅提供公共小工具
export function writeImageFile(outFile, buffer) {
  mkdirSync(path.dirname(outFile), {recursive:true});
  writeFileSync(outFile, buffer);
  return outFile;
}
