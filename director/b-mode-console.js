const STORAGE_KEY = 'shotcraft-b-workspace-v1';
const BACKUP_KEY = 'shotcraft-b-before-acceptance-v1';
const SUBJECT_LABELS = {
  pending: '待确定',
  person: '数字人口播',
  graphics: '图解 / 文字',
  material: '素材画面',
};
const $ = (selector) => document.querySelector(selector);

function freshDraft() {
  return {script: '', voiceMode: 'standard', voice: 'zh-CN-YunxiNeural', background: 'keep',
    speakerId: '', tts2SpeakerId: '', speechRate:0,
    backgroundVideoPath: null, backgroundVideoMeta: null, renderMode: 'placeholder', scenes: [], planSource: '', approved: false};
}

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved.script !== 'string') return freshDraft();
    const restored = {...freshDraft(), ...saved};
    restored.voiceMode = saved.voiceMode === 'clone' || saved.voiceMode === 'volcengine-clone' ? 'clone' : saved.voiceMode === 'volcengine-tts2' ? 'volcengine-tts2' : 'standard';
    restored.speakerId = typeof saved.speakerId === 'string' ? saved.speakerId.trim() : '';
    restored.tts2SpeakerId = typeof saved.tts2SpeakerId === 'string' ? saved.tts2SpeakerId.trim() : '';
    restored.speechRate = Number.isInteger(saved.speechRate) && saved.speechRate >= -15 && saved.speechRate <= 15 ? saved.speechRate : 0;
    restored.scenes = Array.isArray(saved.scenes) ? saved.scenes.filter(scene => scene && typeof scene.text === 'string' && SUBJECT_LABELS[scene.subject]) : [];
    restored.approved = saved.approved === true;
    restored.renderMode = ['runninghub', 'runninghub-combined'].includes(saved.renderMode) ? saved.renderMode : 'placeholder';
    return restored;
  } catch {
    return freshDraft();
  }
}

const draft = loadDraft();
let roleFile = null;
let roleFiles = [];
let cloneFile = null;
let roleUrl = null;
let cloneUrl = null;
let feedbackTimer = null;
let placeholderRunning = false;
let digitalHumanRunning = false;
let digitalHumanConfigured = false;
let volcengineConfigured = false;
let backgroundSearchTimer = null;

// 编导台内嵌在主台时，跟随主台当前视频主题；独立打开时仍使用本地默认主题。
const VIDEO_THEME_KEY = 'shotcraft-current-video-theme';
function hexToRgba(hex, alpha) {
  const m = /^#?([\da-f]{6})$/i.exec(String(hex || ''));
  if (!m) return `rgba(17,107,89,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}
function applyVideoTheme(theme) {
  if (!theme || typeof theme !== 'object') return;
  const root = document.documentElement;
  const page = theme.bg || '#f3f5f2';
  const surface = theme.card || page;
  const ink = theme.ink || '#1f2929';
  const muted = theme.mid || '#60706e';
  const line = theme.border || '#d9e1db';
  const accent = theme.accent || '#116b59';
  const accent2 = theme.accent2 || '#ac5839';
  root.style.setProperty('--page', page);
  root.style.setProperty('--surface', surface);
  root.style.setProperty('--ink', ink);
  root.style.setProperty('--muted', muted);
  root.style.setProperty('--line', line);
  root.style.setProperty('--green', accent);
  root.style.setProperty('--green-soft', hexToRgba(accent, .16));
  root.style.setProperty('--rust', accent2);
  root.style.setProperty('--rust-soft', hexToRgba(accent2, .14));
  root.style.setProperty('--blue', accent2);
  root.style.setProperty('--nav', page);
  try { localStorage.setItem(VIDEO_THEME_KEY, JSON.stringify(theme)); } catch {}
}
try {
  const savedTheme = JSON.parse(localStorage.getItem(VIDEO_THEME_KEY) || 'null');
  if (savedTheme) applyVideoTheme(savedTheme);
} catch {}
let talkcraftRunId = localStorage.getItem('shotcraft-b-talkcraft-run') || null;
let talkcraftBusy = false;
let pendingDirectorStart = false;

function saveDraft() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); } catch { notify('浏览器无法保存草稿，请导出方案 JSON'); }
  $('#draft-state').textContent = '已存本地草稿';
}

function notify(message) {
  const feedback = $('#feedback');
  feedback.textContent = message;
  feedback.classList.add('show');
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => feedback.classList.remove('show'), 3600);
}

function go(step) {
  if (step !== 'inputs') pendingDirectorStart = false;
  document.querySelectorAll('.panel').forEach((panel) => {
    const active = panel.id === `panel-${step}`;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  document.querySelectorAll('.step').forEach((button) => {
    const active = button.dataset.step === step;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  if (step === 'plan') renderPlan();
  if (step === 'generate') renderReview();
  window.scrollTo({top: 0, behavior: 'instant'});
  reportHeight();
}

function reportHeight() {
  if (!document.documentElement.classList.contains('embedded')) return;
  window.parent.postMessage({type: 'shotcraft-b-height', height: document.documentElement.scrollHeight}, location.origin);
}

function setRole(input) {
  const files = (Array.isArray(input) ? input : [input]).filter(Boolean);
  if (files.length > 8 || files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 7 * 1024 * 1024)) {
    $('#role-file').value = '';
    notify('角色图需为 1–8 张 PNG、JPG 或 WebP，且每张不超过 7 MB');
    return;
  }
  if (roleUrl) URL.revokeObjectURL(roleUrl);
  roleFiles = files;
  roleFile = files[0] || null;
  roleUrl = roleFile ? URL.createObjectURL(roleFile) : null;
  $('#role-image').hidden = !roleFile;
  $('#role-empty').hidden = !!roleFile;
  $('#remove-role').hidden = !roleFile;
  if (roleUrl) $('#role-image').src = roleUrl;
  else $('#role-image').removeAttribute('src');
  $('#role-name').textContent = roleFile ? `${files.length} 张角色图 · 首张 ${roleFile.name}` : 'PNG、JPG 或 WebP，最多 8 张，每张 7 MB';
  if (!roleFile) $('#role-file').value = '';
  draft.approved = false;
  renderReview();
  if (roleFile && pendingDirectorStart) queueMicrotask(() => startTalkcraft());
}

function setClone(file) {
  if (file && (file.size > 10 * 1024 * 1024 || !/\.(wav|mp3|ogg|m4a|aac)$/i.test(file.name))) {
    $('#clone-file').value = '';
    notify('音色样本需为 WAV、MP3、OGG、M4A 或 AAC，且不超过 10 MB');
    return;
  }
  if (cloneUrl) URL.revokeObjectURL(cloneUrl);
  cloneFile = file || null;
  cloneUrl = file ? URL.createObjectURL(file) : null;
  $('#clone-preview').hidden = !file;
  $('#remove-clone').hidden = !file;
  if (cloneUrl) $('#clone-preview').src = cloneUrl;
  else $('#clone-preview').removeAttribute('src');
  $('#clone-name').textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : '仅用于训练音色，最大 10 MB';
  if (!file) $('#clone-file').value = '';
  draft.approved = false;
  renderReview();
}

function setVoiceMode(mode, initial = false) {
  const changed = draft.voiceMode !== mode;
  draft.voiceMode = mode;
  document.querySelectorAll('[data-voice-mode]').forEach((button) => {
    const active = button.dataset.voiceMode === mode;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#standard-voice-fields').hidden = mode !== 'standard';
  $('#clone-voice-fields').hidden = mode !== 'clone';
  $('#tts2-voice-fields').hidden = mode !== 'volcengine-tts2';
  if (!initial) {
    if (changed) draft.approved = false;
    saveDraft();
  }
  renderReview();
}
function selectedVoiceMode() {
  return draft.voiceMode === 'clone' ? 'volcengine-clone' : draft.voiceMode;
}
function selectedSpeakerId() {
  return draft.voiceMode === 'volcengine-tts2' ? draft.tts2SpeakerId : draft.speakerId;
}

function setCloneStatus(message, state = 'waiting') {
  const box = $('#clone-status');
  if (!box) return;
  box.replaceChildren();
  const dot = document.createElement('span');
  dot.className = `status-dot ${state}`;
  box.append(dot, document.createTextNode(message));
}

async function trainCloneVoice() {
  if (!cloneFile) { notify('请先选择声音样本'); return; }
  const speakerId = $('#clone-speaker-id').value.trim();
  if (!/^[A-Za-z0-9_-]{2,128}$/u.test(speakerId)) { notify('请填写火山控制台提供的有效 speaker_id'); return; }
  setCloneStatus('正在提交火山复刻训练；只在你点击后上传样本…', 'working');
  const form = new FormData();
  form.set('speakerId', speakerId);
  form.set('cloneAudio', cloneFile);
  form.set('promptText', $('#clone-reference').value.trim());
  try {
    const response = await fetch('/api/volcengine/voice/train', {method:'POST', body:form});
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || '火山复刻训练提交失败');
    if (data.speakerId) { draft.speakerId = data.speakerId; $('#clone-speaker-id').value = data.speakerId; saveDraft(); }
    const state = {0:'未找到音色', 1:'训练中', 2:'训练成功，可用于合成', 3:'训练失败', 4:'已激活，可用于合成'}[data.status] || `状态 ${data.status ?? '未知'}`;
    setCloneStatus(`火山返回：${state}；speaker_id：${data.speakerId}。${data.status === 1 ? '后续状态请在火山控制台查看。' : ''}`, data.status === 3 ? 'blocked' : 'ready');
    notify(`火山复刻：${state}`);
  } catch (error) { setCloneStatus(String(error.message || error), 'blocked'); notify(String(error.message || error)); }
}

function splitScript(script) {
  return (script.replace(/\r/g, '').match(/[^。！？!?\n]+[。！？!?]?/gu) || []).map(text => text.trim()).filter(Boolean);
}

function rebuildPlan() {
  const text = draft.script.trim();
  if (!text) { notify('请先输入文案'); go('inputs'); return false; }
  draft.scenes = splitScript(text).map((part, index) => ({id: `s-${index + 1}`, text: part, subject: 'pending', subtitle: '', visualText: ''}));
  draft.planSource = text;
  draft.approved = false;
  saveDraft();
  renderPlan();
  return true;
}

async function matchVideos() {
  if (!draft.scenes.length || draft.planSource !== draft.script.trim()) { notify('请先按当前文案建立分镜'); return; }
  const button = $('#match-videos');
  button.disabled = true;
  try {
    const response = await fetch('/api/b-mode/material-match', {method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({scenes:draft.scenes.map(scene => ({text:scene.text}))})});
    const data = await response.json();
    if (!response.ok || !data.ok || data.matches.length !== draft.scenes.length) throw new Error(data.error || '匹配失败');
    draft.scenes.forEach((scene, index) => {
      if (scene.videoSource === 'manual') return;
      scene.videoPath = data.matches[index].path;
      scene.videoSource = data.matches[index].status;
      scene.videoReason = data.matches[index].reason;
    });
    draft.scenes.forEach((scene, index) => {
      if (index > 0 && scene.videoPath && scene.videoPath === draft.scenes[index - 1].videoPath && scene.videoSource !== 'manual') {
        scene.videoPath = null;
        scene.videoSource = 'unmatched';
        scene.videoReason = '相邻镜头不能复用同一素材，等待人工选择';
      }
    });
    draft.approved = false;
    saveDraft();
    renderPlan();
    const suggested = draft.scenes.filter(scene => scene.videoSource === 'suggested').length;
    const context = draft.scenes.filter(scene => scene.videoSource === 'context').length;
    const missing = draft.scenes.filter(scene => !scene.videoPath).length;
    notify(`${suggested} 个主题候选、${context} 个承接画面${missing ? `；${missing} 个待人工选` : '；请逐镜核对'}`);
  } catch (error) { notify(String(error.message || error)); }
  finally { button.disabled = false; }
}

function personUnits() {
  let units = 0;
  let inPerson = false;
  for (const scene of draft.scenes) {
    if (scene.subject === 'person') {
      if (!inPerson) units++;
      inPerson = true;
    } else inPerson = false;
  }
  return units;
}

function renderPlan() {
  const stale = draft.planSource !== draft.script.trim();
  $('#plan-notice').hidden = !stale;
  $('#plan-notice').textContent = stale ? '文案已有修改。请按当前文案重建分镜，再确认镜头主体。' : '';
  const list = $('#scene-list');
  list.replaceChildren();
  if (!draft.scenes.length) {
    const empty = document.createElement('p');
    empty.className = 'field-note';
    empty.textContent = '暂无句段。先输入文案，再按当前文案建立分镜草案。';
    list.append(empty);
  }
  draft.scenes.forEach((scene, index) => {
    const row = document.createElement('div');
    row.className = `scene-row ${scene.subject === 'person' ? 'person' : ''}`;
    const number = document.createElement('span');
    number.className = 'scene-index';
    number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('div');
    copy.className = 'scene-copy';
    const text = document.createElement('div');
    text.className = 'scene-text';
    text.textContent = scene.text;
    const subtitle = document.createElement('input');
    subtitle.type = 'text';
    subtitle.className = 'scene-subtitle';
    subtitle.maxLength = 32;
    subtitle.placeholder = '副标题（可选）';
    subtitle.value = scene.subtitle || '';
    subtitle.setAttribute('aria-label', `第 ${index + 1} 镜头副标题`);
    subtitle.oninput = () => { scene.subtitle = subtitle.value.trim(); draft.approved = false; saveDraft(); };
    copy.append(text, subtitle);
    const select = document.createElement('select');
    select.setAttribute('aria-label', `第 ${index + 1} 句镜头主体`);
    for (const [value, label] of Object.entries(SUBJECT_LABELS)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.value = scene.subject;
    select.onchange = () => {
      scene.subject = select.value;
      row.classList.toggle('person', scene.subject === 'person');
      draft.approved = false;
      saveDraft();
      updatePlanCounts();
    };
    const media = document.createElement('div');
    media.className = 'scene-media';
    if (scene.videoPath) {
      const thumb = document.createElement('img');
      thumb.alt = '';
      thumb.src = `/api/library/thumb?path=${encodeURIComponent(scene.videoPath)}`;
      media.append(thumb);
    }
    const info = document.createElement('span');
    info.className = 'scene-media-info';
    const title = document.createElement('strong');
    title.textContent = scene.videoPath ? scene.videoPath.split(/[\\/]/u).pop() : '待选素材';
    const reason = document.createElement('span');
    reason.textContent = scene.videoSource === 'manual' ? '人工选择' : scene.videoReason || '尚未匹配';
    info.append(title, reason);
    media.append(info);
    const choose = document.createElement('button');
    choose.type = 'button'; choose.className = 'button secondary'; choose.textContent = scene.videoPath ? '替换' : '选视频';
    const clear = document.createElement('button');
    clear.type = 'button'; clear.className = 'button quiet'; clear.textContent = '清除'; clear.hidden = !scene.videoPath;
    clear.onclick = () => { scene.videoPath = null; scene.videoSource = 'unmatched'; scene.videoReason = '已清除'; draft.approved = false; saveDraft(); renderPlan(); };
    media.append(choose, clear);
    const picker = document.createElement('div'); picker.className = 'scene-picker'; picker.hidden = true;
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = '搜索素材文件名、分类或标签';
    search.setAttribute('aria-label', `第 ${index + 1} 镜头搜索视频`);
    const results = document.createElement('div'); results.className = 'scene-picker-results';
    let timer;
    async function searchVideos() {
      results.textContent = '正在查询…';
      try {
        const response = await fetch(`/api/library/list?q=${encodeURIComponent(search.value.trim())}&limit=30`);
        const data = await response.json();
        results.replaceChildren();
        for (const item of (data.items || []).filter(item => /\.mp4$/i.test(item.path))) {
          const option = document.createElement('button'); option.type = 'button';
          const image = document.createElement('img'); image.alt = ''; image.src = `/api/library/thumb?path=${encodeURIComponent(item.path)}`;
          const label = document.createElement('span'); label.textContent = `${item.path.split(/[\\/]/u).pop()} · ${Number(item.duration_sec).toFixed(1)} 秒`;
          option.append(image, label);
          option.onclick = () => {
            const previous = draft.scenes[index - 1]?.videoPath;
            const next = draft.scenes[index + 1]?.videoPath;
            if (item.path === previous || item.path === next) { notify('相邻镜头不能使用同一视频素材，请换一条'); return; }
            scene.videoPath = item.path; scene.videoSource = 'manual'; scene.videoReason = '人工选择';
            draft.approved = false; saveDraft(); renderPlan(); };
          results.append(option);
        }
        if (!results.childElementCount) results.textContent = '未找到视频';
      } catch { results.textContent = '素材库暂时不可用'; }
    }
    choose.onclick = () => { picker.hidden = !picker.hidden; if (!picker.hidden) searchVideos(); };
    search.oninput = () => { clearTimeout(timer); timer = setTimeout(searchVideos, 250); };
    picker.append(search, results);
    row.append(number, copy, select, media, picker);
    list.append(row);
  });
  updatePlanCounts();
}

function updatePlanCounts() {
  $('#scene-total').textContent = draft.scenes.length;
  $('#person-total').textContent = draft.scenes.filter(scene => scene.subject === 'person').length;
  $('#unit-total').textContent = personUnits();
  $('#panel-plan .panel-state').textContent = draft.approved ? '已确认' : '待确认';
}

function voiceLabel() {
  if (draft.voiceMode === 'clone') return `火山声音复刻 · ${draft.speakerId || '未填写 speaker_id'}`;
  if (draft.voiceMode === 'volcengine-tts2') return `火山合成 2.0 · ${draft.tts2SpeakerId || '未填写音色 ID'}`;
  return draft.voice === 'zh-CN-XiaoxiaoNeural' ? '晓晓 · 女声' : '云希 · 男声';
}

function backgroundLabel() {
  return {keep: '保留原背景', auto: '检查背景后决定', green: '绿幕时抠绿'}[draft.background];
}

function backgroundVideoLabel() {
  return draft.backgroundVideoPath?.split(/[\\/]/u).pop() || '未选择';
}

function renderBackgroundSelection() {
  const selected = !!draft.backgroundVideoPath;
  $('#background-selected').hidden = !selected;
  if (!selected) return;
  $('#background-thumb').src = `/api/library/thumb?path=${encodeURIComponent(draft.backgroundVideoPath)}`;
  $('#background-name').textContent = backgroundVideoLabel();
  $('#background-details').textContent = `${draft.backgroundVideoMeta?.durationSeconds || '?'} 秒 · ${draft.backgroundVideoMeta?.category || '素材库视频'}`;
}

function renderBackgroundResults(items) {
  const list = $('#background-results');
  list.replaceChildren();
  const videos = (items || []).filter(item => /\.mp4$/i.test(item.path || ''));
  if (!videos.length) { list.textContent = '未找到匹配的视频'; return; }
  for (const item of videos) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'background-result';
    const image = document.createElement('img');
    image.alt = '';
    image.src = `/api/library/thumb?path=${encodeURIComponent(item.path)}`;
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = item.path.split(/[\\/]/u).pop();
    const detail = document.createElement('small');
    detail.textContent = `${Number(item.duration_sec).toFixed(1)} 秒 · ${item.category}`;
    text.append(title, detail);
    button.append(image, text);
    button.onclick = () => {
      draft.backgroundVideoPath = item.path;
      draft.backgroundVideoMeta = {durationSeconds:Number(item.duration_sec).toFixed(1), category:item.category};
      saveDraft();
      renderBackgroundSelection();
      renderReview();
      $('#background-library-picker').hidden = true;
      notify('已选择素材库背景视频');
    };
    list.append(button);
  }
}

async function searchBackgroundVideos() {
  const query = $('#background-search').value.trim();
  const list = $('#background-results');
  list.textContent = '正在查询素材库…';
  try {
    const response = await fetch(`/api/library/list?q=${encodeURIComponent(query)}&limit=20`);
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.items)) throw new Error('素材库查询失败');
    renderBackgroundResults(data.items);
  } catch { list.textContent = '素材库暂时不可用'; }
}

function reviewRow(label, value) {
  const row = document.createElement('div');
  row.className = 'review-row';
  const name = document.createElement('span');
  name.textContent = label;
  const detail = document.createElement('strong');
  detail.textContent = value;
  row.append(name, detail);
  return row;
}

function renderReview() {
  $('#render-mode').value = draft.renderMode;
  $('#generate-render-mode').value = draft.renderMode;
  const realMode = draft.renderMode === 'runninghub' || draft.renderMode === 'runninghub-combined';
  const combinedMode = draft.renderMode === 'runninghub-combined';
  const unitCount = personUnits();
  const modeLabel = combinedMode ? `RunningHub 合并音频一次生成 · ${unitCount ? 1 : 0} 次调用`
    : realMode ? `RunningHub 按连续片段生成 · ${unitCount} 次调用` : '图片占位（安全回退）';
  $('#render-mode-note').textContent = combinedMode
    ? '只拼接数字人镜头的配音，整批随机选一张角色图；生成一次后按镜头时间切回原片。'
    : realMode ? '每组连续数字人镜头单独生成，并从角色图中各选一张。' : '图片占位不产生外部费用。';
  $('#generation-mode-description').textContent = combinedMode
    ? `先从主 TTS 裁出 ${unitCount} 组数字人配音并合并，随机选一张角色图提交一次 RunningHub；生成后按记录的帧边界切片并放回原时间轴。真实调用可能产生费用。`
    : realMode ? `先生成主 TTS，再为 ${unitCount} 组连续数字人镜头分别裁音频和提交 RunningHub。真实调用可能产生费用。`
      : '图片占位用于不产生外部费用的测试。';
  const rows = $('#review-rows');
  rows.replaceChildren(
    reviewRow('角色图', roleFile ? roleFile.name : '未选择'),
    reviewRow('口播文案', draft.script.trim() ? `${draft.script.trim().length} 字` : '未填写'),
    reviewRow('音色', voiceLabel()),
    reviewRow('分镜', `${draft.scenes.length} 句 · ${draft.scenes.filter(scene => scene.subject === 'person').length} 个数字人镜头 · ${personUnits()} 个连续片段`),
    reviewRow('人物背景', backgroundLabel()),
    reviewRow('镜头视频', `${draft.scenes.filter(scene => scene.videoPath).length}/${draft.scenes.length} 个已选 · ${draft.scenes.length - draft.scenes.filter(scene => scene.videoPath).length} 个待选`),
    reviewRow('人物背景兜底', backgroundVideoLabel()),
    reviewRow('人物生成方式', modeLabel),
  );
  const checks = [
    [!!roleFile, '角色图已选择'],
    [!!draft.script.trim() && draft.script.trim().length <= 1200, '口播文案为 1–1200 字'],
    [draft.voiceMode === 'standard' || (volcengineConfigured && (draft.voiceMode === 'clone' ? /^[A-Za-z0-9_-]{2,128}$/u.test(draft.speakerId || '') : /^[A-Za-z0-9_-]{2,256}$/u.test(draft.tts2SpeakerId || ''))), draft.voiceMode === 'standard' ? '现成音色可用' : (volcengineConfigured ? (draft.voiceMode === 'clone' ? '火山复刻 speaker_id 已填写' : '火山合成 2.0 音色 ID 已填写') : '火山语音服务尚未配置')],
    [draft.approved && draft.planSource === draft.script.trim(), '分镜已确认且与文案一致'],
    [draft.scenes.length > 0 && draft.scenes.every(scene => scene.text.length <= 80), '每句文案不超过 80 字'],
    [!realMode || digitalHumanConfigured, realMode ? (digitalHumanConfigured ? 'RunningHub 鉴权已配置' : 'RunningHub 鉴权未配置') : '当前使用图片占位，不调用外部服务'],
  ];
  $('#run-placeholder').disabled = placeholderRunning || !checks.slice(0, 5).every(([ready]) => ready);
  $('#run-digital-human').disabled = digitalHumanRunning || !realMode || !digitalHumanConfigured || !checks.slice(0, 5).every(([ready]) => ready);
  $('#generate-state').textContent = combinedMode ? 'RunningHub 一次生成' : realMode ? 'RunningHub 按片段生成' : '图片占位可用';
  $('#generate-state').classList.toggle('blocked', realMode && !checks.slice(0, 5).every(([ready]) => ready));
  const readiness = $('#readiness');
  readiness.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = '状态检查';
  readiness.append(heading);
  for (const [ready, label] of checks) {
    const line = document.createElement('div');
    line.className = `readiness-line${ready ? '' : ' blocked'}`;
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    const text = document.createElement('span');
    text.textContent = label;
    line.append(dot, text);
    readiness.append(line);
  }
}

async function showPlaceholderResult(runId) {
  const base = `/director/b-mode-runs/${encodeURIComponent(runId)}/`;
  const [reportResponse, scenesResponse] = await Promise.all([
    fetch(base + 'placeholder-report.json'), fetch(base + 'placeholder-scene-plan.json'),
  ]);
  if (!reportResponse.ok || !scenesResponse.ok) throw new Error('占位样片记录不可用');
  const report = await reportResponse.json();
  const plan = await scenesResponse.json();
  if (!['baseline-b-mode-preview', 'talkcraft-card-preview', 'static-avatar-placeholder'].includes(report.kind) || report.isDigitalHuman !== false) throw new Error('样片类型不匹配');
  const cardMeta = report.cardDriven ? ` · ${report.cardsUnique?.length || 0} 张卡驱动` : '';
  $('#placeholder-meta').textContent = `${Number(report.renderedSeconds).toFixed(1)} 秒 · ${plan.scenes.length} 镜头 · ${report.personUnits} 个人物占位片段 · ${report.matchedVideoScenes ?? 0} 镜头有视频 · ${report.missingVideoScenes ?? plan.scenes.length} 镜头待选${cardMeta} · 未抠像`;
  $('#placeholder-scenes').replaceChildren();
  for (const scene of plan.scenes) {
    const item = document.createElement('li');
    item.textContent = `${(scene.fromFrame / 30).toFixed(1)}–${((scene.fromFrame + scene.durationInFrames) / 30).toFixed(1)} 秒 · ${SUBJECT_LABELS[scene.subject]} · ${scene.videoSource ? '视频：' + scene.videoSource : '待选素材'} · ${scene.text}`;
    $('#placeholder-scenes').append(item);
  }
  $('#placeholder-result').hidden = !!talkcraftRunId;
  $('#results-empty').hidden = true;
  if (!talkcraftRunId) {
    $('#panel-results .panel-state').textContent = report.cardDriven ? 'TalkCraft 实验样片' : 'B 模式增量样片';
    $('#panel-results .panel-state').classList.remove('blocked');
  }
  localStorage.setItem('shotcraft-b-last-placeholder-run', runId);
  reportHeight();
}

async function runPlaceholder() {
  if (placeholderRunning || $('#run-placeholder').disabled) return;
  placeholderRunning = true;
  $('#run-placeholder').disabled = true;
  $('#placeholder-progress').hidden = false;
  const status = $('#placeholder-progress-text');
  status.textContent = '正在上传角色图并准备占位测试…';
  try {
    const form = new FormData();
    form.set('text', draft.script.trim());
    form.set('voiceMode', selectedVoiceMode());
    if (draft.voiceMode !== 'standard') form.set('speakerId', selectedSpeakerId());
    form.set('voice', draft.voice);
    form.set('speechRate', String(draft.speechRate ?? 0));
    form.set('background', draft.background);
    form.set('backgroundVideoPath', draft.backgroundVideoPath || '');
    form.set('scenes', JSON.stringify(draft.scenes.map(scene => ({text:scene.text, subject:scene.subject, videoPath:scene.videoPath || null,
      subtitle:scene.subtitle || '', visualText:scene.visualText || ''}))));
    for (const file of roleFiles.length ? roleFiles : [roleFile]) form.append('avatar', file);
    const response = await fetch('/api/b-mode/placeholder', {method:'POST', body:form});
    const started = await response.json();
    if (!response.ok || !started.ok) throw new Error(started.error || '占位测试无法启动');
    for (let attempt = 0; attempt < 600; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const taskResponse = await fetch(`/api/task?id=${started.id}&since=0`);
      if (!taskResponse.ok) throw new Error('测试任务状态不可用');
      const task = await taskResponse.json();
      if (task.error) throw new Error('测试任务记录已丢失，请检查运行目录');
      const logs = (task.logs || []).join('');
      status.textContent = logs.includes('Placeholder stage 3') ? '正在封装有声 MP4…'
        : logs.includes('Placeholder stage 2') ? '正在渲染占位画面…' : '正在生成整段配音…';
      if (task.done) {
        if (task.exitCode !== 0) throw new Error((task.logs || []).slice(-1)[0]?.trim() || '占位测试失败');
        await showPlaceholderResult(started.runId);
        status.textContent = 'B 模式测试已完成，尚无成片';
        go('results');
        notify('B 模式测试已完成，成片仍待制作');
        return;
      }
    }
    throw new Error('等待占位测试超过 15 分钟，原任务仍可能在运行');
  } catch (error) {
    status.textContent = String(error.message || error);
    notify(status.textContent);
  } finally {
    placeholderRunning = false;
    renderReview();
  }
}

async function showDigitalHumanResult(runId) {
  const response = await fetch(`/api/b-mode/digital-human/report?id=${encodeURIComponent(runId)}`, {cache:'no-store'});
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || '数字人报告不可用');
  const report = data.report || {};
  const box = $('#digital-human-result');
  const video = $('#digital-human-video');
  box.hidden = false;
  $('#digital-human-meta').textContent = report.status === 'SUCCESS'
    ? `${Number(report.durationSeconds || 0).toFixed(1)} 秒成片 · ${report.generationMode === 'combined' ? '一次生成并切回' : '分别生成'} ${report.units?.length || 0} 个数字人片段 · 完整成片预览`
    : `状态：${report.status || '未知'}${report.error ? ` · ${report.error}` : ''}`;
  if (report.status === 'SUCCESS') {
    video.src = `/api/b-mode/digital-human/final-video?id=${encodeURIComponent(runId)}`;
    video.hidden = false;
    $('#results-empty').hidden = true;
    $('#panel-results .panel-state').textContent = 'RunningHub 数字人结果';
    $('#panel-results .panel-state').classList.remove('blocked');
  } else {
    video.removeAttribute('src');
    video.hidden = true;
  }
  localStorage.setItem('shotcraft-b-last-digital-human-run', runId);
  reportHeight();
}

async function runDigitalHuman() {
  if (digitalHumanRunning || $('#run-digital-human').disabled) return;
  digitalHumanRunning = true;
  $('#run-digital-human').disabled = true;
  $('#placeholder-progress').hidden = false;
  const status = $('#placeholder-progress-text');
  status.textContent = '准备标准 WAV 并提交 RunningHub…';
  try {
    const form = new FormData();
    form.set('text', draft.script.trim());
    form.set('voiceMode', selectedVoiceMode());
    if (draft.voiceMode !== 'standard') form.set('speakerId', selectedSpeakerId());
    form.set('voice', draft.voice);
    form.set('speechRate', String(draft.speechRate ?? 0));
    form.set('generationMode', draft.renderMode === 'runninghub-combined' ? 'combined' : 'segments');
    form.set('prompt', '人物自然说话，身体保持稳定，配合轻微自然手势');
    form.set('scenes', JSON.stringify(draft.scenes.map(scene => ({text:scene.text, subject:scene.subject}))));
    for (const file of roleFiles.length ? roleFiles : [roleFile]) form.append('avatar', file);
    const response = await fetch('/api/b-mode/digital-human', {method:'POST', body:form});
    const started = await response.json();
    if (!response.ok || !started.ok) throw new Error(started.error || 'RunningHub 任务无法启动');
    for (let attempt = 0; attempt < 1200; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const taskResponse = await fetch(`/api/task?id=${started.id}&since=0`);
      if (!taskResponse.ok) throw new Error('数字人任务状态不可用');
      const task = await taskResponse.json();
      const logs = (task.logs || []).join('');
      status.textContent = logs.includes('Digital human stage 3') ? 'RunningHub 正在生成并轮询…' : logs.includes('stage 1') ? '正在生成并规范化 WAV…' : '正在提交 RunningHub…';
      if (task.done) {
        await showDigitalHumanResult(started.runId);
        if (task.exitCode !== 0) throw new Error((task.logs || []).slice(-1)[0]?.trim() || 'RunningHub 数字人任务失败');
        status.textContent = '真实数字人任务已完成';
        go('results');
        notify('RunningHub 数字人成片已保存到隔离运行目录');
        return;
      }
    }
    throw new Error('等待 RunningHub 超过 30 分钟，原任务仍可能在运行');
  } catch (error) {
    status.textContent = String(error.message || error);
    notify(status.textContent);
  } finally {
    digitalHumanRunning = false;
    renderReview();
  }
}

function renderTalkcraftStages(run) {
  const stages = [
    ['输入', true, '已保存'], ['字级时间', run.sentences > 0 && run.minMatch >= .9, '已对齐'],
    ['语义', run.semanticPassed, '已校验'], ['分镜', run.shotbook, '已建立'],
    ['预检', run.preflight, '已通过'], ['样板', run.sampleApproved, '已确认'],
    ['整片', run.final, '已渲染'], ['机器质检', run.qaPassed, '已通过'],
    ['独立审片', run.reviewPassed, '已通过'], ['交付', run.delivery, '已生成'],
  ];
  const list = $('#talkcraft-stages');
  list.replaceChildren();
  for (const [label, done, doneText] of stages) {
    const item = document.createElement('div');
    item.className = `talkcraft-stage ${done ? 'done' : 'pending'}`;
    const title = document.createElement('strong');
    title.textContent = label;
    const state = document.createElement('small');
    state.textContent = done ? doneText : '待完成';
    item.append(title, state);
    list.append(item);
  }
}

async function renderTalkcraftAudit(runId) {
  const response = await fetch(`/api/talkcraft/audit?id=${encodeURIComponent(runId)}`);
  const audit = await response.json();
  if (!response.ok || !audit.ok) throw new Error(audit.error || '输入审核数据不可用');
  $('#talkcraft-audit').hidden = false;
  $('#talkcraft-audit-status').textContent = audit.contentWarning ? '内容待核对' : audit.alignmentPassed ? '逐句对齐通过' :
    audit.sentenceCount ? '对齐未通过，需先处理低匹配句' : '尚无对齐结果';
  $('#talkcraft-audit-risk').hidden = !audit.contentWarning;
  $('#talkcraft-audit-risk').textContent = audit.contentWarning || '';
  const metrics = $('#talkcraft-audit-metrics');
  metrics.replaceChildren();
  const values = [`${audit.sentenceCount} 句`, audit.audioSeconds ? `${audit.audioSeconds.toFixed(1)} 秒` : null,
    Number.isFinite(audit.minimumMatch) ? `最低匹配率 ${(audit.minimumMatch * 100).toFixed(1)}%` : null].filter(Boolean);
  for (const value of values) {
    const item = document.createElement('span');
    item.textContent = value;
    metrics.append(item);
  }
  $('#talkcraft-audit-script').textContent = audit.script;
  const audio = $('#talkcraft-audio');
  $('#talkcraft-audio-check').hidden = !audit.audioAvailable;
  if (audit.audioAvailable) {
    const audioUrl = `/api/talkcraft/audio?id=${encodeURIComponent(runId)}`;
    if (audio.getAttribute('src') !== audioUrl) audio.src = audioUrl;
  } else {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  const rows = $('#talkcraft-alignment-rows');
  rows.replaceChildren();
  for (const sentence of audit.sentences || []) {
    const row = document.createElement('tr');
    row.className = sentence.ok === true ? 'pass' : 'fail';
    const number = document.createElement('td');
    number.textContent = String(sentence.index).padStart(2, '0');
    const time = document.createElement('td');
    time.textContent = Number.isFinite(sentence.start) && Number.isFinite(sentence.end)
      ? `${sentence.start.toFixed(2)}–${sentence.end.toFixed(2)} 秒` : '未对齐';
    const match = document.createElement('td');
    match.textContent = Number.isFinite(sentence.match) ? `${(sentence.match * 100).toFixed(1)}%` : '无';
    const text = document.createElement('td');
    text.textContent = sentence.text || '';
    row.append(number, time, match, text);
    rows.append(row);
  }
}

async function refreshTalkcraft() {
  let response;
  let data;
  if (talkcraftRunId) {
    response = await fetch(`/api/talkcraft/status?id=${encodeURIComponent(talkcraftRunId)}`);
    data = await response.json();
    if (!data.ok) {
      talkcraftRunId = null;
      localStorage.removeItem('shotcraft-b-talkcraft-run');
    }
  }
  if (!talkcraftRunId) {
    response = await fetch('/api/talkcraft/latest');
    data = await response.json();
    if (!data.ok || !data.run) return;
    talkcraftRunId = data.run.runId;
    localStorage.setItem('shotcraft-b-talkcraft-run', talkcraftRunId);
  }
  if (!response.ok || !data.ok) throw new Error(data.error || 'TalkCraft 任务状态不可用');
  const run = data.run;
  $('#talkcraft-run').hidden = false;
  $('#results-empty').hidden = true;
  $('#placeholder-result').hidden = true;
  $('#talkcraft-run-id').textContent = `运行 ID：${run.runId}`;
  $('#talkcraft-summary').textContent = `${run.audioSeconds?.toFixed(1) || '?'} 秒 · ${run.sentences} 句 · ${run.shots} 镜 · 静态角色图占位`;
  $('#talkcraft-state').textContent = run.failureReport ? '处理失败' : run.delivery ? '交付版就绪' : run.reviewPassed ? '待交付' :
    run.qaPassed ? '待审片' : run.final ? '待质检' : run.sampleApproved && !run.scenesReady ? '其余镜头制作中' :
    run.sample ? '待确认首镜' :
    run.preflight ? '待制作样板' : run.semanticPassed ? '待分镜预检' : run.sentences ? '待编导' : '配音中';
  $('#panel-results .panel-state').textContent = 'TalkCraft 工作流';
  $('#panel-results .panel-state').classList.remove('blocked');
  const failure = run.failureReport;
  $('#talkcraft-failure').hidden = !failure;
  $('#talkcraft-failure-cause').textContent = failure?.cause || '';
  const evidence = failure?.evidence || {};
  const evidenceParts = [];
  if (evidence.edgeTtsNoAudio) evidenceParts.push('在线配音未返回音频');
  if (evidence.fallbackVoice) evidenceParts.push(`后备音色：${evidence.fallbackVoice === 'windows-offline-zh-CN' ? 'Windows 离线中文音色' : evidence.fallbackVoice}`);
  if (evidence.audioSaved) evidenceParts.push(`配音已保存${Number.isFinite(evidence.audioSeconds) ? `，${evidence.audioSeconds.toFixed(1)} 秒` : ''}`);
  if (evidence.sentences) evidenceParts.push(`${evidence.belowThreshold}/${evidence.sentences} 句低于 0.90${Number.isFinite(evidence.minimumMatch) ? `，最低 ${evidence.minimumMatch.toFixed(2)}` : ''}`);
  $('#talkcraft-failure-evidence').textContent = evidenceParts.join('；');
  $('#talkcraft-failure-risk-row').hidden = !failure?.contentWarning;
  $('#talkcraft-failure-risk').textContent = failure?.contentWarning || '';
  const actions = $('#talkcraft-failure-actions');
  actions.replaceChildren();
  for (const action of failure?.actions || []) {
    const item = document.createElement('li');
    item.textContent = action;
    actions.append(item);
  }
  $('#talkcraft-audio-download').hidden = !evidence.audioSaved;
  if (evidence.audioSaved) $('#talkcraft-audio-download').href = `/api/talkcraft/audio?id=${encodeURIComponent(run.runId)}`;
  else $('#talkcraft-audio-download').removeAttribute('href');
  renderTalkcraftStages(run);
  $('#talkcraft-sample-review').hidden = !run.sample;
  const sampleVideo = $('#talkcraft-sample-video');
  sampleVideo.dataset.aspectRatio = run.aspectRatio || '16:9';
  if (run.sample) {
    const sampleUrl = `/api/talkcraft/video?id=${encodeURIComponent(run.runId)}&kind=sample`;
    if (sampleVideo.getAttribute('src') !== sampleUrl) sampleVideo.src = sampleUrl;
  } else sampleVideo.removeAttribute('src');
  $('#talkcraft-scenes-progress').textContent = run.scenesReady
    ? `${run.shots}/${run.shots} 镜已接入，可在确认首镜后生成整片。`
    : `${run.scenesImplemented}/${run.shots} 镜已接入；其余镜头制作中：${run.scenesMissing.map(id => id.toUpperCase()).join('、')}。`;
  $('#talkcraft-preflight').hidden = run.preflight;
  $('#talkcraft-preflight').disabled = talkcraftBusy || !run.semanticPassed || !run.shotbook;
  $('#talkcraft-sample').hidden = !run.preflight || run.sample;
  $('#talkcraft-approve').hidden = !run.sample || run.sampleApproved;
  $('#talkcraft-render').hidden = !run.sampleApproved || !run.scenesReady || run.final;
  $('#talkcraft-qa').hidden = !run.final || run.qaPassed;
  $('#talkcraft-deliver').hidden = !run.reviewPassed || run.delivery;
  for (const id of ['talkcraft-sample','talkcraft-approve','talkcraft-render','talkcraft-qa','talkcraft-deliver']) {
    $(`#${id}`).disabled = talkcraftBusy;
  }
  $('#talkcraft-preview-link').hidden = !run.delivery;
  if (run.delivery) $('#talkcraft-preview-link').href = `/api/talkcraft/video?id=${encodeURIComponent(run.runId)}&kind=delivery`;
  else $('#talkcraft-preview-link').removeAttribute('href');
  $('#talkcraft-download').hidden = !run.delivery;
  if (run.delivery) $('#talkcraft-download').href = `/api/talkcraft/video?id=${encodeURIComponent(run.runId)}&kind=delivery`;
  $('#talkcraft-workbench').hidden = !run.workbenchReady;
  $('#talkcraft-workbench').disabled = talkcraftBusy;
  $('#talkcraft-workbench').dataset.url = run.workbenchUrl || '';
  const planResponse = await fetch(`/api/talkcraft/plan?id=${encodeURIComponent(run.runId)}`);
  const plan = await planResponse.json();
  const shots = $('#talkcraft-shots');
  shots.replaceChildren();
  for (const shot of plan.ok ? plan.shots : []) {
    const item = document.createElement('li');
    const index = document.createElement('span');
    index.textContent = shot.id.toUpperCase();
    const time = document.createElement('span');
    time.textContent = `${shot.start.toFixed(1)}–${shot.end.toFixed(1)} 秒`;
    const copy = document.createElement('strong');
    copy.textContent = shot.sentences.map(sentence => sentence.text).join(' ');
    item.append(index, time, copy);
    shots.append(item);
  }
  $('#talkcraft-plan').hidden = !shots.children.length;
  try { await renderTalkcraftAudit(run.runId); }
  catch (error) { $('#talkcraft-audit').hidden = false; $('#talkcraft-audit-status').textContent = String(error.message || error); }
  reportHeight();
}

async function watchTalkcraftTask(taskId, label) {
  const progress = $('#talkcraft-progress');
  const logs = $('#talkcraft-logs');
  progress.hidden = false;
  progress.textContent = `${label}运行中…`;
  let since = 0;
  try {
    for (let attempt = 0; attempt < 600; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const response = await fetch(`/api/task?id=${taskId}&since=${since}`);
      const task = await response.json();
      if (!response.ok || task.error) throw new Error('任务状态不可用');
      since = task.since;
      if (task.logs?.length) logs.textContent = (logs.textContent + task.logs.join('')).slice(-24000);
      if (task.done) {
        if (task.exitCode !== 0) {
          const firstFailure = logs.textContent.match(/\[[^\]\n]+\] FAIL:[^\n]+/u)?.[0];
          const detail = firstFailure?.replace(/^\[[^\]]+\] FAIL:\s*/u, '').trim();
          const missing = detail?.match(/\b([Ss]\d{1,3}):(截图|V|图)(?=\s|—|，|、|$)/u);
          const noun = {截图:'页面截图', V:'视频素材', 图:'图片素材'}[missing?.[2]];
          throw new Error(missing ? `${label}未通过：${missing[1].toUpperCase()} 缺${noun}` :
            detail ? `${label}未通过：${detail.slice(0, 80)}` : `${label}未通过，请查看内部日志`);
        }
        progress.textContent = `${label}已完成`;
        await refreshTalkcraft();
        return;
      }
    }
    throw new Error(`${label}运行超过 15 分钟，任务仍可能在后台执行`);
  } catch (error) {
    progress.textContent = String(error.message || error);
    notify(progress.textContent);
  } finally {
    talkcraftBusy = false;
    await refreshTalkcraft().catch(() => {});
  }
}

async function startTalkcraft() {
  if (talkcraftBusy) return;
  if (!draft.script.trim()) { notify('请先输入完整口播文案'); return; }
  if (!roleFile) {
    $('.internal-data-panel').open = true;
    notify('请先选择角色图');
    $('#choose-role').focus();
    reportHeight();
    return;
  }
  if (draft.voiceMode === 'clone' && !/^[A-Za-z0-9_-]{2,128}$/u.test(draft.speakerId || '')) { $('.internal-data-panel').open = true; notify('请先填写有效的火山 speaker_id'); return; }
  if (draft.voiceMode === 'volcengine-tts2' && !/^[A-Za-z0-9_-]{2,256}$/u.test(draft.tts2SpeakerId || '')) { $('.internal-data-panel').open = true; notify('请先填写有效的火山合成 2.0 音色 ID'); return; }
  pendingDirectorStart = false;
  talkcraftBusy = true;
  try {
    const form = new FormData();
    form.set('text', draft.script.trim());
    form.set('voiceMode', selectedVoiceMode());
    if (draft.voiceMode !== 'standard') form.set('speakerId', selectedSpeakerId());
    form.set('voice', draft.voice);
    form.set('speechRate', String(draft.speechRate ?? 0));
    for (const file of roleFiles) form.append('avatar', file);
    form.set('generationMode', draft.renderMode === 'runninghub-combined' ? 'combined' : 'segments');
    const response = await fetch('/api/talkcraft/create', {method:'POST', body:form});
    const started = await response.json();
    if (!response.ok || !started.ok) throw new Error(started.error || 'TalkCraft 无法启动');
    talkcraftRunId = started.runId;
    localStorage.setItem('shotcraft-b-talkcraft-run', talkcraftRunId);
    go('results');
    await refreshTalkcraft();
    await watchTalkcraftTask(started.id, '配音与字级对齐');
  } catch (error) { talkcraftBusy = false; notify(String(error.message || error)); }
}

async function submitTalkcraftStage(stage, label) {
  if (!talkcraftRunId || talkcraftBusy) return;
  talkcraftBusy = true;
  try {
    const response = await fetch('/api/talkcraft/stage', {method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({runId:talkcraftRunId, stage})});
    const started = await response.json();
    if (!response.ok || !started.ok) throw new Error(started.error || `${label}无法启动`);
    await refreshTalkcraft();
    await watchTalkcraftTask(started.id, label);
  } catch (error) { talkcraftBusy = false; notify(String(error.message || error)); await refreshTalkcraft().catch(() => {}); }
}

async function approveTalkcraft() {
  if (!talkcraftRunId || talkcraftBusy) return;
  try {
    const response = await fetch('/api/talkcraft/approve-sample', {method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({runId:talkcraftRunId})});
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || '样板确认失败');
    notify('首镜样板已确认；其余镜头接入后可生成整片');
    await refreshTalkcraft();
  } catch (error) { notify(String(error.message || error)); }
}

function exportDraft() {
  const output = {
    schema: 'shotcraft-b-interaction-draft-v1',
    status: 'local_design_only',
    input: {characterImageName: roleFile?.name || null, script: draft.script.trim(), voiceMode: draft.voiceMode, voice: draft.voiceMode === 'standard' ? draft.voice : null, speakerId: draft.voiceMode === 'standard' ? null : selectedSpeakerId(), cloneSampleName: draft.voiceMode === 'clone' ? cloneFile?.name || null : null, background: draft.background, backgroundVideoPath:draft.backgroundVideoPath},
    renderMode: draft.renderMode,
    storyboard: {sourceText: draft.planSource, approved: draft.approved, scenes: draft.scenes, personUnits: personUnits(), timing: 'pending_tts'},
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'b-mode-design-draft.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('方案已导出，媒体文件未包含在 JSON 中');
}

$('#script-input').value = draft.script;
$('#script-count').textContent = `${draft.script.length} 字`;
$('#restore-draft').hidden = !localStorage.getItem(BACKUP_KEY);
$('#voice-select').value = draft.voice;
$('#clone-speaker-id').value = draft.speakerId || '';
$('#tts2-speaker-id').value = draft.tts2SpeakerId || '';
$('#background-select').value = draft.background;
$('#render-mode').value = draft.renderMode;
renderBackgroundSelection();
setVoiceMode(draft.voiceMode, true);
$('#script-input').oninput = (event) => {
  pendingDirectorStart = false;
  draft.script = event.target.value;
  draft.approved = false;
  $('#script-count').textContent = `${draft.script.length} 字`;
  saveDraft();
};
$('#import-a-script').onclick = () => {
  if (!document.documentElement.classList.contains('embedded')) { notify('请从原操作台进入 B 模式'); return; }
  if (draft.script.trim()) { notify('B 草稿已有文案，清空后才能从编导台导入'); return; }
  window.parent.postMessage({type: 'shotcraft-b-request-script'}, location.origin);
};
$('#load-acceptance').onclick = async () => {
  try {
    const response = await fetch('/api/b-mode/acceptance');
    const fixture = await response.json();
    if (!response.ok || !fixture.ok) throw new Error(fixture.error || '验收文案不可用');
    const presentationChanged = fixture.scenes.some((scene, index) =>
      draft.scenes[index]?.subtitle !== scene.subtitle || draft.scenes[index]?.visualText !== scene.visualText);
    if (draft.script.trim() === fixture.script && draft.scenes.length && !presentationChanged) {
      notify('当前已是验收文案，保留已编辑的分镜'); return;
    }
    if (draft.script.trim() && draft.script.trim() !== fixture.script) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(draft));
      $('#restore-draft').hidden = false;
    }
    draft.script = fixture.script;
    draft.scenes = fixture.scenes;
    draft.planSource = fixture.script;
    draft.approved = false;
    $('#script-input').value = fixture.script;
    $('#script-count').textContent = `${fixture.script.length} 字`;
    saveDraft();
    notify(`已载入全文和 ${fixture.scenes.length} 个固定分镜，请核对后确认`);
  } catch (error) { notify(String(error.message || error)); }
};
$('#load-talkcraft-script').onclick = async () => {
  if (!talkcraftRunId) { notify('当前没有 TalkCraft 文案'); return; }
  try {
    const response = await fetch(`/api/talkcraft/script?id=${encodeURIComponent(talkcraftRunId)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || '当前文案不可用');
    if (draft.script.trim() === data.text.trim()) { notify('当前已经是这份文案'); return; }
    if (draft.script.trim()) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(draft));
      $('#restore-draft').hidden = false;
    }
    draft.script = data.text;
    draft.scenes = [];
    draft.planSource = '';
    draft.approved = false;
    $('#script-input').value = draft.script;
    $('#script-count').textContent = `${draft.script.length} 字`;
    saveDraft();
    notify('已载入当前 TalkCraft 文案；旧草稿可恢复');
  } catch (error) { notify(String(error.message || error)); }
};
$('#restore-draft').onclick = () => {
  try {
    pendingDirectorStart = false;
    const backup = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null');
    if (!backup || typeof backup.script !== 'string') throw new Error('旧草稿备份不可用');
    Object.assign(draft, freshDraft(), backup);
    $('#script-input').value = draft.script;
    $('#script-count').textContent = `${draft.script.length} 字`;
    $('#voice-select').value = draft.voice;
    $('#background-select').value = draft.background;
    $('#render-mode').value = draft.renderMode;
    $('#clone-speaker-id').value = draft.speakerId || '';
    $('#tts2-speaker-id').value = draft.tts2SpeakerId || '';
    setVoiceMode(draft.voiceMode, true);
    saveDraft();
    localStorage.removeItem(BACKUP_KEY);
    $('#restore-draft').hidden = true;
    notify('已恢复旧 B 草稿');
  } catch (error) { notify(String(error.message || error)); }
};
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== window.parent) return;
  if (event.data?.type === 'shotcraft-video-theme') {
    applyVideoTheme(event.data.theme);
    return;
  }
  if (event.data?.type === 'shotcraft-b-open-from-director') {
    const nextText = typeof event.data.text === 'string' ? event.data.text.trim() : '';
    const avatar = event.data.avatar;
    if (!nextText) { notify('编导台当前没有口播文案'); return; }
    if (!(avatar instanceof File) || !['image/png', 'image/jpeg', 'image/webp'].includes(avatar.type) || avatar.size > 7 * 1024 * 1024) {
      notify('请先在操作台选择有效角色图'); return;
    }
    if (!['standard', 'volcengine-clone', 'volcengine-tts2'].includes(event.data.voiceMode)) { notify('音色来源无效'); return; }
    if (event.data.voiceMode === 'standard' && !['zh-CN-YunxiNeural', 'zh-CN-XiaoxiaoNeural'].includes(event.data.voice)) { notify('请选择可用音色'); return; }
    if (event.data.voiceMode === 'volcengine-clone' && !/^[A-Za-z0-9_-]{2,128}$/u.test(String(event.data.speakerId || ''))) { notify('请填写有效的火山 speaker_id'); return; }
    if (event.data.voiceMode === 'volcengine-tts2' && !/^[A-Za-z0-9_-]{2,256}$/u.test(String(event.data.speakerId || ''))) { notify('请填写有效的火山合成 2.0 音色 ID'); return; }
    if (draft.script.trim() !== nextText) {
      try {
        if (draft.script.trim()) {
          const previousBackup = localStorage.getItem(BACKUP_KEY);
          if (previousBackup) localStorage.setItem(`${BACKUP_KEY}-archive-${Date.now()}`, previousBackup);
          localStorage.setItem(BACKUP_KEY, JSON.stringify(draft));
          $('#restore-draft').hidden = false;
        }
      } catch { notify('旧 B 草稿无法备份，本次进入已取消'); return; }
      draft.script = nextText;
      draft.scenes = [];
      draft.planSource = '';
      draft.approved = false;
      $('#script-input').value = nextText;
      $('#script-count').textContent = `${nextText.length} 字`;
    }
    pendingDirectorStart = false;
    setRole(Array.isArray(event.data.avatars) ? event.data.avatars : avatar);
    if (['segments', 'combined'].includes(event.data.generationMode)) {
      draft.renderMode = event.data.generationMode === 'combined' ? 'runninghub-combined' : 'runninghub';
    }
    draft.voice = event.data.voice;
    draft.voiceMode = event.data.voiceMode === 'volcengine-clone' ? 'clone' : event.data.voiceMode;
    draft.speechRate = Number.isInteger(event.data.speechRate) && event.data.speechRate >= -15 && event.data.speechRate <= 15 ? event.data.speechRate : 0;
    if (draft.voiceMode === 'volcengine-tts2') draft.tts2SpeakerId = String(event.data.speakerId);
    if (draft.voiceMode === 'clone') draft.speakerId = String(event.data.speakerId);
    $('#voice-select').value = draft.voice;
    $('#clone-speaker-id').value = draft.speakerId;
    $('#tts2-speaker-id').value = draft.tts2SpeakerId;
    setVoiceMode(draft.voiceMode, true);
    draft.background = ['keep', 'auto', 'green'].includes(event.data.background) ? event.data.background : 'keep';
    $('#background-select').value = draft.background;
    draft.backgroundVideoPath = typeof event.data.backgroundVideoPath === 'string' && event.data.backgroundVideoPath.length <= 1000
      ? event.data.backgroundVideoPath : null;
    draft.backgroundVideoMeta = draft.backgroundVideoPath && event.data.backgroundVideoMeta && typeof event.data.backgroundVideoMeta === 'object'
      ? {durationSeconds:String(event.data.backgroundVideoMeta.durationSeconds || ''), category:String(event.data.backgroundVideoMeta.category || '')} : null;
    renderBackgroundSelection();
    saveDraft();
    document.documentElement.classList.add('settings-in-director');
    go('inputs');
    notify('已进入编导台；请确认设置后点击“开始 TalkCraft 编导”');
    return;
  }
  if (event.data?.type === 'shotcraft-b-start-from-director') {
    if (talkcraftBusy) { notify('本片已有任务运行中'); return; }
    const nextText = typeof event.data.text === 'string' ? event.data.text.trim() : '';
    if (!nextText) { notify('请先输入完整口播文案'); return; }
    const avatar = event.data.avatar;
    if (!(avatar instanceof File) || !['image/png', 'image/jpeg', 'image/webp'].includes(avatar.type) || avatar.size > 7 * 1024 * 1024) {
      notify('请先在编导台选择有效角色图'); return;
    }
    if (event.data.voiceMode === 'volcengine-clone' && !/^[A-Za-z0-9_-]{2,128}$/u.test(String(event.data.speakerId || ''))) { notify('请先在操作台填写有效的火山 speaker_id'); return; }
    if (event.data.voiceMode === 'volcengine-tts2' && !/^[A-Za-z0-9_-]{2,256}$/u.test(String(event.data.speakerId || ''))) { notify('请先填写有效的火山合成 2.0 音色 ID'); return; }
    if (!['standard', 'volcengine-clone', 'volcengine-tts2'].includes(event.data.voiceMode)) { notify('音色来源无效'); return; }
    if (event.data.voiceMode === 'standard' && !['zh-CN-YunxiNeural', 'zh-CN-XiaoxiaoNeural'].includes(event.data.voice)) { notify('请选择可用音色'); return; }
    if (draft.script.trim() !== nextText) {
      try {
        if (draft.script.trim()) {
          const previousBackup = localStorage.getItem(BACKUP_KEY);
          if (previousBackup) localStorage.setItem(`${BACKUP_KEY}-archive-${Date.now()}`, previousBackup);
          localStorage.setItem(BACKUP_KEY, JSON.stringify(draft));
          $('#restore-draft').hidden = false;
        }
      } catch { notify('旧 B 草稿无法备份，本次启动已取消'); return; }
      draft.script = nextText;
      draft.scenes = [];
      draft.planSource = '';
      draft.approved = false;
      $('#script-input').value = nextText;
      $('#script-count').textContent = `${nextText.length} 字`;
    }
    pendingDirectorStart = false;
    setRole(Array.isArray(event.data.avatars) ? event.data.avatars : avatar);
    if (['segments', 'combined'].includes(event.data.generationMode)) {
      draft.renderMode = event.data.generationMode === 'combined' ? 'runninghub-combined' : 'runninghub';
    }
    draft.voice = event.data.voice;
    draft.voiceMode = event.data.voiceMode === 'volcengine-clone' ? 'clone' : event.data.voiceMode;
    draft.speechRate = Number.isInteger(event.data.speechRate) && event.data.speechRate >= -15 && event.data.speechRate <= 15 ? event.data.speechRate : 0;
    if (draft.voiceMode === 'volcengine-tts2') draft.tts2SpeakerId = String(event.data.speakerId);
    if (draft.voiceMode === 'clone') draft.speakerId = String(event.data.speakerId);
    $('#voice-select').value = draft.voice;
    $('#clone-speaker-id').value = draft.speakerId;
    $('#tts2-speaker-id').value = draft.tts2SpeakerId;
    setVoiceMode(draft.voiceMode, true);
    draft.background = ['keep', 'auto', 'green'].includes(event.data.background) ? event.data.background : 'keep';
    $('#background-select').value = draft.background;
    draft.backgroundVideoPath = typeof event.data.backgroundVideoPath === 'string' && event.data.backgroundVideoPath.length <= 1000
      ? event.data.backgroundVideoPath : null;
    draft.backgroundVideoMeta = draft.backgroundVideoPath && event.data.backgroundVideoMeta && typeof event.data.backgroundVideoMeta === 'object'
      ? {durationSeconds:String(event.data.backgroundVideoMeta.durationSeconds || ''), category:String(event.data.backgroundVideoMeta.category || '')} : null;
    renderBackgroundSelection();
    saveDraft();
    document.documentElement.classList.add('settings-in-director');
    go('inputs');
    startTalkcraft();
    return;
  }
  if (event.data?.type !== 'shotcraft-b-script') return;
  const text = typeof event.data.text === 'string' ? event.data.text.trim() : '';
  if (!text) { notify('编导台当前没有文案'); return; }
  if (draft.script.trim()) { notify('B 草稿已有文案，导入已取消'); return; }
  draft.script = text;
  draft.approved = false;
  $('#script-input').value = text;
  $('#script-count').textContent = `${text.length} 字`;
  saveDraft();
  notify('已从编导台导入文案');
});
$('#voice-select').onchange = (event) => { draft.voice = event.target.value; draft.approved = false; saveDraft(); };
$('#clone-speaker-id').oninput = (event) => { draft.speakerId = event.target.value.trim(); draft.approved = false; saveDraft(); renderReview(); };
$('#tts2-speaker-id').oninput = (event) => { draft.tts2SpeakerId = event.target.value.trim(); draft.approved = false; saveDraft(); renderReview(); };
$('#background-select').onchange = (event) => { draft.background = event.target.value; saveDraft(); };
function selectRenderMode(value) {
  draft.renderMode = ['runninghub', 'runninghub-combined'].includes(value) ? value : 'placeholder';
  saveDraft();
  renderReview();
}
$('#render-mode').onchange = (event) => selectRenderMode(event.target.value);
$('#generate-render-mode').onchange = (event) => selectRenderMode(event.target.value);
$('#background-library-toggle').onclick = () => {
  const picker = $('#background-library-picker');
  picker.hidden = !picker.hidden;
  if (!picker.hidden) searchBackgroundVideos();
};
$('#background-search-button').onclick = searchBackgroundVideos;
$('#background-search').oninput = () => {
  clearTimeout(backgroundSearchTimer);
  backgroundSearchTimer = setTimeout(searchBackgroundVideos, 250);
};
$('#background-search').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); searchBackgroundVideos(); } };
$('#background-remove').onclick = () => {
  draft.backgroundVideoPath = null;
  draft.backgroundVideoMeta = null;
  saveDraft();
  renderBackgroundSelection();
  renderReview();
};
document.querySelectorAll('[data-voice-mode]').forEach(button => button.onclick = () => setVoiceMode(button.dataset.voiceMode));
$('#choose-role').onclick = () => $('#role-file').click();
$('#remove-role').onclick = () => setRole(null);
$('#role-file').onchange = (event) => setRole([...event.target.files]);
$('#choose-clone').onclick = () => $('#clone-file').click();
$('#remove-clone').onclick = () => setClone(null);
$('#clone-file').onchange = (event) => setClone(event.target.files[0]);
$('#train-clone').onclick = trainCloneVoice;
$('#to-plan').onclick = () => {
  if (!draft.script.trim()) { notify('请先输入口播文案'); return; }
  if (!roleFile) { notify('请先选择一张角色图'); return; }
  if (!draft.scenes.length || draft.planSource !== draft.script.trim()) rebuildPlan();
  go('plan');
};
$('#start-talkcraft').onclick = startTalkcraft;
$('#rebuild-plan').onclick = rebuildPlan;
$('#match-videos').onclick = matchVideos;
$('#confirm-plan').onclick = () => {
  if (draft.planSource !== draft.script.trim()) { notify('文案已修改，请先重建分镜'); return; }
  if (draft.scenes.some(scene => scene.subject === 'pending')) { notify('请为每个句段选择镜头主体'); return; }
  if (!draft.scenes.some(scene => scene.subject === 'person')) { notify('B 模式至少需要一个数字人口播镜头'); return; }
  if (draft.scenes.some((scene, index) => index > 0 && scene.videoPath && scene.videoPath === draft.scenes[index - 1].videoPath)) {
    notify('相邻镜头不能使用同一视频素材，请替换或清除其中一个'); return;
  }
  draft.approved = true;
  saveDraft();
  go('generate');
};
$('#export-draft').onclick = exportDraft;
$('#run-placeholder').onclick = runPlaceholder;
$('#run-digital-human').onclick = runDigitalHuman;
$('#talkcraft-preflight').onclick = () => submitTalkcraftStage('preflight', '分镜预检');
$('#talkcraft-sample').onclick = () => submitTalkcraftStage('sample', '样板镜');
$('#talkcraft-approve').onclick = approveTalkcraft;
$('#talkcraft-render').onclick = () => submitTalkcraftStage('render-all', '整片渲染');
$('#talkcraft-qa').onclick = () => submitTalkcraftStage('qa', '机器质检');
$('#talkcraft-deliver').onclick = () => submitTalkcraftStage('deliver', '交付归一');
$('#talkcraft-workbench').onclick = async () => {
  if (!talkcraftRunId || talkcraftBusy) return;
  talkcraftBusy = true;
  const opened = window.open('', '_blank');
  try {
    const response = await fetch('/api/talkcraft/workbench', {method:'POST',
      headers:{'content-type':'application/json'}, body:JSON.stringify({runId:talkcraftRunId})});
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || '工作台启动失败');
    if (opened) opened.location.href = result.workbenchUrl;
    else window.open(result.workbenchUrl, '_blank', 'noopener');
    await refreshTalkcraft();
  } catch (error) { opened?.close(); notify(String(error.message || error)); }
  finally { talkcraftBusy = false; }
};
document.querySelectorAll('[data-go]').forEach(button => button.onclick = () => go(button.dataset.go));
document.querySelectorAll('[data-step]').forEach(button => button.onclick = () => go(button.dataset.step));
go(new URLSearchParams(location.search).get('review') === '1' ? 'results' : 'inputs');
refreshTalkcraft().catch(() => {});
const lastPlaceholderRun = localStorage.getItem('shotcraft-b-last-placeholder-run');
if (lastPlaceholderRun) showPlaceholderResult(lastPlaceholderRun).catch(() => localStorage.removeItem('shotcraft-b-last-placeholder-run'));
const lastDigitalHumanRun = localStorage.getItem('shotcraft-b-last-digital-human-run');
if (lastDigitalHumanRun) showDigitalHumanResult(lastDigitalHumanRun).catch(() => localStorage.removeItem('shotcraft-b-last-digital-human-run'));
fetch('/api/b-mode/digital-human/config', {cache:'no-store'}).then(response => response.json()).then(data => {
  digitalHumanConfigured = data?.configured === true;
  renderReview();
}).catch(() => { digitalHumanConfigured = false; renderReview(); });
fetch('/api/volcengine/voice/config', {cache:'no-store'}).then(response => response.json()).then(data => {
  volcengineConfigured = data?.synthesisConfigured === true;
  renderReview();
}).catch(() => { volcengineConfigured = false; renderReview(); });
if (document.documentElement.classList.contains('embedded')) {
  new ResizeObserver(reportHeight).observe(document.body);
  window.addEventListener('load', reportHeight);
  reportHeight();
  window.parent.postMessage({type:'shotcraft-b-ready'}, location.origin);
}
