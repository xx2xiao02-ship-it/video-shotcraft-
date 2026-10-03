import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

if (!process.argv.includes('--record-reviewed')) {
  throw new Error('先检查第17批真实横竖编码后帧，再使用 --record-reviewed 记录本地审核');
}

const root = path.resolve(import.meta.dirname, '..');
const batch = 'card-business-text-batch017-v2';
const folder = `template/out/${batch}`;
const reportFile = `${folder}/acceptance.json`;
const fixtureFile = 'template/fixtures/card-business-text-batch017-v2.json';
const read = file => JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, file))).digest('hex');

function evidence(file, expected) {
  const absolute = path.resolve(root, file);
  assert.ok(absolute.startsWith(`${root}${path.sep}`), `证据路径越界：${file}`);
  assert.ok(fs.existsSync(absolute), `缺少证据：${file}`);
  assert.equal(hash(file), expected, `证据哈希不一致：${file}`);
}

const report = read(reportFile);
const fixture = read(fixtureFile);
assert.equal(report.schema, 'business-data-card-batch-acceptance-v1');
assert.equal(report.fixtureFile, fixtureFile);
assert.equal(report.sourceConsistency, true);
assert.equal(report.fps, fixture.fps);
assert.equal(report.durationInFrames, fixture.durationInFrames);
assert.equal(report.cases.length, fixture.cards.length * fixture.aspects.length);

for (const [source, expected] of Object.entries(report.sourceHashes || {})) evidence(source, expected);
const seen = new Set();
for (const item of report.cases) {
  assert.ok(fixture.cards.some(card => card.id === item.card), `未知卡片：${item.card}`);
  assert.ok(fixture.aspects.includes(item.aspect), `未知画幅：${item.aspect}`);
  const key = `${item.card}|${item.aspect}`;
  assert.equal(seen.has(key), false, `重复案例：${key}`);
  seen.add(key);
  assert.equal(item.error, undefined, `${key} 仍有渲染错误`);
  assert.equal(item.resolvedCard, item.card);
  assert.equal(item.componentId, item.card);
  assert.equal(item.directorConsumption, 'passed-authored-plan');
  evidence(item.propsFile, item.propsSha256);
  evidence(item.componentPropsFile, item.componentPropsSha256);
  evidence(item.nativeDefault.file, item.nativeDefault.sha256);
  assert.equal(item.nativeDefault.resolvedCard, item.card);
  assert.equal(item.samples.length, 4);
  for (const sample of item.samples) evidence(sample.file, sample.sha256);
  assert.equal(item.video.fullDecodePassed, true);
  assert.equal(item.video.stream.r_frame_rate, '30/1');
  assert.equal(Number(item.video.stream.nb_frames), fixture.durationInFrames);
  assert.deepEqual(
    {width: item.video.stream.width, height: item.video.stream.height},
    item.aspect === '16:9' ? {width: 1920, height: 1080} : {width: 1080, height: 1920},
  );
  evidence(item.video.file, item.video.sha256);
  const index = fixture.cards.findIndex(card => card.id === item.card);
  const suffix = item.aspect === '9:16' ? 'portrait' : 'landscape';
  const decodedVideoReview = [60, 179].map(frame => {
    const file = `${folder}/decoded-${index}-${suffix}-f${frame}.png`;
    return {file, frame, sha256: hash(file)};
  });
  for (const sample of decodedVideoReview) evidence(sample.file, sample.sha256);
  item.decodedVideoReview = decodedVideoReview;
}
assert.equal(seen.size, report.cases.length);
report.localVisualReview = 'passed-encoded-mp4-frames';
report.reviewedRuntimeIds = fixture.cards.map(card => card.id);
report.reviewer = 'Codex: all 8 encoded MP4 cases inspected at f60 and f179 in landscape and portrait';
report.reviewEvidence = {encodedFrames: [60, 179], cases: report.cases.length, reviewedAt: new Date().toISOString()};
fs.writeFileSync(path.resolve(root, reportFile), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({batch, cards: fixture.cards.length, cases: report.cases.length, localVisualReview: report.localVisualReview}));
