// 视频外包装 - 共享路由层：packaging-server.mjs（独立 5270 端口）与 console-server.mjs（8765 主台）
// 通过 packagingHandle() 共用同一套 /api/packaging/* 实现，保证两个入口行为一致。
import crypto from 'node:crypto';
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractFrame, extractFrameCandidates, probeVideo} from './packaging-media.mjs';
import {composeCover, composeTitleCard, probeImage} from './packaging-compose.mjs';
import {generateTitles} from './packaging-titles.mjs';
import {generateAiCover, generateAiTitles, reversePromptFromImage, generateScriptCoverPrompt,
  MODEL_CHOICES, QUALITY_TIERS} from './packaging-ai.mjs';
import {galleryCategories, galleryEntryCount, listGalleryEntries, getGalleryEntry,
  galleryAvailable, listCoverEntries, coverEntryCount, isCoverCategory, SKILL_CLONE_HINT} from './packaging-gallery.mjs';
import {packagingAiReadiness, packagingRuntimeConfig, writeStoredPackagingConfig} from './packaging-provider-config.mjs';
import {readPackagingTheme} from './packaging-theme.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(MODULE_DIR, '..');
export const PACKAGING_PREFIX = '/api/packaging/';
const RUNS_DIR = path.join(ROOT, 'director', 'packaging-runs');
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|mkv)$/i;

const tasks = new Map();

function requireVideo(raw) {
  const video = String(raw || '').trim();
  if (!video || !VIDEO_EXT.test(video)) throw new Error('请提供 mp4/mov/webm/mkv 视频路径');
  if (!existsSync(video)) throw new Error(`视频不存在: ${video}`);
  return video;
}

function requireRun(runId) {
  if (!RUN_ID.test(String(runId || ''))) throw new Error('runId 格式不合法');
  const runDir = path.join(RUNS_DIR, runId);
  const metaFile = path.join(runDir, 'meta.json');
  if (!existsSync(metaFile)) throw new Error(`运行不存在: ${runId}`);
  return {runDir, meta:JSON.parse(readFileSync(metaFile, 'utf8'))};
}

function ensureRunDir() {
  const id = crypto.randomUUID();
  const dir = path.join(RUNS_DIR, id);
  mkdirSync(dir, {recursive:true});
  return {runId:id, runDir:dir};
}

function staticUrl(file) {
  return '/' + path.relative(ROOT, file).replace(/\\/g, '/');
}

// ===== 最新成片检测与去重 =====

// 纯函数：某条运行记录是否对应给定视频（路径一致 + mtime 一致；旧记录无 mtime 时按路径兜底）
export function matchRunMeta(meta, videoPath, mtimeMs) {
  if (!meta || meta.video !== videoPath) return false;
  if (typeof meta.videoMtimeMs === 'number') return Math.abs(meta.videoMtimeMs - mtimeMs) < 2;
  return true;
}

function scanRunsWithMeta() {
  const runs = [];
  if (!existsSync(RUNS_DIR)) return runs;
  let entries;
  try { entries = readdirSync(RUNS_DIR, {withFileTypes:true}); } catch { return runs; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaFile = path.join(RUNS_DIR, entry.name, 'meta.json');
    if (!existsSync(metaFile)) continue;
    try {
      runs.push({runId:entry.name, runDir:path.join(RUNS_DIR, entry.name),
        meta:JSON.parse(readFileSync(metaFile, 'utf8'))});
    } catch {}
  }
  return runs;
}

function findCoverArtifact(runDir) {
  for (const name of ['cover-16x9.jpg', 'cover-9x16.jpg']) {
    if (existsSync(path.join(runDir, name))) return staticUrl(path.join(runDir, name));
  }
  let aiCovers = [];
  try { aiCovers = readdirSync(runDir).filter(name => /^ai-cover-.*\.png$/.test(name)).sort(); } catch {}
  if (aiCovers.length) return staticUrl(path.join(runDir, aiCovers.at(-1)));
  return null;
}

function latestVideoInfo() {
  const videos = listCandidateVideos();
  let latest = null;
  for (const video of videos) {
    try {
      const mtimeMs = statSync(video.path).mtimeMs;
      if (!latest || mtimeMs > latest.mtimeMs) latest = {...video, mtimeMs};
    } catch {}
  }
  return latest;
}

// 最新成片 + 是否已做过封面（做过 = 存在路径/mtime 匹配且含封面成品的运行）
export function packagingLatest() {
  const latest = latestVideoInfo();
  if (!latest) return {video:null, done:false, latestCover:null};
  const matches = scanRunsWithMeta().filter(run => matchRunMeta(run.meta, latest.path, latest.mtimeMs));
  let latestCover = null;
  for (const run of matches) {
    const url = findCoverArtifact(run.runDir);
    if (url) { latestCover = {url, runId:run.runId, createdAt:run.meta.createdAt || ''}; break; }
  }
  return {video:latest, done:Boolean(latestCover), latestCover};
}

function listCandidateVideos() {
  const found = new Set();
  const scan = (dir, depth) => {
    if (depth > 4 || !existsSync(dir)) return;
    let entries;
    try { entries = readdirSync(dir, {withFileTypes:true}); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(full, depth + 1);
      else if (VIDEO_EXT.test(entry.name)) found.add(full);
    }
  };
  scan(path.join(ROOT, 'template', 'out'), 0);
  scan(path.join(ROOT, 'director', 'b-mode-runs'), 0);
  return [...found].sort().slice(0, 80).map(file => {
    let sizeMb = 0;
    let modified = '';
    try {
      const stats = statSync(file);
      sizeMb = Math.round(stats.size / 1048576 * 10) / 10;
      modified = stats.mtime.toISOString().slice(0, 10);
    } catch {}
    return {path:file, name:path.basename(file), dir:path.dirname(file).slice(ROOT.length + 1), sizeMb, modified};
  });
}

function startTask(work) {
  const taskId = crypto.randomUUID();
  const entry = {status:'running', log:[], result:null, error:null};
  tasks.set(taskId, entry);
  const log = line => entry.log.push(`[${new Date().toLocaleTimeString('zh-CN')}] ${line}`);
  (async () => {
    try {
      entry.result = await work(log);
      entry.status = 'done';
      log('任务完成');
    } catch (error) {
      entry.status = 'error';
      entry.error = String(error?.message || error);
      log(`失败：${entry.error}`);
    }
  })();
  return taskId;
}

// 从成片路径推导 b-mode 运行目录并读取口播文案（input.txt > talkcraft/input.txt > script.txt）
export function bModeRunDirFromVideo(videoPath) {
  const normalized = String(videoPath || '').replace(/\\/g, '/');
  const match = /b-mode-runs\/([0-9a-f]{8}-[0-9a-f-]{27,})\//i.exec(normalized);
  return match ? path.join(ROOT, 'director', 'b-mode-runs', match[1]) : null;
}

export function resolveRunScript(videoPath) {
  const runDir = bModeRunDirFromVideo(videoPath);
  if (!runDir || !existsSync(runDir)) return null;
  for (const rel of ['input.txt', 'talkcraft/input.txt', 'talkcraft/script.txt']) {
    const file = path.join(runDir, rel);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8').trim();
    if (text) return {text:text.slice(0, 8000), source:rel};
  }
  return null;
}

const routes = {
  'GET /api/packaging/health': () => ({ok:true, service:'video-packaging'}),
  'GET /api/packaging/theme': () => ({ok:true, ...readPackagingTheme()}),
  'GET /api/packaging/videos': () => ({ok:true, videos:listCandidateVideos()}),
  'GET /api/packaging/latest': () => ({ok:true, ...packagingLatest()}),
  'POST /api/packaging/prepare': body => {
    const video = body.video ? requireVideo(body.video) : latestVideoInfo()?.path;
    if (!video) throw new Error('未发现任何成片视频（template/out 与 b-mode-runs 均为空）');
    const mtimeMs = statSync(video).mtimeMs;
    const matches = scanRunsWithMeta().filter(run => matchRunMeta(run.meta, video, mtimeMs));
    if (!body.force) {
      for (const run of matches) {
        const url = findCoverArtifact(run.runDir);
        if (url) return {ok:true, done:true, latestCover:{url, runId:run.runId,
          createdAt:run.meta.createdAt || ''}, video, mtimeMs};
      }
      // 抽过帧但还没出图的运行直接复用，避免重复抽帧
      for (const run of matches) {
        const frames = (run.meta.frames || []).filter(frame => existsSync(frame.file));
        if (frames.length) {
          return {ok:true, done:false, reused:true, runId:run.runId,
            durationSeconds:run.meta.videoDurationSeconds, videoSize:run.meta.videoSize,
            frames:frames.map(frame => ({time:frame.time, url:staticUrl(frame.file)})), video, mtimeMs};
        }
      }
    }
    const {runId, runDir} = ensureRunDir();
    const info = extractFrameCandidates(video, {count:Math.min(10, Math.max(3, Number(body.count) || 6)),
      outDir:path.join(runDir, 'frames'), thumbWidth:480});
    const meta = {schema:'packaging-run-v1', runId, video, createdAt:new Date().toISOString(),
      videoMtimeMs:mtimeMs, videoDurationSeconds:info.durationSeconds,
      videoSize:{width:info.width, height:info.height},
      frames:info.frames.map(frame => ({time:frame.time, file:frame.file}))};
    writeFileSync(path.join(runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    return {ok:true, done:false, runId, durationSeconds:info.durationSeconds,
      videoSize:{width:info.width, height:info.height},
      frames:info.frames.map(frame => ({time:frame.time, url:staticUrl(frame.file)}))};
  },
  'GET /api/packaging/probe': (body, url) => ({ok:true, ...probeVideo(requireVideo(url.searchParams.get('video')))}),
  'GET /api/packaging/task': (body, url) => {
    const id = String(url.searchParams.get('id') || '');
    const entry = tasks.get(id);
    if (!entry) throw new Error('任务不存在或已过期');
    return {ok:true, id, status:entry.status, log:entry.log.slice(-50), result:entry.result, error:entry.error};
  },
  'GET /api/packaging/ai/config': () => ({ok:true, ...packagingAiReadiness(),
    models:MODEL_CHOICES, qualityTiers:QUALITY_TIERS, galleryAvailable:galleryAvailable()}),
  'POST /api/packaging/ai/config': body => {
    writeStoredPackagingConfig({
      openaiBaseUrl:body.openaiBaseUrl, openaiImageModel:body.openaiImageModel,
      openaiChatModel:body.openaiChatModel, openaiApiKey:body.openaiApiKey,
    });
    return {ok:true, saved:true, ...packagingAiReadiness()};
  },
  'GET /api/packaging/gallery': () => {
    if (!galleryAvailable()) {
      return {ok:true, available:false, hint:`图库未就绪，请执行：${SKILL_CLONE_HINT}`};
    }
    return {ok:true, available:true, total:galleryEntryCount(), coverTotal:coverEntryCount(),
      categories:galleryCategories().map(category => ({
        ...category, coverFit:isCoverCategory(category.id),
      }))};
  },
  'GET /api/packaging/gallery/entries': (body, url) => {
    const categoryId = url.searchParams.get('category');
    let entries;
    if (!categoryId || categoryId === 'cover-fit') {
      entries = listCoverEntries();
    } else if (isCoverCategory(categoryId) || galleryCategories().some(item => item.id === categoryId)) {
      entries = listGalleryEntries(categoryId);
    } else {
      throw new Error(`未知图库分类: ${categoryId}`);
    }
    return {ok:true, entries};
  },
  'GET /api/packaging/gallery/entry': (body, url) => {
    const entry = getGalleryEntry(url.searchParams.get('id'));
    if (!entry) throw new Error('图库条目不存在');
    return {ok:true, entry};
  },
  'POST /api/packaging/frames': body => {
    const video = requireVideo(body.video);
    const {runId, runDir} = ensureRunDir();
    const info = extractFrameCandidates(video, {count:Math.min(10, Math.max(3, Number(body.count) || 6)),
      outDir:path.join(runDir, 'frames'), thumbWidth:480});
    writeFileSync(path.join(runDir, 'meta.json'), JSON.stringify({schema:'packaging-run-v1', runId,
      video, createdAt:new Date().toISOString(), videoMtimeMs:statSync(video).mtimeMs,
      videoDurationSeconds:info.durationSeconds, videoSize:{width:info.width, height:info.height},
      frames:info.frames.map(frame => ({time:frame.time, file:frame.file}))}, null, 2), 'utf8');
    return {ok:true, runId, durationSeconds:info.durationSeconds,
      videoSize:{width:info.width, height:info.height},
      frames:info.frames.map(frame => ({time:frame.time, url:staticUrl(frame.file)}))};
  },
  'POST /api/packaging/cover': body => {
    const {runDir, meta} = requireRun(body.runId);
    const ratio = body.ratio === '9:16' ? '9:16' : '16:9';
    const result = composeCover({videoFile:meta.video, timeSeconds:body.time,
      title:body.title, subtitle:body.subtitle || '', ratio,
      overlayStrength:body.overlayStrength, theme:readPackagingTheme(),
      outFile:path.join(runDir, `cover-${ratio.replace(':', 'x')}.jpg`), workDir:runDir});
    const dims = probeImage(result.file);
    return {ok:true, url:staticUrl(result.file), file:result.file, lines:result.lines, ...dims};
  },
  'POST /api/packaging/title-card': body => {
    const {runDir} = body.runId ? requireRun(body.runId) : ensureRunDir();
    const ratio = body.ratio === '9:16' ? '9:16' : '16:9';
    const result = composeTitleCard({title:body.title, subtitle:body.subtitle || '', ratio,
      theme:readPackagingTheme(), outFile:path.join(runDir, `title-card-${ratio.replace(':', 'x')}.png`), workDir:runDir});
    const dims = probeImage(result.file);
    return {ok:true, url:staticUrl(result.file), file:result.file, lines:result.lines, ...dims};
  },
  'POST /api/packaging/titles': body => ({ok:true, titles:generateTitles(body)}),
  'POST /api/packaging/ai/titles': body => {
    const config = packagingRuntimeConfig();
    const taskId = startTask(async () => {
      const titles = await generateAiTitles({config, topic:body.topic, keywords:body.keywords,
        platform:body.platform, count:body.count});
      return {titles};
    });
    return {ok:true, taskId};
  },
  'GET /api/packaging/script': (body, url) => {
    let video = url.searchParams.get('video');
    if (!video && url.searchParams.get('runId')) {
      video = requireRun(url.searchParams.get('runId')).meta.video;
    }
    if (!video) throw new Error('需要 runId 或 video 参数');
    const script = resolveRunScript(video);
    return {ok:true, text:script?.text || '', source:script?.source || null};
  },
  'POST /api/packaging/ai/script-prompt': body => {
    const config = packagingRuntimeConfig();
    let text = String(body.text || '').trim();
    let source = '手动粘贴';
    if (!text && body.runId) {
      const script = resolveRunScript(requireRun(body.runId).meta.video);
      text = script?.text || '';
      source = script?.source || source;
    }
    if (!text) throw new Error('未找到口播文案：该成片没有关联文案，请在输入框手动粘贴');
    const taskId = startTask(async log => {
      log(`读取文案 ${text.length} 字（${source}），提炼核心观点`);
      const result = await generateScriptCoverPrompt({config, text});
      log('提示词已生成');
      return result;
    });
    return {ok:true, taskId};
  },
  'POST /api/packaging/ai/cover': body => {
    const config = packagingRuntimeConfig();
    const ratio = body.ratio === '9:16' ? '9:16' : '16:9';
    const quality = QUALITY_TIERS.includes(body.quality) ? body.quality : 'medium';
    // 图库模板：完整复用其实测 prompt，用户补充内容以「追加调整」并入，不改动原模板文案
    let prompt = String(body.prompt || '').trim();
    let templateTitle = '';
    if (body.galleryId) {
      const entry = getGalleryEntry(String(body.galleryId));
      if (!entry || !entry.prompt) throw new Error(`图库条目无效或缺少 prompt: ${body.galleryId}`);
      templateTitle = `No.${entry.no} ${entry.title}`;
      const tweak = String(body.tweak || '').trim();
      prompt = tweak ? `${entry.prompt}\n\nAdditional adjustment for this cover: ${tweak}` : entry.prompt;
    }
    if (!prompt) throw new Error('AI 封面需要提示词或图库模板');
    const useFrame = body.useFrame !== false && Boolean(body.runId);
    const taskId = startTask(async log => {
      const referenceImages = [];
      let outFile;
      let runDir;
      if (useFrame) {
        const run = requireRun(body.runId);
        runDir = run.runDir;
        log(`从视频抽取 ${body.time}s 参考帧`);
        const framePng = path.join(runDir, 'ai-source-frame.png');
        extractFrame(run.meta.video, body.time, framePng);
        referenceImages.push(framePng);
        outFile = path.join(runDir, `ai-cover-${Date.now()}.png`);
      } else {
        runDir = body.runId ? requireRun(body.runId).runDir : ensureRunDir().runDir;
        outFile = path.join(runDir, `ai-cover-${Date.now()}.png`);
      }
      log(`调用 ${config.imageModel}（quality=${quality}，参考图 ${referenceImages.length} 张）`);
      const result = await generateAiCover({config, prompt, outFile, ratio, quality,
        model:body.model, referenceImages, inputFidelity:body.inputFidelity,
        background:body.background});
      log(`完成，${Math.round(statSync(result.file).size / 1024)} KB`);
      return {url:staticUrl(result.file), file:result.file, size:result.size,
        quality:result.quality, model:result.model, template:templateTitle};
    });
    return {ok:true, taskId};
  },
  'POST /api/packaging/ai/reverse': body => {
    const config = packagingRuntimeConfig();
    const {runDir, meta} = requireRun(body.runId);
    const taskId = startTask(async log => {
      log(`从视频抽取 ${body.time}s 画面用于反推`);
      const framePng = path.join(runDir, `reverse-source-${Date.now()}.png`);
      extractFrame(meta.video, body.time, framePng);
      log(`请求 ${config.chatModel} 分析画面`);
      const result = await reversePromptFromImage({config, imageFile:framePng});
      log('反推完成');
      return result;
    });
    return {ok:true, taskId};
  },
};

// 统一入口：命中返回 {status, payload}；非 packaging 路径返回 null 交回调用方
export async function packagingHandle(method, pathname, url, readJson) {
  if (!pathname.startsWith(PACKAGING_PREFIX)) return null;
  const route = routes[`${method} ${pathname}`];
  if (!route) return {status:404, payload:{ok:false, error:`未知路由 ${method} ${pathname}`}};
  try {
    let body = {};
    if (method === 'POST') body = await readJson();
    return {status:200, payload: await route(body, url)};
  } catch (error) {
    return {status:400, payload:{ok:false, error:String(error?.message || error)}};
  }
}
