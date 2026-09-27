// 视频外包装 - 最新成片去重逻辑回归测试：做过封面的成片必须能被识别并跳过。
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {matchRunMeta, bModeRunDirFromVideo} from './packaging-routes.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.join(DIR, 'packaging-runs');
const VIDEO = 'E:\\video-shotcraft\\template\\out\\dynamic.mp4';
const MTIME = 1735400000000;

test('matchRunMeta requires same path and tolerates small mtime drift', () => {
  assert.equal(matchRunMeta({video:VIDEO, videoMtimeMs:MTIME}, VIDEO, MTIME), true);
  assert.equal(matchRunMeta({video:VIDEO, videoMtimeMs:MTIME}, VIDEO, MTIME + 1), true);
  assert.equal(matchRunMeta({video:VIDEO, videoMtimeMs:MTIME}, VIDEO, MTIME + 5000), false, '重新渲染后应视为新成片');
  assert.equal(matchRunMeta({video:VIDEO, videoMtimeMs:MTIME}, 'E:\\other.mp4', MTIME), false);
  assert.equal(matchRunMeta(null, VIDEO, MTIME), false);
});

test('legacy runs without mtime still match by path', () => {
  assert.equal(matchRunMeta({video:VIDEO}, VIDEO, MTIME), true);
});

test('bModeRunDirFromVideo extracts the owning b-mode run from any slash style', () => {
  const win = bModeRunDirFromVideo('E:\\video-shotcraft\\director\\b-mode-runs\\feaeb277-9c7d-4ff5-97e0-4cd2969b1d87\\talkcraft\\remotion\\out\\final.mp4');
  assert.ok(win && win.toLowerCase().endsWith('b-mode-runs\\feaeb277-9c7d-4ff5-97e0-4cd2969b1d87'));
  const unix = bModeRunDirFromVideo('E:/video-shotcraft/director/b-mode-runs/feaeb277-9c7d-4ff5-97e0-4cd2969b1d87/talkcraft/remotion/out/final.mp4');
  assert.ok(unix && unix.toLowerCase().endsWith('b-mode-runs\\feaeb277-9c7d-4ff5-97e0-4cd2969b1d87'));
  assert.equal(bModeRunDirFromVideo('E:\\video-shotcraft\\template\\out\\dynamic.mp4'), null);
});

test('a finished cover artifact satisfies the done check via real run dir', () => {
  const runDir = path.join(RUNS_DIR, 'dedupe-test-run');
  mkdirSync(runDir, {recursive:true});
  writeFileSync(path.join(runDir, 'meta.json'), JSON.stringify({video:VIDEO, videoMtimeMs:MTIME}), 'utf8');
  writeFileSync(path.join(runDir, 'cover-16x9.jpg'), Buffer.from([0xff, 0xd8]));
  const meta = JSON.parse(readFileSync(path.join(runDir, 'meta.json'), 'utf8'));
  assert.equal(matchRunMeta(meta, VIDEO, MTIME), true);
  assert.ok(existsSync(path.join(runDir, 'cover-16x9.jpg')));
});
