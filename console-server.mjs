// Video ShotCraft console server
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {loadAcceptanceFixture} from "./director/b-mode-acceptance.mjs";
import {resolveLibraryVideo} from "./director/b-mode-library-video.mjs";
import {loadMaterialIndex, matchSceneVideos} from "./director/b-mode-material-match.mjs";
import {createTalkcraftInput} from "./director/talkcraft-input.mjs";
import {buildTalkcraftAuditSegments} from "./director/talkcraft-audit-segments.mjs";
import {approveTalkcraftSample, latestTalkcraftRun, readTalkcraftStatus, talkcraftProject} from "./director/talkcraft-status.mjs";
import {readTalkcraftWorkbench, startTalkcraftWorkbench} from "./director/talkcraft-workbench.mjs";
import {resolveTalkcraftSkillRoot} from "./director/talkcraft-skill-root.mjs";
import {latestTalkcraftFailureReport, writeTalkcraftFailureReport} from "./director/talkcraft-failure-report.mjs";
import {normalizeTheme, readCurrentTheme, writeCurrentTheme} from "./director/theme-contract.mjs";

const ROOT = "E:\\video-shotcraft";
const PORT = Number(process.env.PORT || 8765);
const CHROME = "C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const PYTHON = "C:\\Users\\Administrator\\AppData\\Local\\Python\\bin\\python.exe";

let taskId = 0;
const tasks = new Map();

function startTask(name, cmd, cwd) {
  const id = ++taskId;
  const proc = spawn(cmd, { cwd, shell: true });
  const task = { id, name, cmd, status: "running", logs: [], startedAt: Date.now(), proc };
  tasks.set(id, task);
  proc.stdout.on("data", d => task.logs.push(d.toString()));
  proc.stderr.on("data", d => task.logs.push(d.toString()));
  proc.on("close", code => {
    task.exitCode = code;
    if (code !== 0 && task.runId && name.startsWith('talkcraft-')) {
      try { task.failureReport = writeTalkcraftFailureReport(ROOT, task.runId, task).report; }
      catch (error) { task.logs.push(`失败报告生成失败：${String(error.message || error)}`); }
    }
    task.status = code === 0 ? "done" : "error";
  });
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

function sendStatic(res, filePath, maxAge = 0) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".mp4": "video/mp4", ".json": "application/json" }[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime, "Cache-Control": `max-age=${maxAge}` });
  fs.createReadStream(filePath).pipe(res);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

async function readBModeInput(req) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.startsWith("multipart/form-data")) return { fields: await readBody(req), avatar: null };
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new Error("图片和参数总大小不能超过 8 MB");
    chunks.push(chunk);
  }
  const form = await new Request("http://localhost/", {
    method: "POST",
    headers: { "content-type": contentType },
    body: Buffer.concat(chunks),
  }).formData();
  const avatar = form.get("avatar");
  return {
    fields: Object.fromEntries(["text", "voice", "scenes", "background", "backgroundVideoPath"].map(key => [key, form.get(key)])),
    avatar: avatar && typeof avatar.arrayBuffer === "function" && avatar.size ? avatar : null,
  };
}

function withTalkcraftWorkbench(run) {
  return {...run, workbenchUrl:readTalkcraftWorkbench(ROOT, run.runId)?.url || null,
    failureReport:latestTalkcraftFailureReport(ROOT, run.runId)};
}

const apis = {
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
      const shots = fs.existsSync(shotsFile) ? JSON.parse(fs.readFileSync(shotsFile, 'utf8')) : [];
      const sentences = fs.existsSync(semanticFile) ? JSON.parse(fs.readFileSync(semanticFile, 'utf8')).sentences || [] : [];
      return sendJson(res, {ok:true, shots:shots.map(shot => ({...shot,
        sentences:sentences.filter(sentence => sentence.shot === shot.id).map(sentence =>
          ({text:sentence.text, sem:sentence.sem, weight:sentence.weight}))}))});
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
      const avatarFile = path.join(sourceProject, 'assets', 'avatar.png');
      if (!fs.existsSync(avatarFile)) throw new Error('原运行没有可复用的角色图，请回编导台重新选择');
      const voice = ['zh-CN-YunxiNeural','zh-CN-XiaoxiaoNeural'].includes(body.voice) ? body.voice : sourceRun.voice;
      const created = createTalkcraftInput(ROOT, {text:body.text, voice,
        avatarBytes:fs.readFileSync(avatarFile)});
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
  "GET /api/talkcraft/audit": (req, res, url) => {
    try {
      const runId = url.searchParams.get('id') || '';
      const project = talkcraftProject(ROOT, runId);
      const script = fs.readFileSync(path.join(project, 'input.txt'), 'utf8').trim();
      const timestampFile = path.join(project, 'audio', 'timestamps.json');
      const timestamps = fs.existsSync(timestampFile) ? JSON.parse(fs.readFileSync(timestampFile, 'utf8')) : null;
      const sentences = Array.isArray(timestamps?.sentences) ? timestamps.sentences.map((sentence, index) => ({
        index:index + 1, text:sentence.text, start:sentence.start, end:sentence.end,
        match:sentence.match, ok:sentence.ok === true && sentence.match >= 0.9,
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
      const {fields, avatar} = await readBModeInput(req);
      if (!avatar) throw new Error('请先选择角色图');
      const created = createTalkcraftInput(ROOT, {text:fields.text, voice:fields.voice,
        avatarBytes:Buffer.from(await avatar.arrayBuffer())});
      const id = startTask('talkcraft-bootstrap', `node director/talkcraft-stages.mjs bootstrap ${created.runId}`, ROOT);
      tasks.get(id).runId = created.runId;
      return sendJson(res, {ok:true, id, runId:created.runId, sentences:created.sentences});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/talkcraft/stage": async (req, res) => {
    try {
      const {runId, stage} = await readBody(req);
      if (!['candidates','preflight','scaffold','sample','render-all','render-sfx-solo','qa','deliver'].includes(stage)) throw new Error('不支持的 TalkCraft 阶段');
      talkcraftProject(ROOT, runId);
      const active = [...tasks.values()].find(task => task.runId === runId && task.status === 'running');
      if (active) throw new Error('本片已有任务运行中');
      const id = startTask(`talkcraft-${stage}`, `node director/talkcraft-stages.mjs ${stage} ${runId}`, ROOT);
      tasks.get(id).runId = runId;
      return sendJson(res, {ok:true, id, runId, stage});
    } catch (error) { return sendJson(res, {ok:false, error:String(error.message || error)}); }
  },
  "POST /api/talkcraft/approve-sample": async (req, res) => {
    try {
      const {runId} = await readBody(req);
      return sendJson(res, {ok:true, ...approveTalkcraftSample(ROOT, runId)});
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
  "GET /api/talkcraft/audio": (req, res, url) => {
    try {
      const file = path.join(talkcraftProject(ROOT, url.searchParams.get('id') || ''), 'audio', 'full.mp3');
      if (!fs.existsSync(file)) {res.writeHead(404); res.end('Audio not ready'); return;}
      return sendVideoRange(res, file, req.headers.range, 'audio/mpeg');
    } catch {res.writeHead(400); res.end('Invalid TalkCraft audio request');}
  },
  "GET /api/b-mode/acceptance": (req, res) => sendJson(res, {ok:true, ...loadAcceptanceFixture()}),
  "POST /api/b-mode/placeholder": async (req, res) => {
    const { fields, avatar } = await readBModeInput(req);
    const text = typeof fields.text === "string" ? fields.text.replace(/\r\n/g, "\n").trim() : "";
    const voice = fields.voice || "zh-CN-YunxiNeural";
    if (!text || text.length > 1200) return sendJson(res, { ok: false, error: "占位测试文案需为 1–1200 字" });
    if (!avatar || avatar.size > 7 * 1024 * 1024) return sendJson(res, { ok: false, error: "请上传不超过 7 MB 的角色图" });
    if (!["zh-CN-YunxiNeural", "zh-CN-XiaoxiaoNeural"].includes(voice)) return sendJson(res, { ok: false, error: "占位测试仅支持现成音色" });
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
    fs.writeFileSync(path.join(runDir, "placeholder-settings.json"), JSON.stringify({voice, background,
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
  "POST /api/generate": async (req, res) => {
    const body = await readBody(req);
    const text = (body.text || "").trim();
    if (!text) return sendJson(res, { ok: false, error: "empty" });
    const txtFile = path.join(ROOT, "director", "_input.txt");
    fs.writeFileSync(txtFile, text, "utf8");
    const cmd = [
      `"${PYTHON}" director/tts.py director/_input.txt`,
      `node director/build-storyboard.mjs --mode=A`,
      `copy /y "director\\voiceover.mp3" "template\\public\\audio\\voiceover.mp3"`,
      `node director/render.mjs`,
    ].join(" && ");
    const id = startTask("generate", cmd, ROOT);
    return sendJson(res, { ok: true, id });
  },

  "POST /api/generate/plan": async (req, res) => {
    const body = await readBody(req);
    const text = (body.text || "").trim();
    if (!text) return sendJson(res, { ok: false, error: "empty" });
    const txtFile = path.join(ROOT, "director", "_input.txt");
    fs.writeFileSync(txtFile, text, "utf8");
    const cmd = [
      `"${PYTHON}" director/tts.py director/_input.txt`,
      `node director/build-storyboard.mjs --mode=A`,
    ].join(" && ");
    const id = startTask("plan", cmd, ROOT);
    return sendJson(res, { ok: true, id });
  },

  "POST /api/render/confirm": async (req, res) => {
    const id = startTask("render", "node director/render.mjs", ROOT);
    return sendJson(res, { ok: true, id });
  },

  "GET /api/task": (req, res, url) => {
    const id = Number(url.searchParams.get("id"));
    const since = Number(url.searchParams.get("since") || 0);
    const t = tasks.get(id);
    if (!t) return sendJson(res, { error: "no task" });
    return sendJson(res, { since: t.logs.length, done: t.status !== "running", status: t.status, exitCode: t.exitCode,
      logs: t.logs.slice(since), runId: t.runId, sourceRunId:t.sourceRunId || null, failureReport:t.failureReport || null });
  },

  "POST /api/task/clear": async (req, res) => {
    const body = await readBody(req);
    const id = Number(body && body.id);
    const t = tasks.get(id);
    if (!t) return sendJson(res, { ok: false, error: "任务不存在" });
    t.logs.length = 0;
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

  // ===== P0-3 接口对齐：以下接口此前缺失（前端 404→mock），现按契约实现真实数据 =====

  "GET /api/state": (req, res) => {
    const arr = [...tasks.values()].map(t => ({
      id: t.id, name: t.name, type: t.name, status: t.status, exitCode: t.exitCode, startedAt: t.startedAt,
    }));
    return sendJson(res, { tasks: arr });
  },

  "POST /api/action": async (req, res) => {
    const body = await readBody(req);
    const action = body.action;
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
      plan: [`"${PYTHON}" director/tts.py director/_input.txt`, `node director/build-storyboard.mjs --mode=A`].join(" && "),
      generate: [`"${PYTHON}" director/tts.py director/_input.txt`, `node director/build-storyboard.mjs --mode=A`, `copy /y "director\\voiceover.mp3" "template\\public\\audio\\voiceover.mp3"`, `node director/render.mjs`].join(" && "),
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
    const outPath = path.join(ROOT, "template", "out", "dynamic.mp4");
    if (!fs.existsSync(outPath)) return sendJson(res, { exists: false });
    const st = fs.statSync(outPath);
    return sendJson(res, { exists: true, size: st.size, mtime: st.mtimeMs });
  },

  "GET /api/stream": (req, res) => {
    const outPath = path.join(ROOT, "template", "out", "dynamic.mp4");
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
    const outDir = path.join(ROOT, "template", "out");
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
    const vp = path.join(ROOT, "template", "out", file);
    if (!fs.existsSync(vp)) { res.writeHead(404); res.end(); return; }
    sendVideoRange(res, vp, req.headers.range);
  },

  // 打开成片所在文件夹（Windows 资源管理器）——固定路径 template/out，不接受参数
  "POST /api/open-out-folder": (req, res) => {
    const outDir = path.join(ROOT, "template", "out");
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

  const key = `${method} ${p}`;
  if (apis[key]) {
    try { await apis[key](req, res, url); }
    catch (e) { sendJson(res, { error: e.message }); }
    return;
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
