// Video ShotCraft console server
import http from "node:http";
import {readTalkcraftExecutions,talkcraftExecutionView} from "./director/talkcraft-execution.mjs";
import {probeTaskExecution} from "./director/task-execution-readiness.mjs";
import crypto from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {Agent} from 'undici';
import {loadAcceptanceFixture} from "./director/b-mode-acceptance.mjs";
import {resolveLibraryVideo} from "./director/b-mode-library-video.mjs";
import {loadMaterialIndex, matchSceneVideos} from "./director/b-mode-material-match.mjs";
import {materialMatchPreviewEnabled, previewMaterialMatches, readMaterialMatchPreviewBody} from "./director/material-match-preview.mjs";
import {createTalkcraftInput} from "./director/talkcraft-input.mjs";
import {createTimingRecovery, timingHealth} from './director/talkcraft-native-timing.mjs';
import {assertTalkcraftCardCallsBound, readTalkcraftCardCalls, readTalkcraftCardOptions,
  writeTalkcraftCardCalls} from "./director/talkcraft-card-calls.mjs";
import {buildTalkcraftAuditSegments} from "./director/talkcraft-audit-segments.mjs";
import {approveTalkcraftSample, approveTalkcraftStoryboard, latestTalkcraftRun, prepareTalkcraftStoryboardRevision, readTalkcraftStatus, requestTalkcraftStoryboardAdjustment, talkcraftProject} from "./director/talkcraft-status.mjs";
import {readTalkcraftWorkbench, startTalkcraftWorkbench} from "./director/talkcraft-workbench.mjs";
import {resolveTalkcraftSkillRoot} from "./director/talkcraft-skill-root.mjs";
import {latestTalkcraftFailureReport, writeTalkcraftFailureReport} from "./director/talkcraft-failure-report.mjs";
import {normalizeTheme, readCurrentTheme, writeCurrentTheme} from "./director/theme-contract.mjs";
import {runningHubRuntimeConfig} from "./director/api-center.mjs";
import {getVolcengineVoiceStatus, trainVolcengineVoice, volcengineVoiceReadiness} from "./director/volcengine-voice.mjs";
import {synthesizeVolcengineTts2} from "./director/volcengine-tts2.mjs";
import {validateSpeechRate} from "./director/voice-speed.mjs";
import {createVoicePreviewCache} from "./director/voice-preview-cache.mjs";
import {readStoredProviderConfig, writeStoredProviderConfig} from "./director/provider-config.mjs";
import {checkProviderConnectivity} from "./director/provider-connectivity.mjs";
import {packagingHandle, PACKAGING_PREFIX} from "./director/packaging-routes.mjs";
import {readSubtitleSettings, writeSubtitleSettings} from "./director/subtitle-v1.mjs";
import {normalizeMusicSelection, readMusicSelection, writeMusicSelection, writeTalkcraftMusicSnapshot} from "./director/background-music.mjs";
import {audioFile, indexAudioFile, listAudioLibrary, recommendBackgroundMusic, updateAudioMetadata, uploadAudio} from "./director/audio-library.mjs";
import {assertModeCRun, runModeCStage} from "./director/mode-c/mode-c-dispatcher.mjs";
import {aModeRunDir, checkAModeReadiness, createAModeRun, createAModeRevisionRun, failAModeRun, latestAModeRun, readAModeRun, validateAModeInput, processAlive, markAModeRender} from "./director/a-mode-run.mjs";
import {aModeReadiness, writeStoredAModeConfig} from "./director/a-mode-provider-config.mjs";
import {preflightAModeRender} from "./director/a-mode-render-preflight.mjs";
import {readRenderProgress} from './director/render-runtime.mjs';
import {assertProductionOutputDirectory} from './director/governance-output-guard.mjs';

const ROOT = process.env.SHOTCRAFT_ROOT || "E:\\video-shotcraft";
const taskExecution = await probeTaskExecution({cwd:ROOT});
const PORT = Number(process.env.PORT || 8765);
const DEFAULT_OUTPUT_DIR = path.join(ROOT, "template", "out");
const OUTPUT_CONFIG_FILE = path.join(ROOT, ".shotcraft-output.json");
const CHROME = "C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const PYTHON = "C:\\Users\\Administrator\\AppData\\Local\\Python\\bin\\python.exe";
const A_MODE_SUPERVISOR_URL = process.env.A_MODE_SUPERVISOR_URL || "http://127.0.0.1:8772/run";
// The bridge responds only after a worker finishes; rendering can exceed fetch's default five-minute header timeout.
const bridgeDispatcher = new Agent({headersTimeout:0, bodyTimeout:0});

let taskId = 0;
const tasks = new Map();
const aHistoryFile = path.join(ROOT, 'director', 'a-mode-runs', 'task-history.json');
try {
  for (const task of JSON.parse(fs.readFileSync(aHistoryFile, 'utf8'))) {
    if (!['a-director','render'].includes(task.name) || !['done','error'].includes(task.status)) continue;
    tasks.set(task.id, {...task, proc:null});
    taskId = Math.max(taskId, task.id);
  }
} catch {}
function saveAModeTaskHistory() {
  const finished = [...tasks.values()].filter(task => ['a-director','render'].includes(task.name) && ['done','error'].includes(task.status))
    .map(({id,name,status,logs,startedAt,error,exitCode,runId}) => ({id,name,status,logs,startedAt,error,exitCode,runId}));
  fs.mkdirSync(path.dirname(aHistoryFile), {recursive:true});
  fs.writeFileSync(aHistoryFile + '.tmp', JSON.stringify(finished), 'utf8');
  fs.renameSync(aHistoryFile + '.tmp', aHistoryFile);
}
let aModeRequestPending = false;
const operationFile = path.join(ROOT, 'director', 'a-mode-runs', 'operation.json');
function readAModeOperation() {
  try { return JSON.parse(fs.readFileSync(operationFile, 'utf8')); } catch { return null; }
}
function acquireAModeOperation() {
  const active = [...tasks.values()].find(task => ['a-director', 'render'].includes(task.name) &&
    ['starting','running','stopping'].includes(task.status));
  const saved = readAModeOperation();
  if (aModeRequestPending || active || (saved?.status === 'running' && processAlive(saved.pid)))
    throw new Error('已有编导或渲染任务正在执行，请等待结束；未启动重复任务');
  aModeRequestPending = true;
  return () => { aModeRequestPending = false; };
}
const VOICE_PREVIEW_TEXT = "你好，欢迎试听我的声音。";
const voicePreviewCache = createVoicePreviewCache(ROOT, VOICE_PREVIEW_TEXT, async ({text, speakerId, speechRate}) =>
  (await synthesizeVolcengineTts2({text, speakerId, speechRate})).audioBytes);

function readOutputDir() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(OUTPUT_CONFIG_FILE, "utf8"));
  } catch {}
  if (typeof config?.path === "string" && config.path.trim())
    return assertProductionOutputDirectory(ROOT, path.resolve(config.path.trim()));
  return DEFAULT_OUTPUT_DIR;
}

function writeOutputDir(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("导出路径无效");
  const outputDir = assertProductionOutputDirectory(ROOT, path.resolve(raw));
  if (!path.isAbsolute(outputDir) || outputDir.length < 3) throw new Error("导出路径无效");
  fs.mkdirSync(outputDir, { recursive: true });
  assertProductionOutputDirectory(ROOT, outputDir);
  fs.writeFileSync(OUTPUT_CONFIG_FILE, JSON.stringify({ path: outputDir }, null, 2), "utf8");
  return outputDir;
}

function parseDirectNodeCommand(command) {
  const match = /^node\s+([^\s]+)(?:\s+(.+))?$/u.exec(String(command || '').trim());
  if (!match) return null;
  const tail = match[2] ? [...match[2].matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s]+)/gu)]
    .map(item => item[1] ?? item[2] ?? item[3]) : [];
  return {file:process.execPath, args:[match[1], ...tail]};
}

function startTask(name, cmd, cwd, extraEnv = {}) {
  if (!taskExecution.ok) throw new Error(taskExecution.error);
  const id = ++taskId;
  const inferredRunId = String(cmd || "").match(/[0-9a-f]{8}-[0-9a-f-]{27,}/iu)?.[0] || null;
  const task = { id, name, cmd, status: "starting", logs: [], startedAt: Date.now(), proc: null, error: null, runId:inferredRunId };
  tasks.set(id, task);
  const markStartFailure = (error) => {
    const code = String(error?.code || "");
    const detail = code === "EPERM"
      ? "Windows 拒绝启动任务进程（EPERM）。请从普通 PowerShell 或 start-console.bat 启动操作台后重试。"
      : `任务进程启动失败${code ? `（${code}）` : ""}：${String(error?.message || error)}`;
    task.error = detail;
    task.logs.push(detail);
    task.exitCode = null;
    task.status = "error";
    if (task.runId && name === 'a-director') {
      try { failAModeRun(ROOT, task.runId, detail); } catch {}
    }
    if (task.runId && name === 'render') {
      try { markAModeRender(ROOT, task.runId, 'error', detail); } catch {}
    }
    if (['a-director','render'].includes(name)) saveAModeTaskHistory();
    if (task.runId && name.startsWith('talkcraft-')) {
      try { task.failureReport = writeTalkcraftFailureReport(ROOT, task.runId, task).report; }
      catch (reportError) { task.logs.push(`失败报告生成失败：${String(reportError.message || reportError)}`); }
    }
  };
  try {
    const direct = parseDirectNodeCommand(cmd);
    const proc = direct
      ? spawn(direct.file, direct.args, {cwd, shell:false, windowsHide:true, env:{...process.env, PYTHONIOENCODING:'utf-8', ...extraEnv}})
      : spawn(cmd, { cwd, shell: true, windowsHide:true, env: {...process.env, PYTHONIOENCODING: "utf-8", ...extraEnv} });
    task.proc = proc;
    task.status = "running";
    if (['a-director', 'render'].includes(name) && proc.pid) {
      fs.mkdirSync(path.dirname(operationFile), {recursive:true});
      fs.writeFileSync(operationFile, JSON.stringify({pid:proc.pid, name, status:'running', startedAt:task.startedAt}), 'utf8');
    }
    proc.stdout.on("data", d => task.logs.push(d.toString()));
    proc.stderr.on("data", d => task.logs.push(d.toString()));
    proc.on("error", markStartFailure);
    proc.on("close", code => {
      if (['a-director', 'render'].includes(name) && readAModeOperation()?.pid === proc.pid)
        fs.writeFileSync(operationFile, JSON.stringify({pid:proc.pid, name, status:'finished', exitCode:code}), 'utf8');
      if (task.error) return;
      task.exitCode = code;
      if (code !== 0 && task.runId && name === 'a-director') {
        try {
          const run = readAModeRun(ROOT, task.runId);
          if (run.status !== 'error' || run.stage === 'interrupted')
            failAModeRun(ROOT, task.runId, `AI 编导进程退出码 ${code}；请查看任务日志`);
        } catch {}
      }
      if (code !== 0 && task.runId && name.startsWith('talkcraft-')) {
        try { task.failureReport = writeTalkcraftFailureReport(ROOT, task.runId, task).report; }
        catch (error) { task.logs.push(`失败报告生成失败：${String(error.message || error)}`); }
      }
      task.status = code === 0 ? "done" : "error";
      if (task.runId && name === 'render') {
        try { markAModeRender(ROOT, task.runId, task.status, code === 0 ? null : task.logs.slice(-3).join('\n').slice(-1500)); } catch {}
      }
      if (['a-director','render'].includes(name)) saveAModeTaskHistory();
    });
  } catch (error) {
    markStartFailure(error);
  }
  return id;
}

function startAModeSupervisorTask(runId, {resumeDirector = false, voice = ""} = {}) {
  const id = ++taskId;
  const task = {id, name:'a-director', cmd:'python director/a-mode-supervisor.py', status:'starting',
    logs:[], startedAt:Date.now(), proc:null, error:null, runId};
  tasks.set(id, task);
  const finish = (result, transportError = null) => {
    if (transportError) {
      task.error = `A 模式任务桥接器不可用：${String(transportError.message || transportError)}`;
      task.logs.push(task.error);
      task.exitCode = null;
      task.status = 'error';
      try { failAModeRun(ROOT, runId, task.error); } catch {}
      saveAModeTaskHistory();
      return;
    }
    if (result?.stdout) task.logs.push(String(result.stdout));
    if (result?.stderr) task.logs.push(String(result.stderr));
    if (result?.error) task.logs.push(String(result.error));
    task.exitCode = result?.exitCode ?? null;
    task.status = result?.ok ? 'done' : 'error';
    if (!result?.ok) {
      const detail = result?.error || `AI 编导进程退出码 ${result?.exitCode ?? '未知'}；请查看任务日志`;
      task.error = detail;
      try { failAModeRun(ROOT, runId, detail); } catch {}
    }
    saveAModeTaskHistory();
  };
  task.status = 'running';
  const request = async () => {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(A_MODE_SUPERVISOR_URL, {
          dispatcher:bridgeDispatcher,
          method:'POST', headers:{'content-type':'application/json'},
          body:JSON.stringify({runId, resumeDirector, voice})
        });
        const result = await response.json().catch(() => ({ok:false, error:`桥接器 HTTP ${response.status}`}));
        if (!response.ok && !result.error) result.error = `桥接器 HTTP ${response.status}`;
        return result;
      } catch (error) {
        lastError = error;
        if (!['ECONNREFUSED', 'ENOTFOUND'].includes(error.cause?.code)) throw error;
        await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
    throw lastError;
  };
  request().then(result => finish(result)).catch(error => finish(null, error));
  return id;
}

function startRenderSupervisorTask(runId, extraEnv) {
  const id = ++taskId;
  const task = {id, name:'render', cmd:'python director/a-mode-supervisor.py /render', status:'running', logs:[], startedAt:Date.now(), proc:null, error:null, runId};
  tasks.set(id, task);
  const request = async () => {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(A_MODE_SUPERVISOR_URL.replace(/\/run$/, '/render'), {method:'POST', headers:{'content-type':'application/json'},
          dispatcher:bridgeDispatcher,
          body:JSON.stringify({kind:'render', runId, env:extraEnv})});
        const result = await response.json().catch(() => ({ok:false,error:`桥接器 HTTP ${response.status}`}));
        if (!response.ok && !result.error) result.error = `桥接器 HTTP ${response.status}`;
        return result;
      } catch (error) {
        lastError = error;
        if (!['ECONNREFUSED', 'ENOTFOUND'].includes(error.cause?.code)) throw error;
        await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    throw lastError;
  };
  request().then(result => {
      if (result.stdout) task.logs.push(String(result.stdout));
      if (result.stderr) task.logs.push(String(result.stderr));
      task.exitCode = result.exitCode ?? null;
      task.status = result.ok ? 'done' : 'error';
      if (!result.ok) task.error = result.error || `渲染进程退出码 ${result.exitCode ?? '未知'}`;
      if (runId) { try { markAModeRender(ROOT, runId, task.status, task.error); } catch {} }
      saveAModeTaskHistory();
    }).catch(error => { task.status='error'; task.error=`渲染桥接器不可用：${error.message || error}`; task.exitCode=null; if(runId){try{markAModeRender(ROOT,runId,'error',task.error)}catch{}} saveAModeTaskHistory(); });
  return id;
}

function stopTask(id) {
  const t = tasks.get(id);
  if (!t || !t.proc) return false;
  try {
    spawn("taskkill", ["/pid", String(t.proc.pid), "/T", "/F"]);
  } catch {}
  t.status = "stopping";
  return true;
}

function sendVideoRange(res, videoPath, rangeHeader, contentType = "video/mp4") {
  const stat = fs.statSync(videoPath);
  if (rangeHeader) {
    const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (!m) { res.writeHead(416); res.end(); return; }
    const start = parseInt(m[1]);
    const end = m[2] ? parseInt(m[2]) : stat.size - 1;
    res.writeHead(206, {
      "Content-Type": contentType,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(videoPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": contentType, "Content-Length": stat.size, "Accept-Ranges": "bytes" });
    fs.createReadStream(videoPath).pipe(res);
  }
}

function sendJson(res, data) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function renderRuntimeReadiness() {
  const check = spawnSync(process.execPath, ['--version'], {encoding:'utf8', timeout:5000, windowsHide:true});
  if (check.error || check.status !== 0) return {ok:false, error:
    `当前操作台进程无法启动 Remotion 子进程（${check.error?.code || check.status || 'unknown'}）。请从普通 Windows 进程启动操作台。`};
  return {ok:true, nodeVersion:String(check.stdout || '').trim()};
}

function sendRetiredAMode(res) {
  res.writeHead(410, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ok: false, error: "A 模式自动编导已停用；已有分镜仍可查看和渲染"}));
}

function sendStatic(res, filePath, maxAge = 0) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".mp4": "video/mp4", ".json": "application/json" }[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime, "Cache-Control": `max-age=${maxAge}` });
  fs.createReadStream(filePath).pipe(res);
}

function talkcraftCardThumbnailPath(cardId) {
  if (!/^[a-z0-9][a-z0-9-]*$/iu.test(String(cardId || ""))) throw new Error("Invalid TalkCraft card thumbnail");
  const root = resolveTalkcraftSkillRoot(ROOT);
  const file = path.resolve(root, "gallery", "thumbs", `${cardId}.png`);
  const base = path.resolve(root, "gallery", "thumbs") + path.sep;
  if (!file.startsWith(base) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return file;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

async function readBModeInput(req, {maxBytes = 8 * 1024 * 1024} = {}) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.startsWith("multipart/form-data")) return { fields: await readBody(req), avatar: null };
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error(`上传内容不能超过 ${Math.round(maxBytes / 1024 / 1024)} MB`);
    chunks.push(chunk);
  }
  const form = await new Request("http://localhost/", {
    method: "POST",
    headers: { "content-type": contentType },
    body: Buffer.concat(chunks),
  }).formData();
  const avatars = form.getAll("avatar").filter(file => file && typeof file.arrayBuffer === "function" && file.size);
  const avatar = avatars[0] || null;
  const cloneAudio = form.get("cloneAudio") || form.get("audio");
  return {
    fields: Object.fromEntries(["text", "voice", "voiceMode", "speechRate", "speakerId", "scenes", "background", "backgroundVideoPath", "prompt", "maxSide", "intensity", "scale", "instanceType", "promptText", "audioFormat", "generationMode", "visualMode"].map(key => [key, form.get(key)])),
    avatar: avatar && typeof avatar.arrayBuffer === "function" && avatar.size ? avatar : null,
    avatars,
    cloneAudio: cloneAudio && typeof cloneAudio.arrayBuffer === "function" && cloneAudio.size ? cloneAudio : null,
  };
}

const STANDARD_VOICES = new Set(["zh-CN-YunxiNeural", "zh-CN-XiaoxiaoNeural"]);
const validSpeakerId = value => /^[A-Za-z0-9_-]{2,128}$/u.test(String(value || ""));
function readVoiceSelection(fields) {
  const voiceMode = ["volcengine-clone", "volcengine-tts2"].includes(fields.voiceMode) ? fields.voiceMode : "standard";
  const voice = String(fields.voice || "zh-CN-YunxiNeural");
  const speakerId = String(fields.speakerId || "").trim();
  if (voiceMode === "standard" && !STANDARD_VOICES.has(voice)) throw new Error("当前仅支持已接通的现成音色");
  if (voiceMode === "volcengine-clone" && !validSpeakerId(speakerId)) throw new Error("火山复刻音色需要有效的 speaker_id");
  if (voiceMode === "volcengine-tts2" && !/^[A-Za-z0-9_-]{2,256}$/u.test(speakerId)) throw new Error("火山语音合成 2.0 需要有效的音色 ID");
  return {voiceMode, voice, speechRate:validateSpeechRate(fields.speechRate), speakerId: voiceMode === "standard" ? null : speakerId};
}

function withTalkcraftWorkbench(run) {
  const project=talkcraftProject(ROOT,run.runId);
  const executions=readTalkcraftExecutions(project);
  const localActive=executions.find(item=>item.status==='running');
  const active=[...tasks.values()].filter(task=>task.runId===run.runId &&
    ['starting','running','stopping'].includes(task.status)).at(-1);
  const activeTask=active ? {id:active.id,name:active.name,status:active.status,startedAt:active.startedAt,
    message:localActive?.name===active.name?localActive.message:null} : localActive ? {
      id:'execution:'+localActive.executionId,name:localActive.name,status:localActive.status,
      startedAt:localActive.startedAt,message:localActive.message,external:true} : null;
  const failureReport=latestTalkcraftFailureReport(ROOT,run.runId);
  const recent=executions[0];
  const localFailure=recent && ['error','interrupted'].includes(recent.status) &&
    recent.startedAt>(Date.parse(failureReport?.createdAt||'')||0) ? {
      title:'后端本地执行未通过',cause:recent.error||recent.message,task:{name:recent.name}} : null;
  const status={...run,activeTask,lastFailure:localFailure||failureReport,
    workbenchUrl:readTalkcraftWorkbench(ROOT,run.runId)?.url||null,failureReport};
  return {...status,execution:talkcraftExecutionView(status)};
}

async function createModeCRun(fields, avatars) {
  if (!avatars.length) throw new Error('模式 C 至少需要一张参考图');
  const selection = readVoiceSelection(fields);
  const created = createTalkcraftInput(ROOT, {text:fields.text, ...selection,
    avatarBytes:await Promise.all(avatars.map(async file => Buffer.from(await file.arrayBuffer()))), generationMode:null,
    themeSnapshot:readCurrentTheme(ROOT)});
  const sourceFile = path.join(created.project, 'source-run.json');
  const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  fs.writeFileSync(sourceFile, JSON.stringify({...source, visualMode:'C', modeCConfig:'director/mode-c/mode-c-config.json'}, null, 2), 'utf8');
  const id = startTask('mode-c-bootstrap', `node director/talkcraft-stages.mjs bootstrap ${created.runId}`, ROOT);
  tasks.get(id).runId = created.runId;
  return {created, id};
}

const apis = {
  "GET /api/subtitle-v1/settings": (req, res) => {
    const timingPath = path.join(ROOT, "director", "timing.json");
    let sample = "把每一个观点讲清楚，让字幕跟上节奏。";
    if (fs.existsSync(timingPath)) {
      try { sample = JSON.parse(fs.readFileSync(timingPath, "utf8")).segments?.[0]?.text || sample; } catch {}
    }
    return sendJson(res, {ok: true, settings: readSubtitleSettings(ROOT), sample});
  },
  "PUT /api/subtitle-v1/settings": async (req, res) => {
    try { return sendJson(res, {ok: true, settings: writeSubtitleSettings(ROOT, await readBody(req))}); }
    catch (error) { return sendJson(res, {ok: false, error: String(error.message || error)}); }
  },
  "GET /api/talkcraft/latest": (req, res) => {
    const runId = latestTalkcraftRun(ROOT);
    return sendJson(res, {ok:true, run:runId ? withTalkcraftWorkbench(readTalkcraftStatus(ROOT, runId)) : null});
  },
  "GET /api/talkcraft/status": (req, res, url) => {
    try { return sendJson(res, {ok:true, run:withTalkcraftWorkbench(readTalkcraftStatus(ROOT, url.searchParams.get('id') || ''))}); }
    catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "GET /api/talkcraft/plan": (req, res, url) => {
    try {
      const project = talkcraftProject(ROOT, url.searchParams.get('id') || '');
      const shotsFile = path.join(project, 'remotion', 'shots.json');
      const semanticFile = path.join(project, 'semantics.json');
      const candidateFile = path.join(project, 'qa', 'card-candidates.json');
      const shots = fs.existsSync(shotsFile) ? JSON.parse(fs.readFileSync(shotsFile, 'utf8')) : [];
      const sentences = fs.existsSync(semanticFile) ? JSON.parse(fs.readFileSync(semanticFile, 'utf8')).sentences || [] : [];
      const candidates = fs.existsSync(candidateFile) ? JSON.parse(fs.readFileSync(candidateFile, 'utf8')) : {};
      return sendJson(res, {ok:true, shots:shots.map(shot => ({...shot,
        candidates: candidates?.[shot.id]?.candidates || {},
        sentences:sentences.filter(sentence => sentence.shot === shot.id).map(sentence =>
          ({text:sentence.text, sem:sentence.sem, weight:sentence.weight}))}))});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "GET /api/talkcraft/card-options": (req, res, url) => {
    try {
      const runId = url.searchParams.get('id') || '';
      const skillRoot = resolveTalkcraftSkillRoot(ROOT);
      const options = readTalkcraftCardOptions(ROOT, skillRoot, runId);
      const stored = readTalkcraftCardCalls(ROOT, runId);
      let bindingReady = false;
      let bindingError = null;
      let sampleReady = false;
      let completeReady = false;
      if (stored.present) {
        try {
          assertTalkcraftCardCallsBound(ROOT, skillRoot, runId);
          bindingReady = true;
        } catch (error) { bindingError = String(error.message || error); }
      }
      const status = readTalkcraftStatus(ROOT, runId);
      if (!status.cardCallsRequired) sampleReady = true;
      else {
        try {
          assertTalkcraftCardCallsBound(ROOT, skillRoot, runId,
            {requireCardCalls:true, requiredShotIds:['s01']});
          sampleReady = true;
        } catch (error) { bindingError ||= String(error.message || error); }
        try {
          assertTalkcraftCardCallsBound(ROOT, skillRoot, runId,
            {requireCardCalls:true, requireCompleteCoverage:true});
          completeReady = true;
        } catch (error) { bindingError ||= String(error.message || error); }
      }
      return sendJson(res, {ok:true, options, calls:stored.record?.calls || [],
        bindingReady, sampleReady, completeReady, bindingError});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "GET /api/talkcraft/card-calls": (req, res, url) => {
    try {
      const runId = url.searchParams.get('id') || '';
      return sendJson(res, {ok:true, ...readTalkcraftCardCalls(ROOT, runId)});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "PUT /api/talkcraft/card-calls": async (req, res, url) => {
    try {
      const body = await readBody(req);
      const runId = url.searchParams.get('id') || body.runId || '';
      const result = writeTalkcraftCardCalls(ROOT, resolveTalkcraftSkillRoot(ROOT), runId, {...body, runId});
      return sendJson(res, {ok:true, ...result});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/talkcraft/card-calls": async (req, res) => {
    try {
      const body = await readBody(req);
      const runId = String(body.runId || '');
      const status = readTalkcraftStatus(ROOT, runId);
      const skillRoot = resolveTalkcraftSkillRoot(ROOT);
      const saved = writeTalkcraftCardCalls(ROOT, skillRoot, runId, body);
      const binding = assertTalkcraftCardCallsBound(ROOT, skillRoot, runId,
        {requireCardCalls:status.cardCallsRequired});
      let sampleReady = !status.cardCallsRequired;
      let completeReady = !status.cardCallsRequired;
      let nextBlocker = null;
      if (status.cardCallsRequired) {
        try { assertTalkcraftCardCallsBound(ROOT, skillRoot, runId,
          {requireCardCalls:true, requiredShotIds:['s01']}); sampleReady = true; }
        catch (error) { nextBlocker = String(error.message || error); }
        try { assertTalkcraftCardCallsBound(ROOT, skillRoot, runId,
          {requireCardCalls:true, requireCompleteCoverage:true}); completeReady = true; }
        catch (error) { nextBlocker ||= String(error.message || error); }
      }
      return sendJson(res, {ok:true, record:saved.record, assembly:saved.assembly,
        bindingReady:binding.present, sampleReady, completeReady, nextBlocker});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "GET /api/talkcraft/candidates": (req, res, url) => {
    try {
      const project = talkcraftProject(ROOT, url.searchParams.get('id') || '');
      const file = path.join(project, 'qa', 'card-candidates.md');
      if (!fs.existsSync(file)) { res.writeHead(404); res.end('分镜候选尚未生成'); return; }
      res.writeHead(200, {'Content-Type':'text/markdown; charset=utf-8', 'Cache-Control':'no-store',
        'Content-Disposition':'inline; filename="card-candidates.md"', 'X-Content-Type-Options':'nosniff'});
      fs.createReadStream(file).pipe(res);
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "GET /api/talkcraft/card-thumb": (req, res, url) => {
    try {
      const file = talkcraftCardThumbnailPath(url.searchParams.get('card'));
      if (!file) { res.writeHead(404); res.end('Card thumbnail not found'); return; }
      return sendStatic(res, file, 86400);
    } catch (error) { res.writeHead(400); res.end(String(error.message || error)); }
  },
  "GET /api/talkcraft/script": (req, res, url) => {
    try {
      const project = talkcraftProject(ROOT, url.searchParams.get('id') || '');
      return sendJson(res, {ok:true, text:fs.readFileSync(path.join(project, 'input.txt'), 'utf8').trim()});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "GET /api/talkcraft/approved-script": (req, res) => {
    try {
      const file = path.join(ROOT, 'director', 'talkcraft-revised-script.txt');
      if (!fs.existsSync(file)) { res.writeHead(404); res.end('Approved script not found'); return; }
      return sendJson(res, {ok:true, text:fs.readFileSync(file, 'utf8').trim()});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/talkcraft/revise": async (req, res) => {
    try {
      const body = await readBody(req);
      const sourceRunId = body.runId || '';
      const sourceProject = talkcraftProject(ROOT, sourceRunId);
      const sourceRun = JSON.parse(fs.readFileSync(path.join(sourceProject, 'source-run.json'), 'utf8'));
      const avatarFiles = (sourceRun.avatarFiles?.length ? sourceRun.avatarFiles : ['avatar.png'])
        .map(name => path.join(sourceProject, 'assets', path.basename(name)));
      if (!avatarFiles.every(fs.existsSync)) throw new Error('原运行没有可复用的角色图，请回编导台重新选择');
      const selection = ['volcengine-clone', 'volcengine-tts2'].includes(sourceRun.voiceMode)
        ? readVoiceSelection({voiceMode:sourceRun.voiceMode, speakerId:body.speakerId || sourceRun.speakerId, speechRate:body.speechRate ?? sourceRun.speechRate})
        : readVoiceSelection({voiceMode:'standard', voice:body.voice || sourceRun.voice, speechRate:body.speechRate ?? sourceRun.speechRate});
      const created = createTalkcraftInput(ROOT, {text:body.text, ...selection,
        avatarBytes:avatarFiles.map(file => fs.readFileSync(file)), generationMode:sourceRun.digitalHumanMode ?? null});
      const newSourceFile = path.join(created.project, 'source-run.json');
      const newSource = JSON.parse(fs.readFileSync(newSourceFile, 'utf8'));
      fs.writeFileSync(newSourceFile, JSON.stringify({...newSource, sourceRunId, revisionOfRunId:sourceRunId}, null, 2), 'utf8');
      fs.writeFileSync(path.join(created.project, 'sources.md'), `# 素材来源\n\n- 角色图：沿用运行 ${sourceRunId} 的本地静态图副本；不代表数字人口型。\n- 口播文案：本次审核修改稿；原运行文案保持不变。\n- 其余素材：待语义标注后逐镜采集并登记。\n`, 'utf8');
      const id = startTask('talkcraft-bootstrap', `node director/talkcraft-stages.mjs bootstrap ${created.runId}`, ROOT);
      tasks.get(id).runId = created.runId;
      tasks.get(id).sourceRunId = sourceRunId;
      return sendJson(res, {ok:true, id, runId:created.runId, sourceRunId, sentences:created.sentences, characters:created.characters});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/talkcraft/recover-timing": async (req, res) => {
    try {
      const {runId} = await readBody(req);
      if ([...tasks.values()].some(task => (task.runId === runId || task.sourceRunId === runId) && ['starting','running'].includes(task.status))) {
        throw new Error('本片已有任务运行中');
      }
      const created = createTimingRecovery(ROOT, runId);
      const id = startTask('talkcraft-recover-timing', `node director/talkcraft-stages.mjs recover-timing ${created.runId}`, ROOT);
      Object.assign(tasks.get(id), {runId:created.runId, sourceRunId:runId});
      return sendJson(res, {ok:true, id, runId:created.runId, sourceRunId:runId});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "GET /api/talkcraft/audit": (req, res, url) => {
    try {
      const runId = url.searchParams.get('id') || '';
      const project = talkcraftProject(ROOT, runId);
      const script = fs.readFileSync(path.join(project, 'input.txt'), 'utf8').trim();
      const timestampFile = path.join(project, 'audio', 'timestamps.json');
      const timestamps = fs.existsSync(timestampFile) ? JSON.parse(fs.readFileSync(timestampFile, 'utf8')) : null;
      const timingState = timingHealth(timestamps);
      const sentences = Array.isArray(timestamps?.sentences) ? timestamps.sentences.map((sentence, index) => ({
        index:index + 1, text:sentence.text, start:sentence.start, end:sentence.end,
        match:sentence.match, textMatched:sentence.textMatched === true,
        ok:sentence.ok === true && (timingState.timingSource === 'tts-native' ? sentence.textMatched === true : sentence.match >= 0.9),
      })) : [];
      const matches = sentences.map(sentence => sentence.match).filter(Number.isFinite);
      const contentWarning = /只是把资料放进收藏夹.{0,24}显著降低.{0,12}学习它的概率|显著降低你真正学习它的概率|记忆通道全部关闭/u.test(script)
        ? '本次文案含此前已确认需要修正的研究结论，逐句对齐通过不代表事实审核通过。' : null;
      const audioFile = path.join(project, 'audio', 'full.mp3');
      const alignmentPassed = sentences.length > 0 && sentences.every(sentence => sentence.ok);
      const semanticsFile = path.join(project, 'semantics.json');
      const shotsFile = path.join(project, 'remotion', 'shots.json');
      const shotbookFile = path.join(project, 'SHOTBOOK.md');
      const semantics = fs.existsSync(semanticsFile) ? JSON.parse(fs.readFileSync(semanticsFile, 'utf8')) : null;
      const shots = fs.existsSync(shotsFile) ? JSON.parse(fs.readFileSync(shotsFile, 'utf8')) : null;
      const segments = buildTalkcraftAuditSegments({auditSentences:sentences,
        semanticSentences:semantics?.sentences, shots,
        shotbookAvailable:fs.existsSync(shotbookFile) && fs.readFileSync(shotbookFile, 'utf8').trim().length > 0});
      const runStatus = readTalkcraftStatus(ROOT, runId);
      return sendJson(res, {ok:true, runId, script,
        ...timingState,
        audioAvailable:fs.existsSync(audioFile) && fs.statSync(audioFile).size > 0,
        audioSeconds:timestamps?.total || null, sentenceCount:sentences.length,
        minimumMatch:matches.length ? Math.min(...matches) : null,
        alignmentPassed, contentWarning, passed:alignmentPassed && !contentWarning, sentences,
        segmentState:segments.state, segments:segments.segments, semanticPassed:runStatus.semanticPassed});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "GET /api/talkcraft/failure-report": (req, res, url) => {
    try {
      const report = latestTalkcraftFailureReport(ROOT, url.searchParams.get('id') || '');
      return sendJson(res, {ok:!!report, report});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/talkcraft/create": async (req, res) => {
    try {
      const {fields, avatars} = await readBModeInput(req, {maxBytes:60 * 1024 * 1024});
      if (String(fields.visualMode || '').toUpperCase() === 'C') {
        const {created, id} = await createModeCRun(fields, avatars);
        return sendJson(res, {ok:true, id, runId:created.runId, mode:'C', dryRun:true, sentences:created.sentences});
      }
      if (!avatars.length) throw new Error('请先选择角色图');
      const selection = readVoiceSelection(fields);
      const created = createTalkcraftInput(ROOT, {text:fields.text, ...selection,
        avatarBytes:await Promise.all(avatars.map(async file => Buffer.from(await file.arrayBuffer()))),
        generationMode:fields.generationMode || 'segments', themeSnapshot:readCurrentTheme(ROOT)});
      const id = startTask('talkcraft-bootstrap', `node director/talkcraft-stages.mjs bootstrap ${created.runId}`, ROOT);
      tasks.get(id).runId = created.runId;
      return sendJson(res, {ok:true, id, runId:created.runId, sentences:created.sentences});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "GET /api/mode-c/config": (_req, res) => {
    try { return sendJson(res, {ok:true, mode:'C', config:JSON.parse(fs.readFileSync(path.join(ROOT, 'director', 'mode-c', 'mode-c-config.json'), 'utf8')), sources:JSON.parse(fs.readFileSync(path.join(ROOT, 'director', 'mode-c', 'mode-c-sources.json'), 'utf8'))}); }
    catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/mode-c/create": async (req, res) => {
    try {
      const {fields, avatars} = await readBModeInput(req, {maxBytes:60 * 1024 * 1024});
      const {created, id} = await createModeCRun(fields, avatars);
      return sendJson(res, {ok:true, id, runId:created.runId, mode:'C', dryRun:true, sentences:created.sentences});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/mode-c/dry-run": async (req, res) => {
    try {
      const body = await readBody(req);
      const project = assertModeCRun(ROOT, String(body.runId || ''));
      return sendJson(res, {ok:true, ...runModeCStage('dry-run', project)});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/mode-c/mock": async (req, res) => {
    try {
      const body = await readBody(req);
      const project = assertModeCRun(ROOT, String(body.runId || ''));
      return sendJson(res, {ok:true, ...runModeCStage('mock', project)});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/mode-c/verify": async (req, res) => {
    try {
      const body = await readBody(req);
      const project = assertModeCRun(ROOT, String(body.runId || ''));
      return sendJson(res, {ok:true, ...runModeCStage('verify', project)});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/mode-c/rematch-plan": async (req, res) => {
    try {
      const body = await readBody(req);
      const project = assertModeCRun(ROOT, String(body.runId || ''));
      return sendJson(res, {ok:true, ...runModeCStage('rematch-plan', project)});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/mode-c/rematch": async (req, res) => {
    try {
      const body = await readBody(req);
      const project = assertModeCRun(ROOT, String(body.runId || ''));
      return sendJson(res, {ok:true, ...runModeCStage('rematch', project)});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/talkcraft/stage": async (req, res) => {
    try {
      const body = await readBody(req);
      const {runId, stage} = body;
      if (!['editorial','editorial-check','candidates','preflight','scaffold','digital-human','sample','render-all','render-sfx-solo','qa','deliver'].includes(stage)) throw new Error('不支持的 TalkCraft 阶段');
      const project = talkcraftProject(ROOT, runId);
      const active = [...tasks.values()].find(task => task.runId === runId && ['starting','running'].includes(task.status));
      if (active) throw new Error('本片已有任务运行中');
      if (stage === 'editorial-check') {
        const id = startTask('talkcraft-editorial-check', `node director/talkcraft-ark-editorial.mjs ${runId} --validate-existing`, ROOT);
        tasks.get(id).runId = runId;
        return sendJson(res,{ok:true,id,runId,stage,billable:false});
      }
      if (stage === 'editorial') {
        if (body.approveModelCost !== true) throw new Error('生成分镜会调用火山模型，需确认可能计费');
        if (!readTalkcraftStatus(ROOT,runId).inputReady) throw new Error('请先完成配音和时间轴处理');
        if (fs.existsSync(path.join(project,'SHOTBOOK.md')) || fs.existsSync(path.join(project,'remotion','shots.json')))
          throw new Error('本片已有分镜，已保留；请刷新状态');
        if (!aModeReadiness().configured) throw new Error('请先在服务 API 设置中配置火山方舟模型');
        const id = startTask('talkcraft-editorial', `node director/talkcraft-ark-editorial.mjs ${runId}`, ROOT);
        tasks.get(id).runId = runId;
        return sendJson(res, {ok:true,id,runId,stage,billable:true});
      }
      if (stage === 'sample' && Object.hasOwn(body, 'bgm')) {
        writeTalkcraftMusicSnapshot(ROOT, path.join(project, 'remotion'), body.bgm);
      }
      const id = startTask(`talkcraft-${stage}`, `node director/talkcraft-stages.mjs ${stage} ${runId}`, ROOT);
      tasks.get(id).runId = runId;
      return sendJson(res, {ok:true, id, runId, stage});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/talkcraft/approve-sample": async (req, res) => {
    try {
      const {runId} = await readBody(req);
      const status = readTalkcraftStatus(ROOT, runId);
      assertTalkcraftCardCallsBound(ROOT, resolveTalkcraftSkillRoot(ROOT), runId,
        {requireCardCalls:status.cardCallsRequired,
          requiredShotIds:status.cardCallsRequired ? ['s01'] : []});
      return sendJson(res, {ok:true, ...approveTalkcraftSample(ROOT, runId)});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/talkcraft/approve-storyboard": async (req, res) => {
    try {
      const {runId, governanceNote} = await readBody(req);
      return sendJson(res, {ok:true, ...approveTalkcraftStoryboard(ROOT, runId, governanceNote)});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/talkcraft/storyboard-adjustment": async (req, res) => {
    try {
      const {runId, request} = await readBody(req);
      return sendJson(res, {ok:true, ...requestTalkcraftStoryboardAdjustment(ROOT, runId, request)});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/talkcraft/storyboard-regenerate": async (req, res) => {
    try {
      const {runId} = await readBody(req);
      const active = [...tasks.values()].find(task => task.runId === runId && ['starting','running'].includes(task.status));
      if (active) throw new Error('本片已有任务运行中');
      if (!aModeReadiness().configured) throw new Error('请先在服务 API 设置中配置火山方舟模型');
      const prepared = prepareTalkcraftStoryboardRevision(ROOT, runId);
      const id = startTask('talkcraft-editorial-revision', `node director/talkcraft-ark-editorial.mjs ${runId}`, ROOT);
      tasks.get(id).runId = runId;
      return sendJson(res, {ok:true, id, ...prepared, stage:'editorial-revision', billable:true});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/talkcraft/workbench": async (req, res) => {
    try {
      const {runId} = await readBody(req);
      const workbench = await startTalkcraftWorkbench(ROOT, resolveTalkcraftSkillRoot(ROOT), runId);
      return sendJson(res, {ok:true, workbenchUrl:workbench.url});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "GET /api/talkcraft/video": (req, res, url) => {
    try {
      const project = talkcraftProject(ROOT, url.searchParams.get('id') || '');
      const kind = url.searchParams.get('kind') || 'sample';
      const names = {sample:'preview/s01.mp4', final:'final.mp4', delivery:'delivery.mp4'};
      if (!names[kind]) throw new Error('Invalid TalkCraft video kind');
      if (kind === 'delivery' && !readTalkcraftStatus(ROOT, url.searchParams.get('id') || '').delivery) {
        res.writeHead(404); res.end('Delivery video not ready'); return;
      }
      const file = path.join(project, 'remotion', 'out', names[kind]);
      if (!fs.existsSync(file)) {res.writeHead(404); res.end('Video not ready'); return;}
      return sendVideoRange(res, file, req.headers.range);
    } catch {res.writeHead(400); res.end('Invalid TalkCraft video request');}
  },
  "GET /api/talkcraft/template-usage": (req, res, url) => {
    try {
      const kind = url.searchParams.get('kind') || 'final';
      if (!['final', 'delivery'].includes(kind)) throw new Error('Invalid video kind');
      const file = path.join(talkcraftProject(ROOT, url.searchParams.get('id') || ''), 'remotion', 'out', `${kind}-template-usage.json`);
      if (!fs.existsSync(file)) {res.writeHead(404); res.end('Template usage not ready'); return;}
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
      fs.createReadStream(file).pipe(res);
    } catch {res.writeHead(400); res.end('Invalid template usage request');}
  },
  "GET /api/talkcraft/audio": (req, res, url) => {
    try {
      const file = path.join(talkcraftProject(ROOT, url.searchParams.get('id') || ''), 'audio', 'full.mp3');
      if (!fs.existsSync(file)) {res.writeHead(404); res.end('Audio not ready'); return;}
      return sendVideoRange(res, file, req.headers.range, 'audio/mpeg');
    } catch {res.writeHead(400); res.end('Invalid TalkCraft audio request');}
  },
  "GET /api/volcengine/voice/config": (req, res) => {
    return sendJson(res, {ok:true, ...volcengineVoiceReadiness()});
  },
  "GET /api/volcengine/tts2/preview": (req, res, url) => {
    try {
      const audio = voicePreviewCache.read(url.searchParams.get('speakerId'), url.searchParams.get('speechRate'));
      if (!audio) {res.writeHead(404); res.end(); return;}
      res.writeHead(200, {"Content-Type":"audio/mpeg", "Content-Length":audio.length, "Cache-Control":"no-store"});
      res.end(audio);
    } catch (error) { sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/volcengine/tts2/preview": async (req, res) => {
    try {
      const {speakerId, speechRate} = await readBody(req);
      const audio = await voicePreviewCache.getOrCreate(speakerId, speechRate);
      res.writeHead(200, {"Content-Type":"audio/mpeg", "Content-Length":audio.length, "Cache-Control":"no-store"});
      res.end(audio);
    } catch (error) { sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/settings/providers/check": async (req, res) => {
    try {
      const {provider, taskId} = await readBody(req);
      return sendJson(res, {ok:true, ...await checkProviderConnectivity(provider, {taskId})});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "GET /api/settings/providers": (req, res) => {
    const stored = readStoredProviderConfig();
    const running = runningHubRuntimeConfig();
    const volcengine = volcengineVoiceReadiness();
    return sendJson(res, {ok:true,
      runninghub:{configured:!!running.apiKey, baseUrl:running.baseUrl, appId:running.appId, apiKeyConfigured:!!running.apiKey},
      volcengine:{...volcengine,
        ttsResourceId:stored.volcengineTtsResourceId || 'seed-icl-2.0', model:stored.volcengineModel || 'seed-tts-2.0-standard',
        tts2ResourceId:'seed-tts-2.0'}});
  },
  "POST /api/settings/providers": async (req, res) => {
    try {
      const body = await readBody(req);
      const current = readStoredProviderConfig();
      const clean = value => value == null ? undefined : String(value).trim();
      const result = writeStoredProviderConfig({
        runninghubBaseUrl:clean(body.runninghubBaseUrl) || current.runninghubBaseUrl || undefined,
        runninghubAppId:clean(body.runninghubAppId) || current.runninghubAppId || undefined,
        runninghubApiKey:body.runninghubApiKey === undefined ? undefined : clean(body.runninghubApiKey),
        volcengineApiKey:body.volcengineApiKey === undefined ? undefined : clean(body.volcengineApiKey),
        volcengineTtsResourceId:clean(body.volcengineTtsResourceId) || current.volcengineTtsResourceId || 'seed-icl-2.0',
        volcengineModel:clean(body.volcengineModel) || current.volcengineModel || 'seed-tts-2.0-standard',
      });
      return sendJson(res, {ok:true, saved:true, path:result.path});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/volcengine/voice/train": async (req, res) => {
    try {
      const {fields, cloneAudio} = await readBModeInput(req, {maxBytes:11 * 1024 * 1024});
      if (!cloneAudio || cloneAudio.size > 10 * 1024 * 1024) throw new Error('请上传不超过 10 MB 的声音样本');
      const name = String(cloneAudio.name || '').toLowerCase();
      const extension = name.match(/\.(wav|mp3|ogg|m4a|aac)$/u)?.[1];
      if (!extension) throw new Error('声音样本仅支持 WAV、MP3、OGG、M4A 或 AAC');
      const speakerId = String(fields.speakerId || '').trim();
      if (!validSpeakerId(speakerId)) throw new Error('请填写火山控制台提供的 speaker_id');
      const result = await trainVolcengineVoice({
        audioBytes:Buffer.from(await cloneAudio.arrayBuffer()), audioFormat:extension,
        speakerId, promptText:fields.promptText || '',
      });
      return sendJson(res, {ok:true, ...result});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/volcengine/voice/status": async (req, res) => {
    try {
      const body = await readBody(req);
      if (!validSpeakerId(body.speakerId)) throw new Error('请提供有效的 speaker_id');
      return sendJson(res, {ok:true, speakerId:body.speakerId, result:await getVolcengineVoiceStatus({speakerId:body.speakerId})});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "GET /api/b-mode/acceptance": (req, res) => sendJson(res, {ok:true, ...loadAcceptanceFixture()}),
  "POST /api/b-mode/placeholder": async (req, res) => {
    const { fields, avatar } = await readBModeInput(req);
    const text = typeof fields.text === "string" ? fields.text.replace(/\r\n/g, "\n").trim() : "";
    let selection;
    try { selection = readVoiceSelection(fields); } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
    const {voiceMode, voice, speakerId, speechRate} = selection;
    if (!text || text.length > 1200) return sendJson(res, { ok: false, error: "占位测试文案需为 1–1200 字" });
    if (!avatar || avatar.size > 7 * 1024 * 1024) return sendJson(res, { ok: false, error: "请上传不超过 7 MB 的角色图" });
    let scenes;
    try { scenes = JSON.parse(fields.scenes); } catch { return sendJson(res, { ok: false, error: "分镜数据无效" }); }
    if (!Array.isArray(scenes) || !scenes.length || scenes.length > 80 ||
        scenes.some(scene => !scene || typeof scene.text !== "string" || scene.text.length > 80 || !["person", "graphics", "material"].includes(scene.subject) ||
          (scene.subtitle != null && (typeof scene.subtitle !== 'string' || scene.subtitle.length > 32)) ||
          (scene.visualText != null && (typeof scene.visualText !== 'string' || scene.visualText.length > 100))) ||
        !scenes.some(scene => scene.subject === "person") ||
        scenes.map(scene => scene.text).join("").replace(/\s+/gu, "") !== text.replace(/\s+/gu, "") ||
        scenes.some((scene, index) => index > 0 && scene.videoPath && scene.videoPath === scenes[index - 1].videoPath)) {
      return sendJson(res, { ok: false, error: "分镜未确认、单句超过 80 字，或与当前文案不一致" });
    }
    const invalidVideoIndex = scenes.findIndex(scene => scene.videoPath != null &&
      (typeof scene.videoPath !== 'string' || !resolveLibraryVideo(ROOT, scene.videoPath)));
    if (invalidVideoIndex >= 0) return sendJson(res, {ok:false, error:`第 ${invalidVideoIndex + 1} 镜头视频不在素材库中或文件不可用`});
    const background = ["keep", "auto", "green"].includes(fields.background) ? fields.background : "keep";
    const backgroundVideo = fields.backgroundVideoPath ? resolveLibraryVideo(ROOT, fields.backgroundVideoPath) : null;
    if (fields.backgroundVideoPath && !backgroundVideo) return sendJson(res, {ok:false, error:"背景视频不在素材库中或文件不可用"});
    const bytes = Buffer.from(await avatar.arrayBuffer());
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!png && !jpeg && !webp) return sendJson(res, { ok: false, error: "角色图仅支持 PNG、JPG 或 WebP" });
    const runId = crypto.randomUUID();
    const runDir = path.join(ROOT, "director", "b-mode-runs", runId);
    fs.mkdirSync(runDir, {recursive:true});
    try {
      execFileSync("ffmpeg", ["-y","-hide_banner","-loglevel","error","-i","pipe:0","-frames:v","1",
        "-vf","scale=1600:1600:force_original_aspect_ratio=decrease","-update","1",path.join(runDir,"avatar.png")],
      {input:bytes, timeout:15000});
    } catch { return sendJson(res, {ok:false, error:"角色图片无法读取，请换一张图片"}); }
    fs.writeFileSync(path.join(runDir, "input.txt"), text, "utf8");
    fs.writeFileSync(path.join(runDir, "placeholder-settings.json"), JSON.stringify({voice, voiceMode, speakerId, speechRate, background,
      backgroundVideoPath:backgroundVideo?.path || null,
      scenes:scenes.map(scene => ({text:scene.text, subject:scene.subject, videoPath:scene.videoPath || null,
        subtitle:scene.subtitle || '', visualText:scene.visualText || ''}))}, null, 2), "utf8");
    const id = startTask("b-baseline", `node director/b-mode-placeholder.mjs ${runId}`, ROOT);
    tasks.get(id).runId = runId;
    return sendJson(res, {ok:true, id, runId});
  },
  "GET /api/b-mode/placeholder/video": (req, res, url) => {
    const runId = url.searchParams.get("id") || "";
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId)) { res.writeHead(400); res.end("Invalid run ID"); return; }
    const report = path.join(ROOT, "director", "b-mode-runs", runId, "placeholder-report.json");
    const file = path.join(ROOT, "template", "out", "b-mode", `${runId}.placeholder.mp4`);
    if (!fs.existsSync(report) || !fs.existsSync(file)) { res.writeHead(404); res.end("No completed placeholder test"); return; }
    sendVideoRange(res, file, req.headers.range);
  },
  "GET /api/b-mode/placeholder/audio": (req, res, url) => {
    const runId = url.searchParams.get("id") || "";
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId)) { res.writeHead(400); res.end("Invalid run ID"); return; }
    const report = path.join(ROOT, "director", "b-mode-runs", runId, "placeholder-report.json");
    const file = path.join(ROOT, "template", "public", "b-mode", runId, "placeholder-voice.mp3");
    if (!fs.existsSync(report) || !fs.existsSync(file)) { res.writeHead(404); res.end("No completed placeholder audio"); return; }
    sendVideoRange(res, file, req.headers.range, "audio/mpeg");
  },
  "GET /api/b-mode/digital-human/config": (req, res) => {
    const provider = runningHubRuntimeConfig();
    return sendJson(res, {ok:true, configured:!!provider.apiKey, appId:provider.appId, baseUrl:provider.baseUrl, nodes:provider.nodes});
  },
  "POST /api/b-mode/digital-human": async (req, res) => {
    if (!runningHubRuntimeConfig().apiKey) {
      return sendJson(res, {ok:false, error:'服务端尚未配置 INFINITETALK_API_KEY，未创建 RunningHub 任务'});
    }
    const {fields, avatar, avatars = []} = await readBModeInput(req, {maxBytes:32 * 1024 * 1024});
    const generationMode = fields.generationMode || 'segments';
    if (!['segments', 'combined'].includes(generationMode)) return sendJson(res, {ok:false, error:'数字人生成模式无效'});
    const text = typeof fields.text === 'string' ? fields.text.replace(/\r\n/g, '\n').trim() : '';
    if (!text || text.length > 1200) return sendJson(res, {ok:false, error:'真实验证文案需为 1–1200 字'});
    if (!avatars.length || avatars.some(file => file.size > 7 * 1024 * 1024) || avatars.length > 8) return sendJson(res, {ok:false, error:'请上传 1–8 张、每张不超过 7 MB 的角色图'});
    let selection;
    try { selection = readVoiceSelection(fields); } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
    const {voiceMode, voice, speakerId, speechRate} = selection;
    let scenes;
    try { scenes = JSON.parse(fields.scenes); } catch { return sendJson(res, {ok:false, error:'分镜数据无效'}); }
    if (!Array.isArray(scenes) || !scenes.length || scenes.filter(scene => scene?.subject === 'person').length < 1 ||
        scenes.some(scene => !scene || typeof scene.text !== 'string' || scene.text.length > 80 || !['person', 'graphics', 'material'].includes(scene.subject)) ||
        scenes.map(scene => scene.text).join('').replace(/\s+/gu, '') !== text.replace(/\s+/gu, '')) {
      return sendJson(res, {ok:false, error:'至少需要一个 person 分镜，且分镜必须与文案一致'});
    }
    const runId = crypto.randomUUID();
    const runDir = path.join(ROOT, 'director', 'b-mode-runs', runId);
    fs.mkdirSync(runDir, {recursive:true});
    const avatarFiles = [];
    try {
      for (const [index, file] of avatars.entries()) {
        const bytes = Buffer.from(await file.arrayBuffer());
        const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
        if (!png && !jpeg && !webp) throw new Error('角色图仅支持 PNG、JPG 或 WebP');
        const output = path.join(runDir, `avatar-${String(index + 1).padStart(2, '0')}.png`);
        execFileSync('ffmpeg', ['-y','-hide_banner','-loglevel','error','-i','pipe:0','-frames:v','1',
          '-vf','scale=1600:1600:force_original_aspect_ratio=decrease','-update','1',output], {input:bytes, timeout:15000});
        avatarFiles.push(path.basename(output));
      }
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || '角色图片无法读取，请换一张图片')}); }
    fs.writeFileSync(path.join(runDir, 'input.txt'), text, 'utf8');
    fs.writeFileSync(path.join(runDir, 'digital-human-settings.json'), JSON.stringify({
      text, voice, voiceMode, speakerId, speechRate, avatarFiles, generationMode,
      scenes:scenes.map(scene => ({text:scene.text, subject:scene.subject})),
      prompt:String(fields.prompt || '人物自然说话，身体保持稳定，配合轻微自然手势'),
      maxSide:String(fields.maxSide || '1080'), intensity:String(fields.intensity || '0'), scale:String(fields.scale || '1.05'),
      instanceType:String(fields.instanceType || 'plus'),
    }, null, 2), 'utf8');
    const id = startTask('b-digital-human', 'node director/b-mode-digital-human.mjs ' + runId, ROOT);
    tasks.get(id).runId = runId;
    return sendJson(res, {ok:true, id, runId, mode:'runninghub', generationMode, billable:true});
  },
  "GET /api/b-mode/digital-human/report": (req, res, url) => {
    const runId = url.searchParams.get('id') || '';
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId)) { res.writeHead(400); res.end('Invalid run ID'); return; }
    const file = path.join(ROOT, 'director', 'b-mode-runs', runId, 'digital-human-report.json');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('No digital-human report'); return; }
    return sendJson(res, {ok:true, report:JSON.parse(fs.readFileSync(file, 'utf8'))});
  },
  "GET /api/b-mode/digital-human/video": (req, res, url) => {
    const runId = url.searchParams.get('id') || '';
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId)) { res.writeHead(400); res.end('Invalid run ID'); return; }
    const clipIndex = Number.parseInt(url.searchParams.get('clip') || '0', 10);
    if (!Number.isInteger(clipIndex) || clipIndex < 0 || clipIndex > 999) { res.writeHead(400); res.end('Invalid clip index'); return; }
    const reportFile = path.join(ROOT, 'director', 'b-mode-runs', runId, 'digital-human-report.json');
    if (!fs.existsSync(reportFile)) { res.writeHead(404); res.end('No digital-human report'); return; }
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    const unit = Array.isArray(report.units) ? report.units[clipIndex] : null;
    const file = unit?.output && path.resolve(unit.output).startsWith(path.resolve(ROOT, 'director', 'b-mode-runs', runId) + path.sep)
      ? unit.output : path.join(ROOT, 'director', 'b-mode-runs', runId, 'digital-human.mp4');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('No digital-human video'); return; }
    return sendVideoRange(res, file, req.headers.range);
  },
  "GET /api/b-mode/digital-human/final-video": (req, res, url) => {
    const runId = url.searchParams.get('id') || '';
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId)) { res.writeHead(400); res.end('Invalid run ID'); return; }
    const reportFile = path.join(ROOT, 'director', 'b-mode-runs', runId, 'digital-human-report.json');
    if (!fs.existsSync(reportFile)) { res.writeHead(404); res.end('No completed digital-human composition'); return; }
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    const fileName = path.basename(report.output || '');
    if (report.status !== 'SUCCESS' ||
        !new RegExp(`^${runId}\\.digital-human-final(?:-[a-z0-9-]+)?\\.mp4$`).test(fileName)) {
      res.writeHead(404); res.end('No completed digital-human composition'); return;
    }
    const file = path.join(ROOT, 'template', 'out', 'b-mode', fileName);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('No completed digital-human composition'); return; }
    return sendVideoRange(res, file, req.headers.range);
  },
  "POST /api/generate": async (req, res) => {
    let release;
    try {
      const body = await readBody(req);
      validateAModeInput({text:body.text, voice:body.voice, speechRate:body.speechRate});
      if (body.approveModelCost !== true) throw new Error('启动 AI 编导前需确认模型调用可能计费');
      release = acquireAModeOperation();
      await checkAModeReadiness();
      const {runId} = createAModeRun(ROOT, {text:body.text, voice:body.voice, speechRate:body.speechRate});
      const id = startAModeSupervisorTask(runId, {voice:body.voice});
      if (tasks.get(id).status === 'error') failAModeRun(ROOT, runId, tasks.get(id).error);
      return sendJson(res, {ok:true, id, runId, billable:true});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
    finally { release?.(); }
  },

  "POST /api/a-mode/revise": async (req, res) => {
    let release;
    try {
      const body = await readBody(req);
      if (body.approveModelCost !== true) throw new Error('修订会调用模型，需确认可能计费');
      release = acquireAModeOperation();
      await checkAModeReadiness();
      const {runId} = createAModeRevisionRun(ROOT, body.sourceRunId);
      const id = startAModeSupervisorTask(runId, {resumeDirector:true});
      if (tasks.get(id).status === 'error') failAModeRun(ROOT, runId, tasks.get(id).error);
      return sendJson(res, {ok:true, id, runId, sourceRunId:body.sourceRunId, billable:true});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
    finally { release?.(); }
  },

  "POST /api/a-mode/resume": async (req, res) => {
    let release;
    try {
      const body = await readBody(req);
      const run = readAModeRun(ROOT, body.runId);
      if (run.status !== 'error' || run.storyboard) throw new Error('仅未完成分镜的失败任务可续跑');
      const dir = aModeRunDir(ROOT, body.runId);
      if (!fs.existsSync(path.join(dir, 'timing.json')) ||
          !fs.existsSync(path.join(ROOT, 'template', 'public', 'audio', 'a-mode', `${body.runId}.mp3`)))
        throw new Error('配音或时间轴不完整，不能从编导阶段续跑');
      if (body.approveModelCost !== true) throw new Error('续跑会调用模型，需确认可能计费');
      release = acquireAModeOperation();
      await checkAModeReadiness();
      const id = startAModeSupervisorTask(body.runId, {resumeDirector:true});
      if (tasks.get(id).status === 'error') failAModeRun(ROOT, body.runId, tasks.get(id).error);
      return sendJson(res, {ok:true, id, runId:body.runId, billable:true});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
    finally { release?.(); }
  },

  "POST /api/generate/plan": (_req, res) => sendRetiredAMode(res),

  "GET /api/a-mode/run": (req, res, url) => {
    try { return sendJson(res, {ok:true, run:readAModeRun(ROOT, url.searchParams.get('id') || '')}); }
    catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },

  "GET /api/a-mode/latest": (req, res) => sendJson(res, {ok:true, run:latestAModeRun(ROOT)}),

  "GET /api/a-mode/readiness": async (req, res) => {
    try { return sendJson(res, {ok:true, ...aModeReadiness()}); }
    catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },

  "GET /api/render/readiness": (_req, res) => sendJson(res, renderRuntimeReadiness()),

  "GET /api/a-mode/provider": (req, res) => {
    try { return sendJson(res, {ok:true, ...aModeReadiness()}); }
    catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },

  "POST /api/a-mode/provider": async (req, res) => {
    try { return sendJson(res, {ok:true, ...writeStoredAModeConfig(await readBody(req))}); }
    catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },

  "GET /api/a-mode/video": (req, res, url) => {
    try {
      const file = path.join(aModeRunDir(ROOT, url.searchParams.get('id') || ''), 'out', 'dynamic.mp4');
      if (!fs.existsSync(file)) {res.writeHead(404); res.end('No A-mode video'); return;}
      return sendVideoRange(res, file, req.headers.range);
    } catch {res.writeHead(400); res.end('Invalid A-mode run');}
  },

  "GET /api/a-mode/template-usage": (req, res, url) => {
    try {
      const file = path.join(aModeRunDir(ROOT, url.searchParams.get('id') || ''), 'out', 'template-usage.json');
      if (!fs.existsSync(file)) { res.writeHead(404); res.end('No template usage report'); return; }
      res.writeHead(200, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"});
      return fs.createReadStream(file).pipe(res);
    } catch { res.writeHead(400); res.end('Invalid A-mode run'); }
  },

  "GET /api/template-usage": (_req, res) => {
    const file = path.join(readOutputDir(), 'template-usage.json');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('No template usage report'); return; }
    res.writeHead(200, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"});
    return fs.createReadStream(file).pipe(res);
  },

  "POST /api/render/confirm": async (req, res) => {
    let release;
    try {
      const body = await readMaterialMatchPreviewBody(req);
      release = acquireAModeOperation();
      const runId = body.runId || null;
      if (!runId && body.legacyConfirmed !== true) throw new Error('渲染必须携带已审核任务 ID；历史分镜需单独确认');
      const runtime = renderRuntimeReadiness();
      if (!runtime.ok) throw new Error(runtime.error);
      const run = runId ? readAModeRun(ROOT, runId) : null;
      if (run && run.status !== 'review' && run.status !== 'rendered') throw new Error('A 模式新分镜尚未完成审核准备');
      const runDir = run ? aModeRunDir(ROOT, runId) : null;
      preflightAModeRender(ROOT, {runId, runDir});
      const extraEnv = {SHOTCRAFT_BGM_SELECTION_JSON: Object.hasOwn(body, 'bgm')
        ? JSON.stringify(normalizeMusicSelection(ROOT, body.bgm)) : ''};
      if (runDir) Object.assign(extraEnv, {SHOTCRAFT_STORYBOARD_PATH:path.join(runDir, 'storyboard.json'),
        SHOTCRAFT_TIMING_PATH:path.join(runDir, 'timing.json'), SHOTCRAFT_PROPS_PATH:path.join(runDir, 'props.json'),
        SHOTCRAFT_OUTPUT_DIR:path.join(runDir, 'out')});
      const id = runId ? startRenderSupervisorTask(runId, extraEnv) : startTask("render", "node director/render.mjs", ROOT, extraEnv);
      if (runId) {
        tasks.get(id).runId = runId;
        markAModeRender(ROOT, runId, tasks.get(id).status, tasks.get(id).error);
      }
      return sendJson(res, { ok: true, id, runId });
    } catch (error) { return sendJson(res, {ok: false, error: error.message}); }
    finally { release?.(); }
  },

  "GET /api/task": (req, res, url) => {
    const id = Number(url.searchParams.get("id"));
    const since = Number(url.searchParams.get("since") || 0);
    const t = tasks.get(id);
    if (!t) return sendJson(res, { error: "no task" });
    return sendJson(res, { since: t.logs.length, done: !["starting", "running", "stopping"].includes(t.status), status: t.status, exitCode: t.exitCode, error: t.error,
      logs: t.logs.slice(since), runId: t.runId, sourceRunId:t.sourceRunId || null, failureReport:t.failureReport || null,
      progress:t.type === 'render' && t.runId ? readRenderProgress(aModeRunDir(ROOT,t.runId),t.startedAt) : null });
  },

  "POST /api/task/clear": async (req, res) => {
    const body = await readBody(req);
    const id = Number(body && body.id);
    const t = tasks.get(id);
    if (!t) return sendJson(res, { ok: false, error: "任务不存在" });
    t.logs.length = 0;
    if (['a-director','render'].includes(t.name)) saveAModeTaskHistory();
    return sendJson(res, { ok: true });
  },

  "GET /api/storyboard": (req, res) => {
    const sbPath = path.join(ROOT, "director", "storyboard.json");
    if (!fs.existsSync(sbPath)) return sendJson(res, { exists: false });
    const sb = JSON.parse(fs.readFileSync(sbPath, "utf8"));
    return sendJson(res, { exists: true, storyboard: sb });
  },

  "POST /api/storyboard/save": async (req, res) => {
    const body = await readBody(req);
    const sbPath = path.join(ROOT, "director", "storyboard.json");
    fs.writeFileSync(sbPath, JSON.stringify(body.storyboard, null, 2), "utf8");
    return sendJson(res, { ok: true });
  },

  "GET /api/library/list": (req, res, url) => {
    const idxPath = path.join(ROOT, "materials", "_index.json");
    if (!fs.existsSync(idxPath)) return sendJson(res, { items: [], total: 0 });
    const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
    const tagsParam = url.searchParams.get("tags") || "";
    const wantTags = tagsParam.split(",").map(s => s.trim()).filter(Boolean);
    const query = (url.searchParams.get("q") || "").trim().slice(0, 80).toLowerCase();
    let filtered = idx;
    if (wantTags.length) filtered = filtered.filter(item => wantTags.every(t => (item.tags || []).includes(t)));
    if (query) filtered = filtered.filter(item => `${item.path} ${item.category} ${(item.tags || []).join(' ')}`.toLowerCase().includes(query));
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "60"), 200);
    const items = filtered.slice(offset, offset + limit).map(item => ({
      path: item.path, category: item.category, duration_sec: item.duration_sec,
      width: item.width, height: item.height, tags: item.tags,
    }));
    return sendJson(res, { items, total: filtered.length, offset, limit });
  },
  "POST /api/b-mode/material-match": async (req, res) => {
    const body = await readBody(req);
    if (!Array.isArray(body.scenes) || body.scenes.length > 80 || body.scenes.some(scene => typeof scene?.text !== 'string' || scene.text.length > 80))
      return sendJson(res, {ok:false, error:'分镜数据无效'});
    return sendJson(res, {ok:true, matches:matchSceneVideos(body.scenes, loadMaterialIndex(ROOT))});
  },

  "GET /api/isolated/material-match/status": (req, res) =>
    sendJson(res, {ok: true, enabled: materialMatchPreviewEnabled()}),
  "POST /api/isolated/material-match": async (req, res) => {
    if (!materialMatchPreviewEnabled()) { res.writeHead(404); res.end('Not Found'); return; }
    try {
      const body = await readMaterialMatchPreviewBody(req);
      return sendJson(res, previewMaterialMatches(ROOT, body.scenes));
    } catch (error) { return sendJson(res, {ok: false, error: error.message}); }
  },

  "GET /api/library/audio": (req, res, url) => {
    try { return sendJson(res, {ok: true, items: listAudioLibrary(ROOT, url.searchParams.get('kind'))}); }
    catch (error) { return sendJson(res, {ok: false, error: error.message}); }
  },
  "GET /api/library/audio/file": (req, res, url) => {
    try {
      const name = url.searchParams.get('name');
      const file = audioFile(ROOT, url.searchParams.get('kind'), url.searchParams.get('source'), name);
      return sendVideoRange(res, file, req.headers.range, name.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mpeg');
    } catch { res.writeHead(404); res.end(); }
  },
  "POST /api/library/audio/upload": async (req, res, url) => {
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 100 * 1024 * 1024) { res.writeHead(413); res.end(); return; }
        chunks.push(chunk);
      }
      const name = uploadAudio(ROOT, url.searchParams.get('kind'), url.searchParams.get('name'), Buffer.concat(chunks));
      return sendJson(res, {ok: true, name});
    } catch (error) { return sendJson(res, {ok: false, error: error.message}); }
  },
  "POST /api/library/audio/index": async (req, res) => {
    try {
      const {kind, source, name} = await readMaterialMatchPreviewBody(req);
      return sendJson(res, {ok: true, item: indexAudioFile(ROOT, kind, source, name)});
    } catch (error) { return sendJson(res, {ok: false, error: error.message}); }
  },
  "PUT /api/library/audio/metadata": async (req, res) => {
    try {
      const {kind, source, name, tags, licenseStatus} = await readMaterialMatchPreviewBody(req);
      return sendJson(res, {ok: true, item: updateAudioMetadata(ROOT, kind, source, name, {tags, licenseStatus})});
    } catch (error) { return sendJson(res, {ok: false, error: error.message}); }
  },
  "POST /api/library/audio/recommend": async (req, res) => {
    try {
      const {text} = await readMaterialMatchPreviewBody(req);
      return sendJson(res, {ok: true, items: recommendBackgroundMusic(ROOT, text)});
    } catch (error) { return sendJson(res, {ok: false, error: error.message}); }
  },

  "GET /api/library/thumb": (req, res, url) => {
    const rel = (url.searchParams.get("path") || "").replace(/\\/g, "/");
    if (!rel) { res.writeHead(400); res.end(); return; }
    const thumbPath = path.join(ROOT, "materials", "_thumbs", rel.replace(/\.[^.]+$/, ".jpg"));
    if (!fs.existsSync(thumbPath)) { res.writeHead(404); res.end(); return; }
    return sendStatic(res, thumbPath, 86400);
  },

  "GET /api/library/video": (req, res, url) => {
    const rel = (url.searchParams.get("path") || "").replace(/\\/g, "/");
    if (!rel) { res.writeHead(400); res.end(); return; }
    const videoPath = path.join(ROOT, "materials", "_scenes", rel);
    if (!fs.existsSync(videoPath)) { res.writeHead(404); res.end(); return; }
    sendVideoRange(res, videoPath, req.headers.range);
  },

  "GET /api/library/music": (req, res) => {
    const folders = [
      ["builtin", path.join(ROOT, "assets", "audio", "bgm")],
      ["uploaded", path.join(ROOT, "materials", "_music")],
    ];
    const items = folders.flatMap(([source, folder]) => fs.existsSync(folder)
      ? fs.readdirSync(folder, { withFileTypes: true })
        .filter(entry => entry.isFile() && /\.(mp3|wav)$/i.test(entry.name))
        .map(entry => ({ name: entry.name, source, bytes: fs.statSync(path.join(folder, entry.name)).size }))
      : []);
    return sendJson(res, { items });
  },

  "GET /api/library/music/selection": (req, res, url) => {
    try { return sendJson(res, {ok: true, selection: readMusicSelection(ROOT, url.searchParams.get('mode'))}); }
    catch (error) { return sendJson(res, {ok: false, error: error.message}); }
  },

  "PUT /api/library/music/selection": async (req, res) => {
    try {
      const body = await readBody(req);
      return sendJson(res, {ok: true, selection: writeMusicSelection(ROOT, body.mode, body.selection)});
    } catch (error) { return sendJson(res, {ok: false, error: error.message}); }
  },

  "GET /api/library/music/audio": (req, res, url) => {
    const source = url.searchParams.get("source");
    const name = url.searchParams.get("name") || "";
    if (!["builtin", "uploaded"].includes(source) || !name || name !== path.basename(name) || !/^[^<>:"/\\|?*\x00-\x1f]+\.(mp3|wav)$/i.test(name)) {
      res.writeHead(400); res.end(); return;
    }
    const folder = source === "builtin" ? path.join(ROOT, "assets", "audio", "bgm") : path.join(ROOT, "materials", "_music");
    const file = path.join(folder, name);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    return sendVideoRange(res, file, req.headers.range, name.toLowerCase().endsWith(".wav") ? "audio/wav" : "audio/mpeg");
  },

  "POST /api/library/music/upload": async (req, res, url) => {
    const name = url.searchParams.get("name") || "";
    const ext = path.extname(name).toLowerCase();
    if (!name || name !== path.basename(name) || !/^[^<>:"/\\|?*\x00-\x1f]+\.(mp3|wav)$/i.test(name) || ![".mp3", ".wav"].includes(ext)) return sendJson(res, { ok: false, error: "仅支持 MP3/WAV 文件" });
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 100 * 1024 * 1024) { res.writeHead(413); res.end(); return; }
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);
    const valid = ext === ".wav"
      ? data.length > 44 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WAVE"
      : data.length > 4 && (data.toString("ascii", 0, 3) === "ID3" || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0));
    if (!valid) return sendJson(res, { ok: false, error: "文件内容与音频格式不符" });
    const folder = path.join(ROOT, "materials", "_music");
    fs.mkdirSync(folder, { recursive: true });
    const base = path.basename(name, ext);
    let candidate = name;
    for (let number = 2; fs.existsSync(path.join(folder, candidate)); number++) candidate = `${base} (${number})${ext}`;
    fs.writeFileSync(path.join(folder, candidate), data, { flag: "wx" });
    return sendJson(res, { ok: true, name: candidate });
  },

  // ===== P0-3 接口对齐：以下接口此前缺失（前端 404→mock），现按契约实现真实数据 =====

  "GET /api/state": (req, res) => {
    const arr = [...tasks.values()].map(t => ({
      id: t.id, name: t.name, type: t.name, status: t.status, exitCode: t.exitCode, error: t.error, startedAt: t.startedAt, runId:t.runId || null,
    }));
    const operation = readAModeOperation();
    return sendJson(res, { tasks: arr, aModeBusy:!!(operation?.status === 'running' && processAlive(operation.pid)) });
  },

  "POST /api/action": async (req, res) => {
    const body = await readBody(req);
    const action = body.action;
    if (action === "plan" || action === "generate") return sendRetiredAMode(res);
    if (action === 'render') return sendJson(res, {ok:false, error:'请在分镜审核页确认渲染，直接渲染入口不可绕过任务校验'});
    if (action === "stop") {
      const ok = body.id !== undefined && stopTask(Number(body.id));
      return sendJson(res, ok ? { ok: true } : { ok: false, error: "任务不存在" });
    }
    if (action === "studio") {
      const id = startTask("studio", "npm run dev", path.join(ROOT, "template"));
      return sendJson(res, { ok: true, id });
    }
    if (action === "workbench") {
      return sendJson(res, { ok: false, error: "Motion Workbench 服务未接入项目" });
    }
    const cmds = {
      render: "node director/render.mjs",
      test: "npm test",
    };
    if (!cmds[action]) return sendJson(res, { ok: false, error: "未知动作: " + action });
    const id = startTask(action, cmds[action], ROOT);
    return sendJson(res, { ok: true, id });
  },

  "GET /api/materials": (req, res) => {
    const idxPath = path.join(ROOT, "materials", "_index.json");
    if (!fs.existsSync(idxPath)) return sendJson(res, { items: [] });
    const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
    const items = idx.slice(0, 24).map(item => ({ name: item.path, type: "video" }));
    return sendJson(res, { items });
  },

  "POST /api/materials/upload": async (req, res) => {
    const chunks = [];
    let total = 0;
    for await (const c of req) { chunks.push(c); total += c.length; if (total > 512 * 1024 * 1024) { res.writeHead(413); res.end(); return; } }
    const buf = Buffer.concat(chunks);
    const ct = req.headers["content-type"] || "";
    const bm = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
    if (!bm) return sendJson(res, { ok: false, error: "no boundary" });
    const boundary = Buffer.from("--" + (bm[1] || bm[2]));
    let added = 0;
    let pos = 0;
    while (true) {
      const start = buf.indexOf(boundary, pos);
      if (start === -1) break;
      const end = buf.indexOf(boundary, start + boundary.length);
      if (end === -1) break;
      const part = buf.subarray(start + boundary.length + 2, end);
      const headEnd = part.indexOf(Buffer.from("\r\n\r\n"));
      if (headEnd === -1) { pos = end; continue; }
      const head = part.subarray(0, headEnd).toString("utf8");
      const fm = /filename="([^"]*)"/i.exec(head);
      if (fm) {
        const fname = path.basename(fm[1]);
        if (fname) {
          const fileBuf = part.subarray(headEnd + 4, Math.max(headEnd + 4, part.length - 2));
          let target = path.join(ROOT, "materials", fname);
          let i = 1;
          while (fs.existsSync(target)) {
            const ext = path.extname(fname);
            target = path.join(ROOT, "materials", path.basename(fname, ext) + ` (${i++})` + ext);
          }
          fs.writeFileSync(target, fileBuf);
          added++;
        }
      }
      pos = end;
    }
    return sendJson(res, { ok: true, added, indexed: added });
  },

  "GET /api/library/tags": (req, res) => {
    const idxPath = path.join(ROOT, "materials", "_index.json");
    if (!fs.existsSync(idxPath)) return sendJson(res, { total: 0, tags: [] });
    const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
    const tagSet = new Set();
    for (const item of idx) for (const t of item.tags || []) tagSet.add(t);
    return sendJson(res, { total: idx.length, tags: [...tagSet] });
  },

  "POST /api/library/tag": async (req, res) => {
    const body = await readBody(req);
    const idxPath = path.join(ROOT, "materials", "_index.json");
    if (!fs.existsSync(idxPath)) return sendJson(res, { ok: false, error: "no index" });
    const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
    const item = idx.find(x => x.path === body.path);
    if (!item) return sendJson(res, { ok: false, error: "not found" });
    item.tags = Array.isArray(body.tags) ? body.tags : [];
    fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2), "utf8");
    return sendJson(res, { ok: true, updated: item.tags.length });
  },

  "GET /api/library/stat": (req, res) => {
    const idxPath = path.join(ROOT, "materials", "_index.json");
    if (!fs.existsSync(idxPath)) return sendJson(res, { total: 0, categories: [] });
    const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
    const map = new Map();
    for (const item of idx) {
      const c = item.category || "未分类";
      map.set(c, (map.get(c) || 0) + 1);
    }
    const categories = [...map.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
    return sendJson(res, { total: idx.length, categories });
  },

  "GET /api/theme": (req, res) => {
    const tpPath = path.join(ROOT, "director", "theme-pack.json");
    if (!fs.existsSync(tpPath)) return sendJson(res, { current: "黑金高级", presets: [], custom: null });
    const tp = JSON.parse(fs.readFileSync(tpPath, "utf8"));
    const sheet = tp.sheets && tp.sheets[0];
    const presets = [];
    if (sheet && Array.isArray(sheet.data)) {
      for (const row of sheet.data) {
        const name = String(row[1] || "").trim();
        if (!name) continue;
        const borderRaw = String(row[6] || "").split("+")[0].trim();
        const cardRaw = String(row[7] || "").split("/")[0].trim();
        const accent2Raw = String(row[9] || "").includes("→") ? String(row[9]).split("→")[1].trim() : String(row[9] || "").trim();
        presets.push({
          name, bg: String(row[3] || "").trim(), text: String(row[4] || "").trim(), sub: String(row[5] || "").trim(),
          border: borderRaw, card: cardRaw, accent: String(row[8] || "").trim(), accent2: accent2Raw,
          overlay: String(row[10] || "").trim(),
        });
      }
    }
    return sendJson(res, { current: presets[0] ? presets[0].name : "黑金高级", presets, custom: null });
  },

  "POST /api/theme/save": async (req, res) => {
    const body = await readBody(req);
    const tpPath = path.join(ROOT, "director", "theme-pack.json");
    let tp = { sheets: [] };
    if (fs.existsSync(tpPath)) tp = JSON.parse(fs.readFileSync(tpPath, "utf8"));
    if (!tp.sheets || !tp.sheets[0]) {
      tp.sheets = [{ name: "色彩风格包", start_cell: "A1", header: true, columns: [], data: [] }];
    }
    const sheet = tp.sheets[0];
    if (!Array.isArray(sheet.data)) sheet.data = [];
    const name = body.name || "我的主题";
    sheet.data.push([
      sheet.data.length + 1, name, "自定义（前端保存）",
      body.bg || "#0d0f14", body.text || "#e8e6e1", body.sub || "#8a8680",
      (body.border || "#2a2e38") + " + rgba(0,0,0,0.5)", body.card || "#1a1d24",
      body.accent || "#d4a853", (body.accent || "#d4a853") + " → " + (body.accent2 || "#b48020"),
      body.overlay || "rgba(0,0,0,0.6)",
    ]);
    fs.writeFileSync(tpPath, JSON.stringify(tp, null, 2), "utf8");
    return sendJson(res, { ok: true, saved: name });
  },

    "GET /api/theme/current": (req, res) => {
    const cp = path.join(ROOT, "director", "current-theme.json");
    if (!fs.existsSync(cp)) return sendJson(res, { ok: true, theme: null });
    return sendJson(res, { ok: true, theme: readCurrentTheme(ROOT) });
  },

  "PUT /api/theme/current": async (req, res) => {
    try {
      const body = await readBody(req);
      if (!body || !body.name || (!body.bg && !body.tokens?.background) || (!body.ink && !body.tokens?.text)) {
        return sendJson(res, { ok: false, error: "缺少主题数据" });
      }
      const theme = writeCurrentTheme(ROOT, normalizeTheme(body));
      return sendJson(res, { ok: true, saved: theme.name, theme });
    } catch (e) { return sendJson(res, { ok: false, error: e.message }); }
  },

  "GET /api/preview": (req, res) => {
    const outPath = path.join(readOutputDir(), "dynamic.mp4");
    if (!fs.existsSync(outPath)) return sendJson(res, { exists: false });
    const st = fs.statSync(outPath);
    return sendJson(res, { exists: true, size: st.size, mtime: st.mtimeMs });
  },

  "GET /api/stream": (req, res) => {
    const outPath = path.join(readOutputDir(), "dynamic.mp4");
    if (!fs.existsSync(outPath)) { res.writeHead(404); res.end(); return; }
    sendVideoRange(res, outPath, req.headers.range);
  },

  // P2：编导台保存文案 → C1 收敛节点（director/_input.txt）
  "POST /api/script/save": async (req, res) => {
    try {
      const body = await readBody(req);
      const text = (body && body.text !== undefined ? String(body.text) : "").trim();
      if (!text) return sendJson(res, { ok: false, error: "文案为空" });
      const p1 = path.join(ROOT, "director", "_input.txt");
      fs.writeFileSync(p1, text, "utf8");
      return sendJson(res, { ok: true, chars: text.length, file: "director/_input.txt" });
    } catch (e) { return sendJson(res, { ok: false, error: e.message }); }
  },

  // P2：成片画廊（template/out 视频列表）
  "GET /api/gallery": (req, res) => {
    const outDir = readOutputDir();
    let items = [];
    if (fs.existsSync(outDir)) {
      items = fs.readdirSync(outDir)
        .filter((f) => f.toLowerCase().endsWith(".mp4"))
        .map((f) => {
          const st = fs.statSync(path.join(outDir, f));
          return { name: f, size: st.size, mtime: st.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
    }
    return sendJson(res, { ok: true, items });
  },

  // P2：成片画廊视频流（Range）
  "GET /api/gallery/video": (req, res, url) => {
    const file = url.searchParams.get("file") || "";
    if (!file || file.includes("..") || file.includes("/") || file.includes("\\")) {
      res.writeHead(400); res.end("bad file"); return;
    }
    const vp = path.join(readOutputDir(), file);
    if (!fs.existsSync(vp)) { res.writeHead(404); res.end(); return; }
    sendVideoRange(res, vp, req.headers.range);
  },

  // 删除单个成片记录（实际删除 template/out 下对应视频）
  "POST /api/gallery/delete": async (req, res) => {
    const body = await readBody(req);
    const file = typeof body?.file === "string" ? body.file : "";
    if (!file || file.includes("..") || file.includes("/") || file.includes("\\") || !file.toLowerCase().endsWith(".mp4")) {
      return sendJson(res, { ok: false, error: "文件名无效" });
    }
    const vp = path.join(readOutputDir(), file);
    if (!fs.existsSync(vp)) return sendJson(res, { ok: false, error: "成片不存在或已删除" });
    try {
      fs.unlinkSync(vp);
      return sendJson(res, { ok: true, deleted: file });
    } catch (e) { return sendJson(res, { ok: false, error: e.message }); }
  },

  "GET /api/output-path": (req, res) => {
    return sendJson(res, { ok: true, path: readOutputDir(), defaultPath: DEFAULT_OUTPUT_DIR });
  },

  "POST /api/output-path": async (req, res) => {
    try {
      const body = await readBody(req);
      const outputDir = writeOutputDir(body.path);
      return sendJson(res, { ok: true, path: outputDir });
    } catch (e) { return sendJson(res, { ok: false, error: e.message }); }
  },

  // 打开当前导出路径（Windows 资源管理器）——路径来自本地配置，不接受请求参数
  "POST /api/open-out-folder": (req, res) => {
    const outDir = readOutputDir();
    if (!fs.existsSync(outDir)) return sendJson(res, { ok: false, error: "out 目录不存在" });
    try {
      spawn("explorer.exe", [outDir], { detached: true, stdio: "ignore" }).unref();
      sendJson(res, { ok: true, dir: outDir });
    } catch (e) { sendJson(res, { ok: false, error: e.message }); }
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  const method = req.method;

  if (method === 'GET' && p === '/api/runtime-health') {
    return sendJson(res, {ok:true, schema:'shotcraft-runtime-health-v1', pid:process.pid,
      instance:process.env.SHOTCRAFT_INSTANCE || null,
      version:process.env.SHOTCRAFT_RELEASE_VERSION || 'development', taskExecution});
  }

  const key = `${method} ${p}`;
  if (apis[key]) {
    // 在保存新运行、写入审核结果或调用外部服务前拦截不可执行环境。
    const taskRoutes = new Set(['/api/talkcraft/create', '/api/talkcraft/revise',
      '/api/talkcraft/recover-timing', '/api/talkcraft/stage', '/api/talkcraft/approve-sample',
      '/api/talkcraft/storyboard-regenerate', '/api/talkcraft/workbench', '/api/mode-c/create']);
    if (method === 'POST' && taskRoutes.has(p) && !taskExecution.ok)
      return sendJson(res, {ok:false, code:'TASK_EXECUTION_UNAVAILABLE', error:taskExecution.error});

    try { await apis[key](req, res, url); }
    catch (e) { sendJson(res, { error: e.message }); }
    return;
  }

  // 视频外包装模块（packaging-*）：路由实现共享自 director/packaging-routes.mjs
  if (p.startsWith(PACKAGING_PREFIX)) {
    const out = await packagingHandle(method, p, url, () => readBody(req));
    res.writeHead(out.status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(out.payload));
    return;
  }

  if (p === "/director" || p === "/director/") {
    return sendStatic(res, path.join(ROOT, "director", "b-mode-console.html"));
  }
  let filePath = path.join(ROOT, p === "/" ? "console-ui.html" : p);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return sendStatic(res, filePath);
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Server running: http://127.0.0.1:${PORT}`);
});
