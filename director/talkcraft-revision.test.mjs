import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {createTalkcraftRevision} from './talkcraft-revision.mjs';

const workspace = path.resolve('tmp');
const sourceRunId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('creates a new script and media project while preserving the source run', () => {
  mkdirSync(workspace, {recursive:true});
  const root = mkdtempSync(path.join(workspace, 'talkcraft-revision-test-'));
  try {
    const source = path.join(root, 'director', 'b-mode-runs', sourceRunId);
    mkdirSync(path.join(source, 'talkcraft', 'remotion', 'public', 'broll'), {recursive:true});
    writeFileSync(path.join(source, 'avatar.png'), 'avatar');
    writeFileSync(path.join(source, 'placeholder-report.json'), JSON.stringify({runId:sourceRunId, voice:'test-voice'}));
    writeFileSync(path.join(source, 'talkcraft', 'remotion', 'public', 'broll', 'phone.mp4'), 'phone');
    const scriptFile = path.join(root, 'revised.txt');
    writeFileSync(scriptFile, '第一句。第二句。\n');
    const result = createTalkcraftRevision(root, sourceRunId, scriptFile);
    assert.notEqual(result.runId, sourceRunId);
    assert.equal(result.sentences, 2);
    assert.deepEqual(JSON.parse(readFileSync(path.join(result.project, 'script.json'))).sentences,
      ['第一句。', '第二句。']);
    assert.equal(JSON.parse(readFileSync(path.join(result.project, 'source-run.json'))).visualTextLocale, 'zh-CN');
    assert.equal(readFileSync(path.join(source, 'avatar.png'), 'utf8'), 'avatar');
    assert.equal(existsSync(path.join(result.project, 'remotion', 'public', 'broll', 'phone.mp4')), true);
    assert.equal(existsSync(path.join(result.project, 'audio', 'full.mp3')), false);
  } finally {
    if (!root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(root, {recursive:true, force:true});
  }
});
