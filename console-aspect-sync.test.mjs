import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./console-ui.html', import.meta.url), 'utf8');
function harness(save = async theme => ({ok:true, theme})) {
  const video = ['16:9', '9:16'].map(videoAspect => ({dataset:{videoAspect}, setAttribute(key, value) {this[key] = value;}}));
  const subtitles = ['horizontal', 'vertical'].map(subtitleFormat => ({dataset:{subtitleFormat}, setAttribute(key, value) {this[key] = value;}}));
  const elements = {};
  const rendered = [];
  const requests = [];
  const context = vm.createContext({
    currentTheme:{aspectRatio:'16:9'}, activeSubtitleFormat:'horizontal',
    VIDEO_THEME_PROFILES:{'knowledge-explainer':{label:'知识', categories:[], cards:[]}},
    document:{querySelectorAll:selector => selector.includes(',') ? [...video, ...subtitles] : selector.includes('data-video-aspect') ? video : subtitles},
    $:selector => elements[selector] ||= {}, showToast:() => {}, userErrorMessage:error => error.message,
    renderSubtitleSettings:() => {
      const format = vm.runInContext('activeSubtitleFormat', context);
      rendered.push(format);
      for (const button of subtitles) button.setAttribute('aria-pressed', String(button.dataset.subtitleFormat === format));
    },
    postVideoThemeToDirector:() => {},
    apiFetch:async (_url, options) => {const theme = JSON.parse(options.body); requests.push(theme); return save(theme);},
  });
  vm.runInContext(html.slice(html.indexOf('function renderThemeStrategy(theme)'), html.indexOf('function applyVideoThemeProfile')), context);
  vm.runInContext(html.slice(html.indexOf('let videoAspectSaving = false;'), html.indexOf('\nfunction renderThemeGrid')), context);
  vm.runInContext(html.slice(html.indexOf('document.querySelectorAll(".subtitle-format-tabs button").forEach(button => {'), html.indexOf('\nconst subtitleGrid')), context);
  vm.runInContext(html.slice(html.indexOf("document.querySelectorAll('[data-video-aspect]').forEach(button => {", html.indexOf('$("#reset-theme")')), html.indexOf('\n', html.indexOf('});', html.indexOf("document.querySelectorAll('[data-video-aspect]').forEach(button => {", html.indexOf('$("#reset-theme")')))) + 1), context);
  return {context, video, subtitles, rendered, requests};
}

test('loading saved portrait selects both controls and subtitle preview format', () => {
  const h = harness();
  vm.runInContext("renderThemeStrategy({aspectRatio:'9:16'})", h.context);
  assert.equal(h.video[1]['aria-pressed'], 'true');
  assert.equal(h.subtitles[1]['aria-pressed'], 'true');
  assert.equal(h.rendered.at(-1), 'vertical');
});

test('either aspect selector saves the same theme state and synchronizes both controls', async () => {
  const h = harness();
  await h.video[1].onclick();
  assert.equal(h.subtitles[1]['aria-pressed'], 'true');
  h.subtitles[0].onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.video[0]['aria-pressed'], 'true');
  assert.equal(h.subtitles[0]['aria-pressed'], 'true');
  assert.deepEqual(h.requests.map(theme => theme.aspectRatio), ['9:16', '16:9']);
});

test('failed save rolls back both selectors and blocks conflicting clicks during save', async () => {
  let reject;
  const h = harness(() => new Promise((_resolve, rejectSave) => {reject = rejectSave;}));
  const pending = h.video[1].onclick();
  assert.equal(h.subtitles[1]['aria-pressed'], 'true');
  assert.ok(h.subtitles.every(button => button.disabled));
  await h.video[0].onclick();
  assert.equal(h.requests.length, 1);
  reject(new Error('保存失败'));
  await pending;
  assert.equal(h.video[0]['aria-pressed'], 'true');
  assert.equal(h.subtitles[0]['aria-pressed'], 'true');
  assert.ok(h.subtitles.every(button => !button.disabled));
});
