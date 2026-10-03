import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {bindTextCardSources} from './text-card-source-binding.mjs';

if (!process.argv.includes('--record-reviewed')) {
  throw new Error('先完成编码后帧复核，再使用 --record-reviewed 记录第18批准入');
}

const root = path.resolve(import.meta.dirname, '..');
const batch = 'card-business-text-batch018-v3';
const reportFile = `template/out/${batch}/acceptance.json`;
const fixtureFile = `template/fixtures/${batch}.json`;
const outputFile = 'director/text-card-production-admission.json';
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
assert.equal(report.localVisualReview, 'passed-encoded-mp4-frames');
assert.equal(report.fps, 30);
assert.equal(report.durationInFrames, 180);
assert.equal(report.cases.length, fixture.cards.length * fixture.aspects.length);

for (const [source, expected] of Object.entries(report.sourceHashes || {})) evidence(source, expected);
const seen = new Set();
for (const item of report.cases) {
  const input = fixture.cards.find(card => card.id === item.card);
  assert.ok(input, `未知卡片：${item.card}`);
  assert.ok(fixture.aspects.includes(item.aspect), `未知画幅：${item.aspect}`);
  const key = `${item.card}|${item.aspect}`;
  assert.equal(seen.has(key), false, `重复案例：${key}`);
  seen.add(key);
  assert.equal(item.error, undefined);
  assert.equal(item.resolvedCard, item.card);
  assert.equal(item.componentId, item.card);
  assert.equal(item.directorConsumption, 'passed-authored-plan');
  assert.deepEqual(item.lines, input.lines);
  assert.equal(item.samples.length, input.inspectFrames.length);
  assert.deepEqual(item.samples.map(sample => sample.frame), input.inspectFrames);
  evidence(item.propsFile, item.propsSha256);
  evidence(item.componentPropsFile, item.componentPropsSha256);
  evidence(item.nativeDefault.file, item.nativeDefault.sha256);
  assert.equal(item.nativeDefault.resolvedCard, item.card);
  const props = read(item.propsFile);
  assert.equal(props.storyboard.mode, 'A');
  assert.equal(props.storyboard.shots[0].shotCard, item.card);
  assert.deepEqual(props.storyboard.shots[0].displayLines, input.lines);
  assert.equal(props.storyboard.shots[0].durationInFrames, fixture.durationInFrames);
  for (const sample of item.samples) evidence(sample.file, sample.sha256);
  assert.equal(item.video.fullDecodePassed, true);
  assert.equal(item.video.stream.r_frame_rate, '30/1');
  assert.equal(Number(item.video.stream.nb_frames), fixture.durationInFrames);
  assert.deepEqual(
    {width: item.video.stream.width, height: item.video.stream.height},
    item.aspect === '16:9' ? {width: 1920, height: 1080} : {width: 1080, height: 1920},
  );
  evidence(item.video.file, item.video.sha256);
  assert.equal(item.decodedVideoReview.length, 2);
  for (const sample of item.decodedVideoReview) evidence(sample.file, sample.sha256);
}
assert.equal(seen.size, report.cases.length);

const prior = fs.existsSync(path.resolve(root, outputFile)) ? read(outputFile) : null;
const componentSources = new Set(report.cases.map(item => item.source));
const cards = fixture.cards.map(input => {
  const cases = report.cases.filter(item => item.card === input.id);
  assert.equal(cases.length, 2);
  const source = cases[0].source;
  const sourceHashes = Object.fromEntries(
    Object.entries(report.sourceHashes).filter(([file]) => !componentSources.has(file) || file === source),
  );
  const card = {
    id: input.id,
    source,
    sourceHashes,
    localReview: 'passed',
    acceptedFrames: [fixture.durationInFrames],
    fps: fixture.fps,
    scope: `tested authored business fixture at ${fixture.durationInFrames} frames/${fixture.fps}fps; no short admission or paid-model acceptance`,
    validatedLines: input.lines,
    report: reportFile,
    reportSha256: hash(reportFile),
    evidence: cases.map(item => ({aspect: item.aspect, file: item.video.file, sha256: item.video.sha256})),
    actualModelValidated: false,
    userAcceptance: 'pending',
    shortVersion: 'not-accepted',
  };
  card.sourceBinding = bindTextCardSources(root, card.id, card.sourceHashes);
  return card;
});

const replaced = new Set(cards.map(card => card.id));
const history = [...(prior?.history || [])];
if (prior) history.push({cards: prior.cards.filter(card => replaced.has(card.id)), supersededBy: reportFile});
const merged = [...(prior?.cards || []).filter(card => !replaced.has(card.id)), ...cards];
fs.writeFileSync(path.resolve(root, outputFile), JSON.stringify({schema: 'native-business-text-admission-v1', cards: merged, history}, null, 2) + '\n');
console.log(JSON.stringify({batch, newCards: cards.length, newRuntimeVariants: cards.length, totalCards: merged.length, output: outputFile}));
