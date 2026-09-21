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
  const proc = spawn(cmd, { cwd, shell: true });
  const task = { id, name, cmd, status: "running", logs: [], startedAt: Date.now(), proc };
  tasks.set(id, task);
  proc.stdout.on("data", d => task.logs.push(d.toString()));
  proc.stderr.on("data", d => task.logs.push(d.toString()));
  proc.on("close", code => {
    task.status = code === 0 ? "done" : "error";
    task.exitCode = code;
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

function sendVideoRange(res, videoPath, rangeHeader) {
  const stat = fs.statSync(videoPath);
  if (rangeHeader) {
    const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (!m) { res.writeHead(416); res.end(); return; }
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
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": stat.size, "Accept-Ranges": "bytes" });
    fs.createReadStream(videoPath).pipe(res);
  }
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
    try {
      return sendJson(res, { ok: true, theme: JSON.parse(fs.readFileSync(cp, "utf8")) });
    } catch (e) { return sendJson(res, { ok: true, theme: null }); }
  },

  "PUT /api/theme/current": async (req, res) => {
    try {
      const body = await readBody(req);
      if (!body || !body.name || !body.bg || !body.ink) return sendJson(res, { ok: false, error: "缺少主题数据" });
      fs.writeFileSync(path.join(ROOT, "director", "current-theme.json"), JSON.stringify(body, null, 2), "utf8");
      return sendJson(res, { ok: true, saved: body.name });
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
