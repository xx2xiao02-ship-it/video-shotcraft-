
const PANEL_ORDER = ["plan", "generate", "render", "studio", "workbench", "test"];
const PANEL_META = {
  plan:       { title: "📋 分镜生成", hint: "TTS → 自动分类镜头" },
  generate:  { title: "🎙️ 口播生成", hint: "TTS → 分镜 → 渲染 全自动" },
  render:    { title: "🎬 渲染模板视频", hint: "输出到 template\\out\\promo.mp4" },
  studio:    { title: "🎛️ Remotion Studio", hint: "长驻服务，停止后请关闭对应浏览器标签页" },
  workbench: { title: "✂️ Motion Workbench", hint: "长驻服务，访问 http://localhost:5198" },
  test:      { title: "🧪 单元测试", hint: "npm test" },
};
const state = { tasks: [], logs: {}, lastFetched: {} };

const $ = (s) => document.querySelector(s);
const toast = $("#toast");
let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function statusText(s) {
  return { running: "运行中", stopping: "停止中", done: "已完成", error: "出错" }[s] || s;
}

function renderPanels() {
  const wrap = $("#panels");
  wrap.innerHTML = "";
  for (const type of PANEL_ORDER) {
    const tasks = state.tasks.filter((t) => t.type === type);
    const latest = tasks[0] || null;
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.id = `panel-${type}`;
    panel.innerHTML = `
      <div class="phead">
        <div class="ptitle">${PANEL_META[type].title}</div>
        <div class="pstatus ${latest ? latest.status : ""}">${latest ? statusText(latest.status) : "未运行"}</div>
        <span style="font-size:12px;color:#8b93a3">${PANEL_META[type].hint}</span>
        <div class="actions">
          <button data-run="${type}">启动</button>
          ${latest && (latest.status === "running" || latest.status === "stopping") ? `<button class="stop" data-stop="${latest.id}">停止</button>` : ""}
        </div>
      </div>
      <div class="progress-wrap" data-toggle-log="${type}">
        <div class="progress-bar-bg"><div class="progress-bar-fill" id="pbar-${type}"></div></div>
        <div class="progress-info">
          <span id="pinfo-${type}">等待开始</span>
          <span class="progress-arrow" id="parrow-${type}">▼ 详情</span>
        </div>
      </div>
      <div class="log" id="log-${type}"><span class="empty">暂无日志，点击「启动」开始…</span></div>`;
    wrap.appendChild(panel);
  }
  bindButtons();
}

function onVTypeChange() {
  const vtype = $("#b-vtype").value;
  document.querySelectorAll(".vtype-fields").forEach((el) => {
    el.style.display = el.dataset.vtype === vtype ? "" : "none";
  });
}

function bindButtons() {
  document.querySelectorAll(".card[data-action]").forEach((el) => {
    el.onclick = () => {
      const action = el.dataset.action;
      if (action === "gallery") { window.open("/gallery/", "_blank"); return; }
      doAction(action);
    };
  });
  document.querySelectorAll("[data-run]").forEach((el) => {
    el.onclick = () => doAction(el.dataset.run);
  });
  document.querySelectorAll("[data-stop]").forEach((el) => {
    el.onclick = () => doAction("stop", { id: el.dataset.stop });
  });
  // 展开/收起日志
  document.querySelectorAll("[data-toggle-log]").forEach((el) => {
    el.onclick = () => {
      const type = el.dataset.toggleLog;
      const logEl = document.getElementById(`log-${type}`);
      const arrow = document.getElementById(`parrow-${type}`);
      logEl.classList.toggle("open");
      arrow.classList.toggle("open");
    };
  });
  // A 模式：一键生成口播视频 → 先出分镜校准
  $("#b-mode-a").onclick = async () => {
    const text = $("#b-fulltext").value.trim();
    if (!text) { showToast("请先粘贴口播文案"); return; }
    $("#gen-progress-card").style.display = "";
    let genProg = 5; setGenProgress(genProg, "TTS 语音合成中…");
    try {
      const r = await fetch("/api/generate/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await r.json();
      if (j.ok) {
        setGenProgress(25, "分镜生成中…");
        const poll = setInterval(async () => {
          const sr = await fetch("/api/logs?id=" + j.id + "&since=0");
          const sj = await sr.json();
          if (sj.done) {
            clearInterval(poll);
            if (sj.exitCode === 0) {
              setGenProgress(45, "分镜完成，等待确认渲染…");
              await loadStoryboard();
            } else {
              setGenProgress(0, "生成失败");
              showToast("生成失败，看日志");
            }
          } else {
            genProg = Math.min(44, genProg + 2);
            setGenProgress(genProg, "分镜生成中…");
          }
        }, 1500);
      } else if (j.error) { showToast(j.error); setGenProgress(0, "出错了"); }
    } catch (e) {
      showToast("请求失败: " + e.message);
      setGenProgress(0, "请求失败");
    }
    refresh();
  };

  function setGenProgress(pct, status) {
    $("#gen-progress-bar").style.width = pct + "%";
    $("#gen-pct").textContent = Math.round(pct) + "%";
    $("#gen-status").textContent = status;
  }

  // 分镜校准：加载并渲染分镜表
  async function loadStoryboard() {
    try {
      const r = await fetch("/api/storyboard");
      const j = await r.json();
      if (!j.exists) { showToast("还没有分镜，请先生成"); return; }
      const sb = j.storyboard;
      $("#storyboard-card").style.display = "";
      $("#storyboard-card").scrollIntoView({ behavior: "smooth", block: "center" });
      const list = $("#sb-list");
      list.innerHTML = "";
      const typeColors = {
        hook: "#ef4444", pain: "#f97316", claim: "#eab308",
        proof: "#22c55e", quote: "#8b5cf6", cta: "#0ea5e9"
      };
      const typeNames = {
        hook: "钩子", pain: "痛点", claim: "论点", proof: "论据", quote: "金句", cta: "行动"
      };
      sb.shots.forEach((shot, i) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #242833;align-items:flex-start";
        const dur = (shot.durationInFrames / sb.fps).toFixed(1);
        row.innerHTML = `
          <div style="min-width:30px;font-size:12px;color:#5b6472;padding-top:6px">${i+1}</div>
          <div style="min-width:50px">
            <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${typeColors[shot.type]}22;color:${typeColors[shot.type]};font-weight:600">${typeNames[shot.type]}</span>
          </div>
          <div style="flex:1;font-size:13px;line-height:1.5;color:#e6e9ef">${shot.text}</div>
          <div style="min-width:120px;font-size:11px;color:#8b93a3;padding-top:4px;text-align:right">${dur}s</div>
        `;
        list.appendChild(row);
      });
      showToast("分镜校准完成 ✓ 确认后渲染");
    } catch (e) { showToast("加载分镜失败: " + e.message); }
  }

  // 保存分镜修改

  // 确认渲染
  $("#sb-render").onclick = async () => {
    setGenProgress(50, "Remotion 渲染中…");
    try {
      const r = await fetch("/api/render/confirm", { method: "POST" });
      const j = await r.json();
      if (j.ok && j.id) {
        showToast("渲染已启动 ✓");
        // 轮询渲染日志
        let since = 0;
        const poll = setInterval(async () => {
          try {
            const lr = await fetch("/api/logs?id=" + j.id + "&since=" + since);
            const lj = await lr.json();
            if (lj.logs && lj.logs.length) {
              since = lj.since;
              // 把最新日志显示在进度条下方
              const lastLog = lj.logs[lj.logs.length - 1].trim();
              if (lastLog) setGenProgress(50 + Math.min(45, (lj.since / 50) * 10), lastLog);
            }
            if (lj.done) {
              clearInterval(poll);
              if (lj.exitCode === 0) {
                setGenProgress(100, "✅ 渲染完成");
                await loadPreview();
              } else {
                setGenProgress(0, "❌ 渲染失败 (退出码 " + lj.exitCode + ")");
                showToast("渲染失败");
              }
            }
          } catch (e) {}
        }, 2000);
      } else {
        setGenProgress(0, "渲染启动失败");
      }
    } catch (e) { showToast("渲染失败: " + e.message); setGenProgress(0, "渲染失败"); }
    refresh();
  };
}

async function doAction(action, extra = {}) {
  try {
    const r = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const j = await r.json();
    if (j.ok) showToast(action === "stop" ? "已发送停止指令" : "已启动 ✓");
    else if (j.error) showToast(j.error);
  } catch (e) {
    showToast("请求失败: " + e.message);
  }
  refresh();
}

async function refresh() {
  try {
    const r = await fetch("/api/state");
    const j = await r.json();
    const prevIds = state.tasks.map((t) => t.id).join(",");
    const newIds = j.tasks.map((t) => t.id).join(",");
    state.tasks = j.tasks;
    // 只在任务集合（ID）变化时重建面板 DOM，平时只更新状态徽标，避免页面闪烁
    if (prevIds !== newIds) renderPanels();
    updateStatusBadges();
    for (const t of j.tasks) {
      if (t.status === "running" || t.status === "stopping" || t.status === "done") {
        fetchLogs(t.id);
      }
    }
  } catch { /* 服务暂不可达 */ }
}

// 只更新状态徽标 class 和停止按钮，不触碰日志 DOM
function updateStatusBadges() {
  for (const type of PANEL_ORDER) {
    const tasks = state.tasks.filter((t) => t.type === type);
    const latest = tasks[0] || null;
    const panel = document.getElementById(`panel-${type}`);
    if (!panel) continue;
    const badge = panel.querySelector(".pstatus");
    if (badge) {
      badge.className = "pstatus" + (latest ? " " + latest.status : "");
      badge.textContent = latest ? statusText(latest.status) : "未运行";
    }
    // 停止按钮：仅在任务运行中时显示/更新
    const actions = panel.querySelector(".actions");
    let stopBtn = actions.querySelector("[data-stop]");
    const showStop = latest && (latest.status === "running" || latest.status === "stopping");
    if (showStop && !stopBtn) {
      stopBtn = document.createElement("button");
      stopBtn.className = "stop";
      stopBtn.dataset.stop = latest.id;
      stopBtn.textContent = "停止";
      stopBtn.onclick = () => doAction("stop", { id: latest.id });
      actions.appendChild(stopBtn);
    } else if (!showStop && stopBtn) {
      stopBtn.remove();
    } else if (stopBtn && latest) {
      stopBtn.dataset.stop = latest.id;
    }
  }
}

async function fetchLogs(id) {
  const since = state.lastFetched[id] || 0;
  try {
    const r = await fetch(`/api/logs?id=${id}&since=${since}`);
    const j = await r.json();
    state.lastFetched[id] = j.since;
    const t = state.tasks.find((x) => x.id === id);
    const type = t ? t.type : id.split("-")[0];
    const logEl = document.getElementById(`log-${type}`);
    const pbar = document.getElementById(`pbar-${type}`);
    const pinfo = document.getElementById(`pinfo-${type}`);
    if (!logEl) return;
    if (logEl.querySelector(".empty")) logEl.innerHTML = "";
    if (j.logs && j.logs.length) {
      const frag = document.createDocumentFragment();
      for (const line of j.logs) {
        const text = line.replace(/\n$/, "");
        // 解析 Remotion 渲染进度: Rendered 127/2724, time remaining: 7m 57s
        const m = /Rendered\s+(\d+)\/(\d+).*?time remaining:\s*(.+)/.exec(text);
        if (m && pbar) {
          const done = parseInt(m[1]), total = parseInt(m[2]);
          const pct = Math.round(done / total * 100);
          pbar.style.width = pct + "%";
          if (pinfo) pinfo.innerHTML = `<span class="pct">${pct}%</span> ${done}/${total} 帧 · 剩余 ${m[3].trim()}`;
        }
        const d = document.createElement("div");
        d.textContent = text;
        frag.appendChild(d);
      }
      logEl.appendChild(frag);
      logEl.scrollTop = logEl.scrollHeight;
    }
    if (j.done && !logEl.dataset.doneMark) {
      logEl.dataset.doneMark = "1";
      if (pbar) pbar.style.width = "100%";
      if (pinfo) pinfo.textContent = "✅ 完成";
      refresh();
      // 如果是 generate 任务完成，加载预览
      if ((type === "generate" || type === "render") && j.exitCode === 0) loadPreview();
      if (type === "plan" && j.exitCode === 0) {
        showToast("✅ 分镜生成完成，校准页已弹出");
        loadStoryboard();
      }
    }
  } catch { /* 忽略瞬时错误 */ }
}

async function loadPreview() {
  try {
    const r = await fetch("/api/preview");
    const j = await r.json();
    if (j.exists) {
      $("#preview-card").style.display = "";
      $("#preview-info").textContent = `文件大小 ${(j.size/1024/1024).toFixed(1)} MB · 生成于 ${new Date(j.mtime).toLocaleTimeString()}`;
      $("#preview-video").src = "/api/stream?" + Date.now();
      setGenProgress(100, "✅ 生成完成");
    }
  } catch {}
}

// 素材库
async function loadMaterials() {
  try {
    const r = await fetch("/api/materials");
    const j = await r.json();
    const list = $("#mat-list");
    list.innerHTML = "";
    if (!j.items || !j.items.length) {
      list.innerHTML = '<div style="color:#5b6472;font-size:13px;padding:8px 0">暂无素材</div>';
      return;
    }
    for (const it of j.items) {
      const div = document.createElement("div");
      div.style.cssText = "width:120px;border-radius:10px;overflow:hidden;background:#0d0f13;border:1px solid #2a2e38;cursor:pointer";
      const src = "/materials/" + encodeURIComponent(it.name);
      if (it.type === "image") {
        div.innerHTML = `
          <div style="height:80px;overflow:hidden">
            <img src="${src}" style="width:100%;height:100%;object-fit:cover">
          </div>
          <div style="padding:6px 8px;font-size:11px;color:#8b93a3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.name}</div>
        `;
      } else {
        div.innerHTML = `
          <div style="height:80px;overflow:hidden;position:relative">
            <video src="${src}" style="width:100%;height:100%;object-fit:cover" muted></video>
            <div style="position:absolute;bottom:4px;right:4px;background:#000a;color:#fff;font-size:10px;padding:1px 5px;border-radius:4px">🎥</div>
          </div>
          <div style="padding:6px 8px;font-size:11px;color:#8b93a3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.name}</div>
        `;
      }
      list.appendChild(div);
    }
  } catch {}
}

// 素材上传（多选文件）
$("#mat-upload").onclick = () => $("#mat-file").click();
$("#mat-file").onchange = async () => {
  const files = Array.from($("#mat-file").files);
  if (!files.length) return;
  showToast(`上传 ${files.length} 个文件…`);
  let ok = 0;
  for (const f of files) {
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await fetch("/api/materials/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (j.ok) ok++;
    } catch {}
  }
  showToast(`上传完成: ${ok}/${files.length} 个文件`);
  loadMaterials();
  $("#mat-file").value = "";
};

// 素材上传（整个文件夹）
$("#mat-upload-folder").onclick = () => $("#mat-folder").click();
$("#mat-folder").onchange = async () => {
  const files = Array.from($("#mat-folder").files);
  const media = files.filter(f => /\.(mp4|webm|mov|jpg|jpeg|png)$/i.test(f.name));
  if (!media.length) { showToast("文件夹里没找到视频/图片"); return; }
  showToast(`从文件夹上传 ${media.length} 个素材…`);
  let ok = 0;
  for (const f of media) {
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await fetch("/api/materials/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (j.ok) ok++;
    } catch {}
  }
  showToast(`上传完成: ${ok}/${media.length} 个素材`);
  loadMaterials();
  $("#mat-folder").value = "";
};

// ===== 色彩风格模块 =====
const THEMES = [
  { id: "dark-gold",   name: "黑金高级", bg: "#0d0f14", ink: "#e8e6e1", mid: "#8a8680", accent: "#d4a853", accent2: "#b48020", card: "#1a1d24", border: "#2a2e38", overlay: "#000000", overlayAlpha: 60, fontFamily: "'Noto Serif SC', 'Songti SC', serif", titleSize: 36, radius: 12 },
  { id: "deep-tech",   name: "深蓝科技", bg: "#0a1420", ink: "#e0f0ff", mid: "#6a8a9a", accent: "#4ecdc4", accent2: "#2a9a9a", card: "#142838", border: "#1a3040", overlay: "#000814", overlayAlpha: 60, fontFamily: "'Noto Sans SC', sans-serif", titleSize: 36, radius: 8 },
  { id: "light-biz",   name: "浅色商务", bg: "#f7f5f0", ink: "#1a1a1a", mid: "#8a8a8a", accent: "#1a4a8a", accent2: "#0a2a5a", card: "#ffffff", border: "#e0dcd4", overlay: "#ffffff", overlayAlpha: 20, fontFamily: "'Noto Sans SC', 'PingFang SC', sans-serif", titleSize: 34, radius: 8 },
  { id: "cyber",       name: "暗黑赛博", bg: "#0a0a12", ink: "#f0f0ff", mid: "#7a7a9a", accent: "#ff2d75", accent2: "#7b2dff", card: "#141428", border: "#2a2a4a", overlay: "#0a0a20", overlayAlpha: 70, fontFamily: "'Smiley Sans', 'Noto Sans SC', sans-serif", titleSize: 38, radius: 4 },
  { id: "warm-vintage",name: "暖棕复古", bg: "#1a1410", ink: "#f0e6d8", mid: "#9a8a7a", accent: "#c8956c", accent2: "#8a5a3c", card: "#2a2018", border: "#3a2e24", overlay: "#140e08", overlayAlpha: 60, fontFamily: "'LXGW WenKai', 'Noto Serif SC', serif", titleSize: 36, radius: 16 },
  { id: "mono",        name: "极简黑白", bg: "#111111", ink: "#ffffff", mid: "#888888", accent: "#e0e0e0", accent2: "#999999", card: "#1e1e1e", border: "#333333", overlay: "#000000", overlayAlpha: 65, fontFamily: "'Noto Sans SC', sans-serif", titleSize: 38, radius: 4 },
  { id: "vivid-orange",name: "活力橙",   bg: "#140e0a", ink: "#fff0e0", mid: "#b89a8a", accent: "#ff8c42", accent2: "#ff4d2d", card: "#241810", border: "#3a2a1a", overlay: "#140a05", overlayAlpha: 60, fontFamily: "'ZCOOL KuaiLe', cursive", titleSize: 36, radius: 16 },
  { id: "forest",      name: "墨绿自然", bg: "#0e1410", ink: "#e8f0e8", mid: "#7a8a7a", accent: "#7ec89a", accent2: "#3a9a6a", card: "#141e18", border: "#1e2e24", overlay: "#050f0a", overlayAlpha: 60, fontFamily: "'ZCOOL XiaoWei', 'Noto Serif SC', serif", titleSize: 36, radius: 12 },
];

let currentTheme = THEMES[0];

function renderThemeGrid() {
  const grid = $("#theme-grid");
  grid.innerHTML = "";
  THEMES.forEach((t) => {
    const thumb = document.createElement("div");
    thumb.className = "theme-thumb" + (t.id === currentTheme.id ? " active" : "");
    thumb.style.background = t.bg;
    thumb.innerHTML = `
      <div class="swatch-row">
        <div class="sw" style="background:${t.bg}"></div>
        <div class="sw" style="background:${t.ink}"></div>
        <div class="sw" style="background:${t.accent}"></div>
      </div>
      <div class="tname" style="color:${t.ink}">${t.name}</div>
    `;
    thumb.onclick = () => applyTheme(t);
    grid.appendChild(thumb);
  });
}

function applyTheme(t) {
  currentTheme = t;
  setSlot("bg", t.bg);
  setSlot("ink", t.ink);
  setSlot("mid", t.mid);
  setSlot("accent", t.accent);
  setSlot("accent2", t.accent2);
  setSlot("card", t.card);
  setSlot("border", t.border);
  setSlot("overlay", t.overlay);
  $("#slot-overlay-alpha").value = t.overlayAlpha;
  $("#slot-overlay-alpha-val").textContent = t.overlayAlpha + "%";
  $("#slot-font-family").value = t.fontFamily;
  $("#slot-title-size").value = t.titleSize;
  $("#slot-title-size-val").textContent = t.titleSize + "px";
  $("#slot-radius").value = t.radius;
  $("#slot-radius-val").textContent = t.radius + "px";
  renderThemeGrid();
  updatePreview();
}

function setSlot(key, val) {
  $(`#slot-${key}`).value = val;
  $(`#slot-${key}-text`).value = val;
}

function getSlot(key) {
  return $(`#slot-${key}`).value;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function updatePreview() {
  const bg = getSlot("bg");
  const ink = getSlot("ink");
  const mid = getSlot("mid");
  const accent = getSlot("accent");
  const accent2 = getSlot("accent2");
  const card = getSlot("card");
  const border = getSlot("border");
  const overlay = getSlot("overlay");
  const overlayAlpha = $("#slot-overlay-alpha").value / 100;
  const fontFamily = $("#slot-font-family").value;
  const titleSize = $("#slot-title-size").value;
  const radius = $("#slot-radius").value;
  const shadow = $("#slot-shadow").value / 100;
  const stroke = $("#slot-stroke").value;
  const strokeWidth = $("#slot-stroke-width").value;
  const gradientText = $("#slot-gradient-text").value;

  const pv = $("#style-preview");
  pv.style.background = bg;
  pv.style.borderRadius = radius + "px";
  pv.style.fontFamily = fontFamily;

  // 遮罩层
  $("#pv-overlay").style.background = hexToRgba(overlay, overlayAlpha);

  // 装饰背景光斑
  $("#pv-deco1").style.background = hexToRgba(accent, 0.2);
  $("#pv-deco1").style.width = "160px";
  $("#pv-deco1").style.height = "160px";
  $("#pv-deco1").style.top = "-40px";
  $("#pv-deco1").style.right = "30px";
  $("#pv-deco2").style.background = hexToRgba(accent2, 0.15);
  $("#pv-deco2").style.width = "120px";
  $("#pv-deco2").style.height = "120px";
  $("#pv-deco2").style.bottom = "80px";
  $("#pv-deco2").style.left = "-30px";

  // 装饰线
  $("#pv-line1").style.background = accent;
  $("#pv-line1").style.width = "40px";
  $("#pv-line1").style.top = "45%";
  $("#pv-line1").style.left = "20px";

  // 顶部标签
  const tag = $("#pv-hook-tag");
  tag.style.background = card;
  tag.style.color = accent;
  tag.style.border = `1px solid ${border}`;
  tag.style.borderRadius = (radius * 0.6) + "px";
  tag.style.fontFamily = fontFamily;

  $("#pv-time").style.color = mid;
  $("#pv-time").style.fontFamily = fontFamily;

  // 标题区 —— 应用阴影/描边/渐变
  const title = $("#pv-main-title");
  title.style.fontSize = (titleSize * 0.65) + "px";
  title.style.fontFamily = fontFamily;

  // 文字阴影
  if (shadow > 0) {
    title.style.textShadow = `0 ${shadow * 8}px ${shadow * 20}px rgba(0,0,0,${shadow * 0.8})`;
  } else {
    title.style.textShadow = "none";
  }

  // 文字描边
  if (strokeWidth > 0) {
    title.style.webkitTextStroke = `${strokeWidth}px ${stroke}`;
  } else {
    title.style.webkitTextStroke = "none";
  }

  // 渐变文字
  if (gradientText === "accent") {
    title.style.backgroundImage = `linear-gradient(135deg, ${accent}, ${accent2})`;
    title.style.webkitBackgroundClip = "text";
    title.style.webkitTextFillColor = "transparent";
    title.style.color = "transparent";
  } else if (gradientText === "ink") {
    title.style.backgroundImage = `linear-gradient(135deg, ${ink}, ${mid})`;
    title.style.webkitBackgroundClip = "text";
    title.style.webkitTextFillColor = "transparent";
    title.style.color = "transparent";
  } else {
    title.style.color = ink;
    title.style.backgroundImage = "none";
    title.style.webkitTextFillColor = ink;
  }

  $("#pv-sub-title").style.color = mid;
  $("#pv-sub-title").style.fontFamily = fontFamily;
  $("#pv-highlight").style.background = hexToRgba(accent, 0.2);
  $("#pv-highlight").style.color = accent;
  $("#pv-highlight").style.fontFamily = fontFamily;

  // 进度条
  const bar = $("#pv-progress-bar");
  bar.style.background = hexToRgba(mid, 0.2);
  bar.style.borderRadius = (radius * 0.3) + "px";
  $("#pv-progress-fill").style.background = `linear-gradient(90deg, ${accent}, ${accent2})`;

  // CTA 按钮
  const cta = $("#pv-cta-main");
  cta.style.background = `linear-gradient(135deg, ${accent}, ${accent2})`;
  cta.style.color = "#fff";
  cta.style.borderRadius = (radius * 0.8) + "px";
  cta.style.fontFamily = fontFamily;
  $("#pv-cta-secondary").style.color = mid;
  $("#pv-cta-secondary").style.border = `1px solid ${border}`;
  $("#pv-cta-secondary").style.borderRadius = (radius * 0.8) + "px";
  $("#pv-cta-secondary").style.fontFamily = fontFamily;

  // 右侧字体展示 —— 也应用效果


}

// 取色器联动
["bg", "ink", "mid", "accent", "accent2", "card", "border", "overlay"].forEach((key) => {
  $(`#slot-${key}`).oninput = () => {
    $(`#slot-${key}-text`).value = $(`#slot-${key}`).value;
    updatePreview();
  };
  $(`#slot-${key}-text`).onchange = () => {
    const v = $(`#slot-${key}-text`).value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      $(`#slot-${key}`).value = v;
      updatePreview();
    }
  };
});

// 滑块联动
$("#slot-overlay-alpha").oninput = () => {
  $("#slot-overlay-alpha-val").textContent = $("#slot-overlay-alpha").value + "%";
  updatePreview();
};
$("#slot-title-size").oninput = () => {
  $("#slot-title-size-val").textContent = $("#slot-title-size").value + "px";
  updatePreview();
};
$("#slot-radius").oninput = () => {
  $("#slot-radius-val").textContent = $("#slot-radius").value + "px";
  updatePreview();
};
$("#slot-font-family").onchange = updatePreview;
$("#slot-shadow").oninput = () => {
  $("#slot-shadow-val").textContent = $("#slot-shadow").value + "%";
  updatePreview();
};
$("#slot-stroke").oninput = updatePreview;
$("#slot-stroke-width").oninput = () => {
  $("#slot-stroke-width-val").textContent = $("#slot-stroke-width").value + "px";
  updatePreview();
};
$("#slot-gradient-text").onchange = updatePreview;

// 保存自定义主题
$("#save-theme").onclick = () => {
  const custom = {
    id: "custom-" + Date.now(),
    name: "我的主题",
    bg: getSlot("bg"),
    ink: getSlot("ink"),
    mid: getSlot("mid"),
    accent: getSlot("accent"),
    accent2: getSlot("accent2"),
    card: getSlot("card"),
    border: getSlot("border"),
    overlay: getSlot("overlay"),
    overlayAlpha: parseInt($("#slot-overlay-alpha").value),
    fontFamily: $("#slot-font-family").value,
    titleSize: parseInt($("#slot-title-size").value),
    radius: parseInt($("#slot-radius").value),
  };
  const saved = JSON.parse(localStorage.getItem("sc-themes") || "[]");
  saved.push(custom);
  localStorage.setItem("sc-themes", JSON.stringify(saved));
  THEMES.push(custom);
  renderThemeGrid();
  showToast("主题已保存 ✓");
};

// 重置
$("#reset-theme").onclick = () => applyTheme(currentTheme);

// 初始化风格模块
renderThemeGrid();
updatePreview();

// 初始化：先绑定静态按钮事件，再拉取任务状态
bindButtons();
refresh();
loadMaterials();
setInterval(refresh, 2500);

// 高级工具折叠
(function() {
  const t = document.getElementById('advanced-toggle');
  if (t) {
    t.onclick = () => {
      const body = document.getElementById('advanced-body');
      const arrow = document.getElementById('advanced-arrow');
      body.style.display = body.style.display === 'none' ? '' : 'none';
      arrow.textContent = body.style.display === 'none' ? '▶' : '▼';
    };
  }
})();

// ===== 素材库浏览 =====
const libState = { page: 0, limit: 24, total: 0, selectedTags: new Set() };

async function loadLibTags() {
  try {
    const r = await fetch("/api/library/tags");
    const j = await r.json();
    $("#lib-desc").textContent = `共 ${j.total} 个镜头 · 点击标签筛选`;
    const wrap = $("#lib-tags");
    wrap.innerHTML = "";
    const entries = Object.entries(j.tags);
    // 只显示 TOP 20，其余折叠
    const top = entries.slice(0, 20);
    const rest = entries.slice(20);
    for (const [tag, count] of top) {
      const btn = makeTagBtn(tag, count);
      wrap.appendChild(btn);
    }
    if (rest.length) {
      const more = document.createElement("button");
      more.textContent = `+${rest.length} 更多`;
      more.style.cssText = "padding:4px 10px;border-radius:16px;background:#1a1e26;color:#f59e0b;border:1px dashed #f59e0b66;cursor:pointer;font-size:11.5px;font-family:inherit";
      more.onclick = () => {
        wrap.innerHTML = "";
        for (const [tag, count] of entries) {
          wrap.appendChild(makeTagBtn(tag, count));
        }
      };
      wrap.appendChild(more);
    }
  } catch (e) { console.error(e); }
}

function makeTagBtn(tag, count) {
  const btn = document.createElement("button");
  btn.textContent = `${tag} (${count})`;
  btn.style.cssText = "padding:4px 10px;border-radius:16px;background:#232833;color:#8b93a3;border:1px solid #3b4252;cursor:pointer;font-size:11.5px;font-family:inherit";
  btn.onclick = () => {
    if (libState.selectedTags.has(tag)) {
      libState.selectedTags.delete(tag);
      btn.style.background = "#232833"; btn.style.color = "#8b93a3";
    } else {
      libState.selectedTags.add(tag);
      btn.style.background = "#f59e0b33"; btn.style.color = "#f59e0b";
      btn.style.borderColor = "#f59e0b66";
    }
    libState.page = 0;
    loadLibList();
  };
  return btn;
}

async function loadLibList() {
  const tags = [...libState.selectedTags].join(",");
  const off = libState.page * libState.limit;
  try {
    const r = await fetch(`/api/library/list?tags=${encodeURIComponent(tags)}&offset=${off}&limit=${libState.limit}`);
    const j = await r.json();
    libState.total = j.total;
    const grid = $("#lib-grid");
    grid.innerHTML = "";
    j.items.forEach((item, i) => {
      const card = document.createElement("div");
      card.style.cssText = "border-radius:10px;overflow:hidden;background:#0d0f13;border:1px solid #2a2e38;cursor:pointer;transition:all .15s";
      const thumbUrl = "/api/library/thumb?path=" + encodeURIComponent(item.path);
      const videoUrl = "/api/library/video?path=" + encodeURIComponent(item.path);
      card.innerHTML = `
        <div style="position:relative;aspect-ratio:16/9;overflow:hidden">
          <img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;background:#000" loading="lazy">
          <div style="position:absolute;bottom:4px;right:4px;background:#000a;color:#fff;font-size:10px;padding:1px 6px;border-radius:4px">${item.duration_sec}s</div>
        </div>
        <div style="padding:6px 8px;font-size:10.5px;color:#8b93a3;line-height:1.4">
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px">${item.path.split(/[\\/]/).pop()}</div>
          <div style="display:flex;flex-wrap:wrap;gap:2px">${item.tags.slice(0,4).map(t => `<span style="background:#232833;padding:1px 5px;border-radius:8px;font-size:9.5px">${t}</span>`).join("")}</div>
        </div>
      `;
      card.onmouseenter = () => { card.style.borderColor = "#f59e0b"; };
      card.onmouseleave = () => { card.style.borderColor = "#2a2e38"; };
      card.onclick = () => {
        const modal = document.getElementById('lib-modal');
        const mc = document.getElementById('lib-modal-content');
        const mi = document.getElementById('lib-modal-info');
        mc.innerHTML = `<video src="${videoUrl}" controls autoplay style="max-width:90vw;max-height:82vh;border-radius:8px"></video>`;
        mi.innerHTML = `<b style="color:#e6e9ef">${item.path.split(/[\\/]/).pop()}</b><br>${item.duration_sec}s · ${item.width}×${item.height}<br>${item.tags.join(" · ")}`;
        modal.style.display = 'flex';
      };
      grid.appendChild(card);
    });
    const pages = Math.ceil(libState.total / libState.limit) || 1;
    $("#lib-page").textContent = `${libState.page + 1} / ${pages}`;
  } catch (e) { console.error(e); }
}

$("#lib-prev").onclick = () => { if (libState.page > 0) { libState.page--; loadLibList(); } };
$("#lib-next").onclick = () => {
  const pages = Math.ceil(libState.total / libState.limit);
  if (libState.page < pages - 1) { libState.page++; loadLibList(); }
};

loadLibTags();
loadLibList();

