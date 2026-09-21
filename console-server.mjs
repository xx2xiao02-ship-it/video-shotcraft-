// Video ShotCraft console server
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "E:\\video-shotcraft";
const PORT = 8765;
const CHROME = "C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const PYTHON = "C:\\Users\\Administrator\\AppData\\Local\\Python\\bin\\python.exe";

let taskId = 0;
const tasks = new Map();

function startTask(name, cmd, cwd) {
  const id = ++taskId;
  const proc = spawn("cmd", ["/c", cmd], { cwd });
  const task = { id, name, cmd, status: "running", logs: [], startedAt: Date.now() };
  tasks.set(id, task);
  proc.stdout.on("data", d => task.logs.push(d.toString()));
  proc.stderr.on("data", d => task.logs.push(d.toString()));
  proc.on("close", code => {
    task.status = code === 0 ? "done" : "error";
    task.exitCode = code;
  });
  return id;
}

function sendJson(res, data) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendStatic(res, filePath, maxAge = 0) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".json": "application/json" }[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime, "Cache-Control": `max-age=${maxAge}` });
  fs.createReadStream(filePath).pipe(res);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

const apis = {
  "POST /api/generate": async (req, res) => {
    const body = await readBody(req);
    const text = (body.text || "").trim();
    if (!text) return sendJson(res, { ok: false, error: "empty" });
    const txtFile = path.join(ROOT, "director", "_input.txt");
    fs.writeFileSync(txtFile, text, "utf8");
    const cmd = [
      `"${PYTHON}" director/tts.py _input.txt`,
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
      `"${PYTHON}" director/tts.py _input.txt`,
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
    return sendJson(res, { since: t.logs.length, done: t.status !== "running", status: t.status, exitCode: t.exitCode, logs: t.logs.slice(since) });
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
    let filtered = idx;
    if (wantTags.length) filtered = idx.filter(item => wantTags.every(t => item.tags.includes(t)));
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "60"), 200);
    const items = filtered.slice(offset, offset + limit).map(item => ({
      path: item.path, category: item.category, duration_sec: item.duration_sec,
      width: item.width, height: item.height, tags: item.tags,
    }));
    return sendJson(res, { items, total: filtered.length, offset, limit });
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
    const stat = fs.statSync(videoPath);
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = parseInt(m[1]);
      const end = m[2] ? parseInt(m[2]) : stat.size - 1;
      res.writeHead(206, {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(videoPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": stat.size });
      fs.createReadStream(videoPath).pipe(res);
    }
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

server.listen(PORT, () => {
  console.log(`Server running: http://127.0.0.1:${PORT}`);
});
