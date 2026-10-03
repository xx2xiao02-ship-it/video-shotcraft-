import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'template/package.json'));
const ts = require('typescript');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, file))).digest('hex');
const read = file => JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
const admissionFile = 'director/numeric-card-current-long-admission.json';
const reportFile = 'template/out/card-business-data-batch014-current-long-20261003/compatibility.json';
const admission = read(admissionFile);
const report = read(reportFile);
assert.equal(admission.schema, 'numeric-card-production-admission-v1');
assert.equal(admission.localReview, 'passed');
assert.deepEqual(admission.cards, ['data/counter-confetti', 'data/odometer-digit-roll']);
assert.equal(report.schema, 'numeric-card-current-long-compatibility-v1');
assert.equal(report.localVisualReview, 'passed-current-runtime-180-frame');
assert.equal(report.cases.length, 4);

for (const item of report.cases) {
  assert.equal(hash(item.video), item.sha256, `视频证据哈希不一致：${item.video}`);
  assert.equal(item.fullDecodePassed, true);
  for (const sample of item.samples || []) assert.equal(hash(sample.file), sample.sha256, `样帧证据哈希不一致：${sample.file}`);
}

const adapterSource = fs.readFileSync(path.join(root, 'template/src/TemplateAdapter.tsx'), 'utf8');
const adapterJs = ts.transpileModule(adapterSource, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const adapterExports = {};
new Function('require', 'exports', adapterJs)(createRequire(path.join(root, 'template/src/TemplateAdapter.tsx')), adapterExports);

for (const item of report.cases) {
  const selected = item.selectedProps;
  assert.equal(selected.shotCard, item.card);
  const shot = {
    shotCard: selected.shotCard,
    durationInFrames: selected.durationInFrames,
    templateParams: selected.templateParams,
    displayLines: selected.displayLines,
    lines: selected.displayLines,
    text: item.params.evidence,
    narration: item.params.evidence,
  };
  const translated = adapterExports.translateShot(item.card, shot);
  for (const key of ['value', 'unit', 'label', 'title', 'durationInFrames'])
    assert.deepEqual(translated[key], item.adapterProps[key], `${item.card}/${item.aspect} 当前适配器 props 不一致：${key}`);
}

const currentSourceHashes = Object.fromEntries(Object.entries(admission.sourceHashes).map(([file, expected]) => {
  const actual = hash(file);
  assert.ok(actual, `缺少来源：${file}`);
  if (actual !== expected && file !== 'template/src/TemplateAdapter.tsx')
    throw new Error(`存在未核对的来源漂移：${file}`);
  return [file, actual];
}));
assert.notEqual(currentSourceHashes['template/src/TemplateAdapter.tsx'], admission.sourceHashes['template/src/TemplateAdapter.tsx']);

const backup = `docs/audits/numeric-card-current-long-admission-before-static-revalidation-${admission.sourceHashes['template/src/TemplateAdapter.tsx'].slice(0, 12)}.json`;
if (!fs.existsSync(path.resolve(root, backup))) fs.writeFileSync(path.resolve(root, backup), JSON.stringify(admission, null, 2) + '\n');
admission.sourceHashes = currentSourceHashes;
admission.reportSha256 = hash(reportFile);
admission.evidence = report.cases.map(item => ({
  card: item.card,
  aspect: item.aspect,
  file: item.video,
  sha256: item.sha256,
  stream: item.stream,
  fullDecodePassed: item.fullDecodePassed,
  review: item.samples,
}));
admission.sourceRevalidation = {
  kind: 'current-runtime-static-props',
  sharedSource: 'template/src/TemplateAdapter.tsx',
  previousSha256: admission.sourceRevalidation?.previousSha256 || JSON.parse(fs.readFileSync(path.resolve(root, backup), 'utf8')).sourceHashes['template/src/TemplateAdapter.tsx'],
  currentSha256: currentSourceHashes['template/src/TemplateAdapter.tsx'],
  cases: report.cases.length,
  verifiedAt: new Date().toISOString(),
};
fs.writeFileSync(path.resolve(root, admissionFile), JSON.stringify(admission, null, 2) + '\n');
console.log(JSON.stringify({cards: admission.cards, cases: report.cases.length, source: admission.sourceRevalidation}));
