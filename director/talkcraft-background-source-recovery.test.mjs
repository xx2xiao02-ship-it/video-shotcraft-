import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {allocateUniqueBackgrounds} from './talkcraft-background-allocation.mjs';
import {assertExclusiveBackgrounds} from './talkcraft-background-exclusivity.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
function fixture(t, {source = 'original video', bound = source, sourceId = 'original-source'} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'background-source-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const project = path.join(root, 'project'), library = path.join(root, 'materials/_scenes');
  fs.mkdirSync(path.join(project, 'remotion/public/broll'), {recursive: true});
  fs.mkdirSync(library, {recursive: true});
  const index = [{path: 'original.mp4', sourceId, duration_sec: 12, tags: ['城市建筑']}];
  fs.writeFileSync(path.join(library, 'original.mp4'), source);
  fs.writeFileSync(path.join(project, 'remotion/public/broll/renamed.mp4'), bound);
  const shot = {id: 's22', firstSentence: 61, lastSentence: 62, start: 107.304, end: 111.65804,
    subject: 'person', shotCard: 'ink-underline', intent: '个人选择汇聚经济活动',
    templateParams: {cardProps: {line1Key: '个人小事', ink: '#ffffff', inkColor: '#b4d6ff'},
      materialRole: '背景素材', materialSrc: 'broll/renamed.mp4', materialQuery: '城市生活',
      materialMatchReason: '原编导明确选定的城市生活背景', backgroundPresentation: 'text-video-v1'}};
  const file = path.join(project, 'remotion/shots.json');
  const writeIndex = () => fs.writeFileSync(path.join(root, 'materials/_index.json'), JSON.stringify(index));
  const writeShots = (shots = [shot]) => fs.writeFileSync(file, JSON.stringify(shots));
  const readShots = () => JSON.parse(fs.readFileSync(file));
  writeIndex(); writeShots();
  return {root, project, library, index, shot, file, writeIndex, writeShots, readShots};
}

test('06按完整源文件哈希恢复缺失身份，保留原卡、原视频、匹配理由与切镜', t => {
  const f = fixture(t), before = structuredClone(f.shot), video = path.join(f.project, 'remotion/public/broll/renamed.mp4');
  const result = allocateUniqueBackgrounds(f.root, f.project), actual = f.readShots()[0];
  assert.equal(result.assigned, 0); assert.deepEqual(result.unresolved, []);
  assert.deepEqual({...actual, templateParams: before.templateParams}, {...before, templateParams: before.templateParams});
  for (const key of ['cardProps', 'materialSrc', 'materialMatchReason', 'materialQuery', 'backgroundPresentation'])
    assert.deepEqual(actual.templateParams[key], before.templateParams[key]);
  assert.equal(actual.templateParams.materialSourceId, 'original-source');
  assert.equal(actual.templateParams.materialSha256, sha('original video'));
  assert.equal(fs.readFileSync(video, 'utf8'), 'original video');
  assert.equal(assertExclusiveBackgrounds(f.project, [actual]).exclusive, true);
  const audit = JSON.parse(fs.readFileSync(path.join(f.project, 'qa/background-source-recovery.json')));
  assert.equal(audit.recovered[0].sourcePath, fs.realpathSync(path.join(f.library, 'original.mp4')));
  assert.equal(audit.recovered[0].evidence, 'exact-local-library-sha256'); assert.equal(audit.paidCalls, 0);
  const bytes = fs.readFileSync(f.file); allocateUniqueBackgrounds(f.root, f.project); assert.deepEqual(fs.readFileSync(f.file), bytes);
});

test('同名同大小但不同内容不能恢复，也不能调用匹配器换成别的视频', t => {
  const f = fixture(t, {source: 'video A', bound: 'video B'});
  // A generic query previously caused automatic replacement. A bound file
  // with missing provenance must instead retain its bytes and stay blocked.
  f.shot.templateParams.materialQuery = '按已有口播语义绑定'; f.writeShots();
  const out = allocateUniqueBackgrounds(f.root, f.project);
  assert.equal(out.assigned, 0); assert.equal(out.unresolved[0].code, 'BACKGROUND_SOURCE_RECOVERY_REJECTED');
  assert.equal(f.readShots()[0].templateParams.materialSourceId, undefined);
  assert.equal(f.readShots()[0].templateParams.materialSrc, 'broll/renamed.mp4');
  assert.throws(() => assertExclusiveBackgrounds(f.project, f.readShots()), /缺少原始素材身份/);
});

test('原绑定或素材索引的完整哈希冲突仍阻断，不覆盖冲突记录', t => {
  const f = fixture(t); f.shot.templateParams.materialSha256 = 'wrong'; f.writeShots();
  assert.match(allocateUniqueBackgrounds(f.root, f.project).unresolved[0].reason, /原绑定哈希冲突/);
  assert.equal(f.readShots()[0].templateParams.materialSha256, 'wrong');
  delete f.shot.templateParams.materialSha256; f.writeShots(); f.index[0].sha256 = 'wrong'; f.writeIndex();
  assert.match(allocateUniqueBackgrounds(f.root, f.project).unresolved[0].reason, /索引哈希/);
  assert.equal(f.readShots()[0].templateParams.materialSourceId, undefined);
});

test('同内容多个来源身份有歧义时拒绝，不按索引第一项选来源', t => {
  const f = fixture(t); fs.copyFileSync(path.join(f.library, 'original.mp4'), path.join(f.library, 'other.mp4'));
  f.index.push({...f.index[0], path: 'other.mp4', sourceId: 'different-origin'}); f.writeIndex();
  const out = allocateUniqueBackgrounds(f.root, f.project);
  assert.match(out.unresolved[0].reason, /多个原始素材身份/);
  assert.equal(f.readShots()[0].templateParams.materialSourceId, undefined);
});

test('本片文件没有素材库原件时不能用自身或文件名哈希当来源', t => {
  const f = fixture(t); f.index.splice(0); f.writeIndex();
  const out = allocateUniqueBackgrounds(f.root, f.project);
  assert.equal(out.assigned, 0); assert.match(out.unresolved[0].reason, /无完整哈希一致/);
});

test('越界路径与丢失视频均保留阻断，不搜索补位', t => {
  const f = fixture(t);
  for (const src of ['../../input.mp4', 'missing.mp4', 'https://example.invalid/a.mp4']) {
    f.shot.templateParams.materialSrc = src; f.writeShots();
    const out = allocateUniqueBackgrounds(f.root, f.project);
    assert.equal(out.assigned, 0); assert.equal(out.unresolved.length, 1);
    assert.equal(f.readShots()[0].templateParams.materialSrc, src);
  }
});

test('恢复来源后仍执行全片排他校验，改名相同内容不能冒充两个背景', t => {
  const f = fixture(t), another = structuredClone(f.shot); another.id = 's23'; another.templateParams.materialSrc = 'broll/copy.mp4';
  fs.copyFileSync(path.join(f.project, 'remotion/public/broll/renamed.mp4'), path.join(f.project, 'remotion/public/broll/copy.mp4'));
  f.writeShots([f.shot, another]); allocateUniqueBackgrounds(f.root, f.project);
  assert.throws(() => assertExclusiveBackgrounds(f.project, f.readShots()), /唯一排他/);
});
