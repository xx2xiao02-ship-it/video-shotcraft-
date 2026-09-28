const params = new URLSearchParams(location.search);
const runId = params.get('id') || '';
const video = document.querySelector('#source-video');
const canvas = document.querySelector('#frame');
const ctx = canvas.getContext('2d', {alpha:false, willReadFrequently:false});
const poster = document.querySelector('#poster');
const playButton = document.querySelector('#play');
const progress = document.querySelector('#progress');
const time = document.querySelector('#time');
const volume = document.querySelector('#volume');
const status = document.querySelector('#status');
let drawing = false;
let audioContext = null;
let audioBuffer = null;
let audioBytesPromise = null;
let gainNode = null;
let source = null;
let playing = false;
let pausedOffset = 0;
let startContextTime = 0;
let playbackToken = 0;

function formatTime(seconds) {
  const total = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function audioTime() {
  return playing ? Math.min(audioBuffer.duration, audioContext.currentTime - startContextTime) : pausedOffset;
}

function updateControls() {
  const duration = audioBuffer?.duration || 0;
  time.textContent = `${formatTime(audioTime())} / ${formatTime(duration)}`;
  progress.value = duration ? String(Math.round(audioTime() / duration * 1000)) : '0';
  playButton.textContent = playing ? '暂停' : pausedOffset >= duration && duration ? '重播' : '播放';
}

function drawFrame() {
  if (video.readyState < 2) return;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (video.currentTime > 0.2) poster.hidden = true;
  } catch {
    status.textContent = '画面解码失败，可下载 MP4 在 Windows 播放器查看。';
  }
}

function scheduleDraw() {
  if (drawing || !playing || video.paused || video.ended) return;
  drawing = true;
  const next = () => {
    drawing = false;
    drawFrame();
    scheduleDraw();
  };
  if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(next);
  else requestAnimationFrame(next);
}

function syncVideo(force = false) {
  if (video.readyState < 2 || !audioBuffer) return;
  const target = Math.min(audioTime(), Math.max(0, video.duration - 0.04));
  if (force || Math.abs(video.currentTime - target) > 0.25) {
    video.currentTime = target;
  }
}

function stopAudio() {
  playbackToken++;
  if (source) {
    source.onended = null;
    try { source.stop(); } catch {}
    source.disconnect();
    source = null;
  }
  playing = false;
  video.pause();
}

async function prepareAudio() {
  if (!window.AudioContext && !window.webkitAudioContext) throw new Error('浏览器不支持配音播放');
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  await audioContext.resume();
  if (!audioBuffer) {
    const bytes = await audioBytesPromise;
    audioBuffer = await audioContext.decodeAudioData(bytes);
    gainNode = audioContext.createGain();
    gainNode.gain.value = Number(volume.value) / 100;
    gainNode.connect(audioContext.destination);
  }
}

function tick(token) {
  if (!playing || token !== playbackToken) return;
  syncVideo();
  updateControls();
  requestAnimationFrame(() => tick(token));
}

function startAudio(offset) {
  const token = ++playbackToken;
  source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(gainNode);
  source.onended = () => {
    if (token !== playbackToken) return;
    source.disconnect();
    source = null;
    playing = false;
    pausedOffset = audioBuffer.duration;
    video.pause();
    syncVideo(true);
    drawFrame();
    updateControls();
    status.textContent = '播放结束，可重播或下载。';
  };
  pausedOffset = offset;
  startContextTime = audioContext.currentTime - offset;
  playing = true;
  syncVideo(true);
  source.start(0, offset);
  video.play().then(scheduleDraw).catch(() => { status.textContent = '配音正在播放，画面未能同步；请下载 MP4 查看。'; });
  status.textContent = '配音播放中';
  tick(token);
  updateControls();
}

async function togglePlayback() {
  if (playing) {
    pausedOffset = audioTime();
    stopAudio();
    updateControls();
    return;
  }
  try {
    await prepareAudio();
    if (pausedOffset >= audioBuffer.duration - 0.02) pausedOffset = 0;
    status.textContent = '';
    startAudio(pausedOffset);
  } catch {
    status.textContent = '浏览器未能播放配音，请下载 MP4 在 Windows 播放器查看。';
  }
}

if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId)) {
  status.textContent = '样片地址无效。';
  playButton.disabled = true;
} else {
  const base = `/director/b-mode-runs/${encodeURIComponent(runId)}/`;
  video.src = `/api/b-mode/placeholder/video?id=${encodeURIComponent(runId)}`;
  video.muted = true;
  audioBytesPromise = fetch(`/api/b-mode/placeholder/audio?id=${encodeURIComponent(runId)}`).then(response => {
    if (!response.ok) throw new Error('配音文件不可用');
    return response.arrayBuffer();
  });
  poster.src = base + 'placeholder-poster.jpg';
  document.querySelector('#download').href = video.src;
  document.querySelector('#audio-download').href = `/api/b-mode/placeholder/audio?id=${encodeURIComponent(runId)}`;
  fetch(base + 'placeholder-report.json').then(response => response.ok ? response.json() : null).then(report => {
    if (report?.kind === 'talkcraft-card-preview') {
      document.querySelector('#meta').textContent = `${Number(report.renderedSeconds).toFixed(1)} 秒 · TalkCraft 卡片驱动 · ${report.cardsUnique?.length || 0} 张卡 · 非数字人`;
      time.textContent = `0:00 / ${formatTime(report.audioSeconds)}`;
    } else if (report?.kind === 'baseline-b-mode-preview') {
      document.querySelector('#meta').textContent = `${Number(report.renderedSeconds).toFixed(1)} 秒 · B 模式增量基线 · 非数字人 · 无口型`;
      time.textContent = `0:00 / ${formatTime(report.audioSeconds)}`;
    } else if (report?.kind === 'static-avatar-placeholder') {
      document.querySelector('#meta').textContent = `${Number(report.renderedSeconds).toFixed(1)} 秒 · 静态角色图 · 非数字人 · 无口型`;
      time.textContent = `0:00 / ${formatTime(report.audioSeconds)}`;
    }
  }).catch(() => {});
}

video.addEventListener('seeked', drawFrame);
video.addEventListener('error', () => { status.textContent = '视频加载失败，请检查服务或下载 MP4。'; });
playButton.onclick = togglePlayback;
canvas.onclick = togglePlayback;
canvas.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePlayback(); } };
progress.oninput = () => {
  if (!audioBuffer) return;
  const offset = Number(progress.value) / 1000 * audioBuffer.duration;
  const wasPlaying = playing;
  stopAudio();
  pausedOffset = offset;
  syncVideo(true);
  if (wasPlaying && offset < audioBuffer.duration - 0.02) startAudio(offset);
  else updateControls();
};
volume.oninput = () => { if (gainNode) gainNode.gain.value = Number(volume.value) / 100; };
