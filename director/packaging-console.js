// 视频外包装控制台前端：与主台工作台同一交互骨架（步骤导航 + ?embed=1 内嵌）。
// 仅依赖同源 API（packaging-server.mjs 独立端口或 console-server.mjs 主台均提供同一实现）。
'use strict';

const $ = id => document.getElementById(id);
const state = {video:null, runId:null, frames:[], selectedTime:null,
  aiConfigured:false, selectedGalleryId:null, ratio:'16:9', coverSource:'frame'};

// ===== 步骤导航与内嵌模式 =====

function showStep(name) {
  document.querySelectorAll('.step').forEach(step => step.classList.toggle('active', step.dataset.go === name));
  document.querySelectorAll('.panel').forEach(panel => {
    panel.hidden = panel.id !== `panel-${name}`;
    panel.classList.toggle('active', panel.id === `panel-${name}`);
  });
}

if (new URLSearchParams(location.search).get('embed') === '1') {
  document.documentElement.classList.add('embedded');
}

async function api(path, body) {
  const options = body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)};
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({ok:false, error:`HTTP ${response.status}`}));
  if (!payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function pollTask(taskId, statusLine) {
  for (;;) {
    const task = await api(`/api/packaging/task?id=${encodeURIComponent(taskId)}`);
    if (statusLine) statusLine.textContent = task.log?.at(-1) || task.status;
    if (task.status === 'done') return task.result;
    if (task.status === 'error') throw new Error(task.error || '任务失败');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

function updateAiButtons() {
  $('btn-ai-cover').disabled = !(state.aiConfigured
    && ($('ai-prompt').value.trim() || state.selectedGalleryId));
  $('btn-ai-reverse').disabled = !(state.aiConfigured && state.runId && state.selectedTime !== null);
}

function setSourceState(text, blocked = false) {
  $('source-state').textContent = text;
  $('source-state').classList.toggle('blocked', blocked);
}

// ===== 01 选择视频与画面帧 =====

function renderFrames(frames) {
  const grid = $('frames-grid');
  grid.innerHTML = '';
  if (!frames.length) {
    grid.innerHTML = '<p class="field-note">无候选帧</p>';
    return;
  }
  for (const frame of frames) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'frame';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = frame.url;
    img.alt = `${frame.time}s`;
    const badge = document.createElement('span');
    badge.className = 'time';
    badge.textContent = `${frame.time.toFixed(1)}s`;
    cell.append(img, badge);
    cell.addEventListener('click', () => {
      state.selectedTime = frame.time;
      grid.querySelectorAll('.frame').forEach(node => node.classList.remove('selected'));
      cell.classList.add('selected');
      setSourceState(`已选 ${frame.time.toFixed(1)}s 帧`);
      updateAiButtons();
    });
    grid.appendChild(cell);
  }
}

function showDoneCard(latest) {
  state.video = latest.video.path;
  state.runId = null;
  state.selectedTime = null;
  const card = $('latest-card');
  card.innerHTML = '';
  const cover = document.createElement('img');
  cover.className = 'latest-cover';
  cover.src = latest.latestCover.url;
  cover.alt = '已有封面';
  const text = document.createElement('div');
  text.className = 'latest-text';
  const strong = document.createElement('strong');
  strong.textContent = `${latest.video.name}（${latest.video.modified} 渲染）`;
  const note = document.createElement('p');
  note.className = 'field-note';
  note.textContent = '该成片已生成过封面，无需重做。';
  text.append(strong, note);
  const redo = document.createElement('button');
  redo.type = 'button';
  redo.className = 'button secondary';
  redo.textContent = '重做封面';
  redo.addEventListener('click', () => detectLatest({force:true}));
  card.append(cover, text, redo);
  $('frames-grid').innerHTML = '<p class="field-note">该成片已就绪，无需重新抽帧。</p>';
  setSourceState('已做过封面，跳过');
  updateAiButtons();
}

function applyPrepare(prep) {
  state.video = prep.video;
  state.runId = prep.runId;
  state.frames = prep.frames || [];
  state.selectedTime = null;
  const card = $('latest-card');
  card.innerHTML = '';
  const strong = document.createElement('strong');
  const name = String(prep.video || '').split(/[\\/]/).pop();
  strong.textContent = `${name}${prep.reused ? ' · 复用已抽帧' : ' · 已抽 6 帧'}`;
  card.appendChild(strong);
  renderFrames(state.frames);
  setSourceState('就绪，请选一帧');
  updateAiButtons();
}

async function detectLatest({force = false} = {}) {
  const card = $('latest-card');
  card.innerHTML = '<p class="field-note">检测中…</p>';
  setSourceState('检测中…');
  try {
    const latest = await api('/api/packaging/latest');
    if (!latest.video) {
      card.innerHTML = '<p class="field-note">未发现成片视频：template/out 与 b-mode-runs 均为空，先渲染一条成片再来。</p>';
      setSourceState('无成片', true);
      return;
    }
    if (latest.done && !force) { showDoneCard(latest); return; }
    const prep = await api('/api/packaging/prepare',
      force ? {force:true, video:latest.video.path} : {});
    applyPrepare(prep);
  } catch (error) {
    card.innerHTML = `<p class="field-note">检测失败：${error.message}</p>`;
    setSourceState('失败', true);
  }
}

async function useVideoPath() {
  const videoPath = $('video-path').value.trim();
  if (!videoPath) return;
  setSourceState('检测中…');
  try {
    const prep = await api('/api/packaging/prepare', {video:videoPath});
    if (prep.done) {
      showDoneCard({video:{path:prep.video, modified:''}, latestCover:prep.latestCover});
      return;
    }
    applyPrepare(prep);
  } catch (error) {
    $('latest-card').innerHTML = `<p class="field-note">失败：${error.message}</p>`;
    setSourceState('失败', true);
  }
}

// ===== 02 风格模板与 AI 封面 =====

function setCoverSource(source) {
  state.coverSource = source;
  document.querySelectorAll('#cover-source button').forEach(node => {
    node.classList.toggle('selected', node.dataset.source === source);
  });
  $('script-block').hidden = source !== 'script';
  // 提示词默认隐藏，只在实际检查时展开；文案模式下由系统自动填充
  $('prompt-details').open = source !== 'script';
  $('prompt-summary-note').textContent = source === 'script'
    ? '由文案自动生成，默认隐藏；展开检查或编辑'
    : '选模板自动填入；点击展开检查或编辑';
  if (source === 'script' && state.video && !$('script-text').value.trim()) loadRunScript();
  updateAiButtons();
}

async function loadRunScript() {
  const status = $('script-status');
  try {
    const data = await api(`/api/packaging/script?video=${encodeURIComponent(state.video)}`);
    if (data.text) {
      $('script-text').value = data.text;
      status.textContent = `已自动读取成片文案（${data.source} · ${data.text.length} 字），内部使用不展示`;
    } else {
      status.textContent = '该成片未关联文案，展开下方面板手动粘贴';
      $('script-details').open = true;
    }
  } catch (error) {
    status.textContent = `读取文案失败：${error.message}`;
    $('script-details').open = true;
  }
}

async function generateScriptPrompt() {
  const status = $('script-status');
  if (!state.aiConfigured) { status.textContent = '未配置 OPENAI_API_KEY'; return; }
  const text = $('script-text').value.trim();
  if (!text) { status.textContent = '没有可提炼的文案'; return; }
  status.textContent = '提炼中…';
  try {
    const started = await api('/api/packaging/ai/script-prompt', {
      video:state.video || undefined, text,
    });
    const result = await pollTask(started.taskId, line => { status.textContent = line; });
    $('ai-prompt').value = result.prompt;
    status.textContent = `核心观点：${result.viewpoint || '（未给出）'}${result.title ? ` · 建议标题：${result.title}` : ''}`;
    updateAiButtons();
  } catch (error) {
    status.textContent = `失败：${error.message}`;
  }
}

async function loadGallery() {
  const select = $('gallery-category');
  const list = $('gallery-list');
  try {
    const data = await api('/api/packaging/gallery');
    if (!data.available) {
      select.innerHTML = '<option value="">不可用</option>';
      list.innerHTML = `<p class="field-note">${data.hint}</p>`;
      return;
    }
    select.innerHTML = '';
    const recommended = document.createElement('option');
    recommended.value = 'cover-fit';
    recommended.textContent = `★ 封面推荐（${data.coverTotal} 条）`;
    select.appendChild(recommended);
    const coverGroup = document.createElement('optgroup');
    coverGroup.label = '封面适用';
    const otherGroup = document.createElement('optgroup');
    otherGroup.label = '其他分类（图表 / UI / 论文等）';
    for (const category of data.categories) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = `${category.label}（${category.count}）`;
      (category.coverFit ? coverGroup : otherGroup).appendChild(option);
    }
    if (coverGroup.children.length) select.appendChild(coverGroup);
    if (otherGroup.children.length) select.appendChild(otherGroup);
    await renderGalleryEntries('cover-fit');
  } catch (error) {
    list.innerHTML = `<p class="field-note">图库加载失败：${error.message}</p>`;
  }
}

async function renderGalleryEntries(categoryId) {
  const list = $('gallery-list');
  list.innerHTML = '<p class="field-note">加载条目…</p>';
  try {
    const data = await api(`/api/packaging/gallery/entries${categoryId ? `?category=${encodeURIComponent(categoryId)}` : ''}`);
    list.innerHTML = '';
    if (!data.entries.length) {
      list.innerHTML = '<p class="field-note">该分类暂无条目</p>';
      return;
    }
    for (const entry of data.entries) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'gitem';
      cell.dataset.id = entry.id;
      if (entry.imageUrl) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = entry.title;
        img.src = entry.imageUrl;
        cell.appendChild(img);
      }
      const title = document.createElement('span');
      title.className = 'gtitle';
      title.textContent = `No.${entry.no} ${entry.title}`;
      const size = document.createElement('span');
      size.className = 'gsize';
      size.textContent = entry.sizeToken || entry.literalSize || '';
      cell.append(title, size);
      cell.addEventListener('click', () => useGalleryTemplate(entry.id, cell));
      list.appendChild(cell);
    }
  } catch (error) {
    list.innerHTML = `<p class="field-note">加载失败：${error.message}</p>`;
  }
}

async function useGalleryTemplate(entryId, cell) {
  const status = $('gallery-selected');
  try {
    const {entry} = await api(`/api/packaging/gallery/entry?id=${encodeURIComponent(entryId)}`);
    $('ai-prompt').value = entry.prompt;
    state.selectedGalleryId = entry.id;
    document.querySelectorAll('.gallery .gitem').forEach(node => node.classList.remove('selected'));
    cell.classList.add('selected');
    status.textContent = `已选模板：No.${entry.no} ${entry.title}（${entry.category}）· `;
    const clear = document.createElement('a');
    clear.href = '#';
    clear.textContent = '清除模板';
    clear.addEventListener('click', event => {
      event.preventDefault();
      state.selectedGalleryId = null;
      document.querySelectorAll('.gallery .gitem').forEach(node => node.classList.remove('selected'));
      status.textContent = '未选择模板（也可以直接自由填写提示词）';
      updateAiButtons();
    });
    status.appendChild(clear);
    updateAiButtons();
  } catch (error) {
    status.textContent = `模板加载失败：${error.message}`;
  }
}

function setAiState(text, blocked = false) {
  $('ai-state').textContent = text;
  $('ai-state').classList.toggle('blocked', blocked);
}

async function loadAiConfig() {
  const chip = $('ai-chip');
  const status = $('ai-config-status');
  try {
    const config = await api('/api/packaging/ai/config');
    state.aiConfigured = config.configured;
    chip.textContent = config.configured ? `AI 已配置 · ${config.imageModel}` : 'AI 未配置';
    $('ai-dot').classList.toggle('waiting', !config.configured);
    status.textContent = config.configured
      ? `Base URL：${config.baseUrl}${config.galleryAvailable ? '' : ' · 图库未克隆'}`
      : '填写 API Key 并保存即可启用 AI 封面与 AI 标题';
    setAiState(config.configured ? '已就绪' : '未配置', !config.configured);
    const select = $('ai-model-select');
    select.innerHTML = '';
    const models = config.models || [];
    for (const model of models) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.label;
      select.appendChild(option);
    }
    if (config.imageModel && !models.some(model => model.id === config.imageModel)) {
      const option = document.createElement('option');
      option.value = config.imageModel;
      option.textContent = config.imageModel;
      select.appendChild(option);
    }
    select.value = config.imageModel || 'gpt-image-2.5-flare';
    if (!$('ai-base-url').value) $('ai-base-url').value = config.baseUrl === 'https://api.openai.com/v1' ? '' : config.baseUrl;
    updateAiButtons();
  } catch (error) {
    setAiState('读取失败', true);
    status.textContent = `读取配置失败：${error.message}`;
  }
}

async function saveAiConfig() {
  const status = $('ai-config-status');
  status.textContent = '保存中…';
  try {
    const config = await api('/api/packaging/ai/config', {
      openaiApiKey:$('ai-key').value.trim() || undefined,
      openaiBaseUrl:$('ai-base-url').value.trim() || undefined,
      openaiImageModel:$('ai-model-select').value || undefined,
    });
    $('ai-key').value = '';
    state.aiConfigured = config.configured;
    $('ai-chip').textContent = config.configured ? `AI 已配置 · ${config.imageModel}` : 'AI 未配置';
    $('ai-dot').classList.toggle('waiting', !config.configured);
    status.textContent = `已保存到 ${config.configPath || '本机配置文件'}`;
    setAiState(config.configured ? '已就绪' : '未配置', !config.configured);
    updateAiButtons();
  } catch (error) {
    status.textContent = `保存失败：${error.message}`;
  }
}

async function generateAiCover() {
  const status = $('ai-status-line');
  if (!state.aiConfigured) { status.textContent = '未配置 OPENAI_API_KEY'; return; }
  const prompt = $('ai-prompt').value.trim();
  if (!prompt && !state.selectedGalleryId) { status.textContent = '请填写提示词或选择图库模板'; return; }
  const useFrame = state.coverSource === 'frame' && Boolean(state.runId);
  status.textContent = '提交任务…';
  try {
    const started = await api('/api/packaging/ai/cover', {
      runId:state.runId, time:state.selectedTime, prompt,
      galleryId:state.selectedGalleryId || undefined,
      quality:$('ai-quality').value, model:$('ai-model-select').value || undefined,
      ratio:state.ratio, useFrame,
    });
    const result = await pollTask(started.taskId, line => { status.textContent = line; });
    const img = $('ai-result-img');
    img.src = result.url;
    img.hidden = false;
    $('ai-result-meta').textContent = `${result.model} · ${result.quality} · ${result.size}`
      + (result.template ? ` · 模板：${result.template}` : '') + ` · ${result.file}`;
    setAiState('AI 封面完成');
    status.textContent = '完成';
  } catch (error) {
    setAiState('生成失败', true);
    status.textContent = `失败：${error.message}`;
  }
}

async function reversePrompt() {
  const status = $('ai-status-line');
  if (!state.aiConfigured) { status.textContent = '未配置 OPENAI_API_KEY'; return; }
  if (!state.runId || state.selectedTime === null) { status.textContent = '请先在步骤 01 抽帧并选中一帧'; return; }
  status.textContent = '反推中…';
  try {
    const started = await api('/api/packaging/ai/reverse', {runId:state.runId, time:state.selectedTime});
    const result = await pollTask(started.taskId, line => { status.textContent = line; });
    $('ai-prompt').value = result.prompt
      + (result.negativePrompt ? `\n\nNegative prompt: ${result.negativePrompt}` : '');
    status.textContent = `反推完成（${result.medium || '媒介未知'}），已填入提示词`;
  } catch (error) {
    status.textContent = `失败：${error.message}`;
  }
}

// ===== 03 标题文案 =====

function renderTitles(titles) {
  const list = $('titles-list');
  list.innerHTML = '';
  for (const item of titles) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = item.text;
    const pattern = document.createElement('span');
    pattern.className = 'pattern';
    pattern.textContent = item.pattern;
    const len = document.createElement('span');
    len.className = item.fitsLimit ? 'len' : 'len over';
    len.textContent = `${item.length} 字${item.fitsLimit ? '' : '（超限）'}`;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'button secondary';
    copy.textContent = '复制';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(item.text); copy.textContent = '已复制'; }
      catch { copy.textContent = item.text; }
      setTimeout(() => { copy.textContent = '复制'; }, 1500);
    });
    li.append(text, pattern, len, copy);
    list.appendChild(li);
  }
}

async function generateTitlesRule() {
  const status = $('titles-status');
  status.textContent = '生成中…';
  try {
    const result = await api('/api/packaging/titles', {
      topic:$('topic').value.trim(), platform:$('platform').value, count:8,
    });
    renderTitles(result.titles);
    status.textContent = `规则生成 ${result.titles.length} 条`;
  } catch (error) {
    status.textContent = `失败：${error.message}`;
  }
}

async function generateTitlesAi() {
  const status = $('titles-status');
  if (!state.aiConfigured) {
    status.textContent = '未配置 OPENAI_API_KEY，先在步骤 03 保存配置';
    return;
  }
  status.textContent = 'AI 生成中…';
  try {
    const started = await api('/api/packaging/ai/titles', {
      topic:$('topic').value.trim(), platform:$('platform').value, count:8,
    });
    const result = await pollTask(started.taskId, line => { status.textContent = line; });
    renderTitles(result.titles);
    status.textContent = `AI 生成 ${result.titles.length} 条`;
  } catch (error) {
    status.textContent = `失败：${error.message}`;
  }
}

// ===== 初始化 =====

function wire() {
  document.querySelectorAll('.step').forEach(step => {
    step.addEventListener('click', () => showStep(step.dataset.go));
  });
  $('btn-recheck').addEventListener('click', () => detectLatest());
  $('btn-use-path').addEventListener('click', useVideoPath);
  $('btn-titles').addEventListener('click', generateTitlesRule);
  $('btn-ai-titles').addEventListener('click', generateTitlesAi);
  $('btn-ai-save').addEventListener('click', saveAiConfig);
  $('btn-ai-cover').addEventListener('click', generateAiCover);
  $('btn-ai-reverse').addEventListener('click', reversePrompt);
  $('btn-gallery-refresh').addEventListener('click', loadGallery);
  $('btn-script-prompt').addEventListener('click', generateScriptPrompt);
  document.querySelectorAll('#cover-source button').forEach(button => {
    button.addEventListener('click', () => setCoverSource(button.dataset.source));
  });
  $('gallery-category').addEventListener('change', () => renderGalleryEntries($('gallery-category').value));
  $('ai-prompt').addEventListener('input', updateAiButtons);
  document.querySelectorAll('#ratio-segmented button').forEach(button => {
    button.addEventListener('click', () => {
      state.ratio = button.dataset.ratio;
      document.querySelectorAll('#ratio-segmented button').forEach(node => node.classList.remove('selected'));
      button.classList.add('selected');
    });
  });
}

// ===== 主台外观主题同步（黑色 / 白色） =====
// 与 console-ui.html 共用同一 localStorage key 与变量族（--ui-*）；
// 初始读 localStorage，主台切换时经 postMessage 即时通知，另加轮询兜底。
const UI_APPEARANCE_KEY = 'shotcraft-ui-appearance';

function applyUiTheme(mode) {
  document.documentElement.dataset.uiTheme = mode === 'light' ? 'light' : 'dark';
}

function currentUiTheme() {
  try { return localStorage.getItem(UI_APPEARANCE_KEY) || 'dark'; } catch { return 'dark'; }
}

function initUiThemeSync() {
  applyUiTheme(currentUiTheme());
  window.addEventListener('message', event => {
    if (event.data && event.data.type === 'sc-ui-appearance') applyUiTheme(event.data.mode);
  });
  window.addEventListener('storage', event => {
    if (event.key === UI_APPEARANCE_KEY) applyUiTheme(event.newValue);
  });
  setInterval(() => {
    if (document.documentElement.dataset.uiTheme !== currentUiTheme()) applyUiTheme(currentUiTheme());
  }, 2000);
  // 独立运行时的本地切换（内嵌模式下隐藏，由主台权威控制）
  const toggle = document.getElementById('ui-toggle');
  if (toggle && !document.documentElement.classList.contains('embedded')) {
    const reflect = () => {
      toggle.querySelectorAll('button').forEach(button => {
        button.classList.toggle('selected', (button.dataset.ui === 'light') === (document.documentElement.dataset.uiTheme === 'light'));
      });
    };
    reflect();
    toggle.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => {
        applyUiTheme(button.dataset.ui);
        try { localStorage.setItem(UI_APPEARANCE_KEY, button.dataset.ui); } catch {}
        reflect();
      });
    });
    setInterval(reflect, 2000);
  }
}

async function init() {
  initUiThemeSync();
  wire();
  await detectLatest();
  await loadAiConfig();
  await loadGallery();
}

init();
