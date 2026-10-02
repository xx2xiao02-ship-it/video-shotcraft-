import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';

const html = readFileSync(new URL('./console-ui.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('async function apiFetch('), html.indexOf('const PANEL_ORDER'));
function client(fetch) {
  const context = vm.createContext({fetch});
  vm.runInContext(source, context);
  return context.apiFetch;
}

test('production writes and polling reject network failure instead of returning sample success', async () => {
  const api = client(async () => { throw new Error('offline'); });
  for (const url of ['/api/render/confirm', '/api/storyboard/save', '/api/script/save', '/api/task?id=4', '/api/state']) {
    await assert.rejects(api(url, {method: url.includes('save') || url.includes('confirm') ? 'POST' : 'GET'}), /offline/);
  }
});

test('HTTP errors cannot become success, even if their body claims success', async () => {
  for (const body of [{ok: true}, {}, null]) {
    const api = client(async () => ({ok: false, status: 503, headers: {get: () => 'application/json'}, json: async () => body}));
    await assert.rejects(api('/api/render/confirm'), /HTTP 503/);
  }
  const api = client(async () => ({ok: false, status: 502, headers: {get: () => 'text/html'}}));
  await assert.rejects(api('/api/state'), /HTTP 502/);
});

test('real success and structured business errors retain their contracts', async () => {
  for (const [ok, body] of [[true, {ok: true, id: 91}], [false, {ok: false, error: '任务不存在'}]]) {
    const api = client(async () => ({ok, status: ok ? 200 : 404, headers: {get: () => 'application/json'}, json: async () => body}));
    assert.equal(await api('/api/task?id=91'), body);
  }
});

test('invalid success JSON rejects rather than using sample data', async () => {
  const api = client(async () => ({ok: true, json: async () => { throw new SyntaxError('invalid JSON'); }}));
  await assert.rejects(api('/api/state'), /invalid JSON/);
});

test('retired rule-director flag exits before reading inputs or starting paid stages', () => {
  const result = spawnSync(process.execPath, ['director/b-mode-placeholder.mjs', '00000000-0000-0000-0000-000000000000', '--talkcraft'], {encoding: 'utf8'});
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /旧 --talkcraft 规则编导已退役/);
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
});

test('preserved baseline entry still loads all imports and validates inputs', () => {
  const result = spawnSync(process.execPath, ['director/b-mode-placeholder.mjs', '00000000-0000-0000-0000-000000000000'], {encoding: 'utf8'});
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /占位测试输入不完整/);
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
});
