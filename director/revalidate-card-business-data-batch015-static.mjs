import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const evidenceRoot = path.join(root, '.isolated/card-governance-batch-015-worktree');
const previousReportFile = 'template/out/card-business-data-batch015-v3/acceptance.json';
const compatibilityFile = 'template/out/card-business-data-batch015-compatibility-20261003-r6/compatibility.json';
const proofFile = 'template/out/card-business-data-batch015-static-revalidation-20261003.json';
const admissionFile = path.join(root, 'director/business-data-batch015-admission.json');
const write = process.argv.includes('--record');
const readAt = (base, relative) => JSON.parse(fs.readFileSync(path.resolve(base, relative), 'utf8'));
const read = relative => readAt(root, relative);
const hashAt = (base, relative) => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(base, relative))).digest('hex');
const hash = relative => hashAt(root, relative);

const previousReport = readAt(evidenceRoot, previousReportFile);
const priorCompatibility = read(compatibilityFile);
assert.equal(previousReport.schema, 'business-data-card-batch-acceptance-v1');
assert.equal(previousReport.localVisualReview, 'passed-encoded-mp4-frames');
assert.equal(previousReport.cases.length, 16);
assert.equal(priorCompatibility.status, 'passed');
assert.deepEqual(priorCompatibility.summary, {
  cases: 16,
  propsExact: 16,
  compositionExact: 16,
  decodedVideos: 16,
  pixelComparisons: 32,
  pixelIdentical: 32,
});

const templateRequire = createRequire(path.join(root, 'template/package.json'));
const ts = templateRequire('typescript');
const adapterFile = path.join(root, 'template/src/TemplateAdapter.tsx');
const adapterJs = ts.transpileModule(fs.readFileSync(adapterFile, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const adapterExports = {};
new Function('require', 'exports', adapterJs)(createRequire(adapterFile), adapterExports);

function evidence(relative, expected) {
  assert.equal(hashAt(evidenceRoot, relative), expected, `evidence changed: ${relative}`);
}

function shotData(storyboard) {
  const shot = storyboard.shots[0];
  const style = storyboard.style;
  const theme = storyboard.theme;
  const backdrop = Boolean(shot.material) && shot.materialRole !== 'none' && shot.materialRole !== 'inline-element';
  return {
    text: shot.displayText || shot.text,
    lines: shot.displayLines,
    templateParams: shot.templateParams,
    narration: shot.text,
    subText: shot.subText,
    accent: style.accent,
    bg: style.bg,
    durationInFrames: shot.durationInFrames,
    mediaPlaybackRate: shot.mediaPlayback?.playbackRate ?? 1,
    skin: storyboard.mode === 'A' ? {
      bg: style.bg,
      text: style.text,
      muted: style.sub,
      accent: style.accent,
      surface: theme?.surface || style.bg,
      fontFamily: style.fontFamily || "'Noto Sans SC','Microsoft YaHei',sans-serif",
      transparentBackground: backdrop,
    } : undefined,
  };
}

const runtimeSources = ['template/src/Root.tsx', 'template/src/DynamicVideo.tsx'];
for (const file of runtimeSources) assert.equal(hash(file), priorCompatibility.sourceHashes[file], `${file} changed`);

const cases = [];
for (const item of previousReport.cases) {
  const props = readAt(evidenceRoot, item.propsFile);
  const saved = readAt(evidenceRoot, item.componentPropsFile);
  evidence(item.propsFile, item.propsSha256);
  evidence(item.componentPropsFile, item.componentPropsSha256);
  evidence(item.video.file, item.video.sha256);
  for (const sample of item.samples) evidence(sample.file, sample.sha256);
  for (const sample of item.decodedVideoReview || []) evidence(sample.file, sample.sha256);
  const shot = props.storyboard?.shots?.[0];
  assert.equal(shot?.shotCard, item.card);
  const actual = adapterExports.translateShot(item.card, shotData(props.storyboard));
  assert.ok(actual, `adapter returned no props: ${item.card}/${item.aspect}`);
  assert.deepEqual(actual, saved.adapterProps, `current adapter props differ: ${item.card}/${item.aspect}`);
  cases.push({
    card: item.card,
    aspect: item.aspect,
    actualComponentPropsExact: true,
    selectCompositionReusedFrom: compatibilityFile,
    previousVideoReused: true,
    encodedPixelProofReused: true,
  });
}

const sourceHashes = Object.fromEntries(Object.keys(priorCompatibility.sourceHashes).map(file => [file, hash(file)]));
sourceHashes['director/business-data-admission.mjs'] = hash('director/business-data-admission.mjs');
sourceHashes['director/admission-source-policy.mjs'] = hash('director/admission-source-policy.mjs');
const proof = {
  schema: 'card-business-data-batch015-static-revalidation-v1',
  status: 'passed',
  scope: 'Current adapter props and evidence revalidation after governance source changes; no video rerender',
  previousReport: previousReportFile,
  previousReportSha256: hashAt(evidenceRoot, previousReportFile),
  priorCompatibility: compatibilityFile,
  priorCompatibilitySha256: hash(compatibilityFile),
  runtimeCompositionSourcesUnchanged: runtimeSources,
  cases,
  summary: {cases: cases.length, propsExact: cases.length, selectCompositionReused: cases.length, videosRerendered: 0, encodedPixelProofReused: cases.length * 2},
  sourceHashes,
};

if (write) {
  fs.writeFileSync(path.join(root, proofFile), JSON.stringify(proof, null, 2) + '\n');
  const fixtureFile = '.isolated/card-governance-batch-015-worktree/template/fixtures/card-business-data-batch015-v3.json';
  const fixture = read(fixtureFile);
  const record = {
    schema: 'business-data-card-admission-v1',
    version: 1,
    review: 'passed',
    localVisualReview: 'passed-current-runtime-static-props',
    userVisualAcceptance: 'pending',
    actualModelValidated: false,
    productionAdmission: 'not-recorded',
    reviewer: 'Codex: current adapter props exact; prior selectComposition and encoded-pixel proof retained',
    scope: '8 batch 15 business-data cards, 16 real landscape/portrait videos; current adapter revalidated without video rerender',
    cards: fixture.cards.map(card => card.id),
    fixtureFile,
    fixtureSha256: hash(fixtureFile),
    report: `.isolated/card-governance-batch-015-worktree/${previousReportFile}`,
    reportSha256: hashAt(evidenceRoot, previousReportFile),
    compatibilityReport: proofFile,
    compatibilityReportSha256: hash(proofFile),
    sourceHashes,
    evidenceRoot: '.isolated/card-governance-batch-015-worktree',
    evidence: previousReport.cases.map(item => ({card: item.card, aspect: item.aspect, file: `.isolated/card-governance-batch-015-worktree/${item.video.file}`, sha256: item.video.sha256, fullDecodePassed: item.video.fullDecodePassed})),
  };
  fs.writeFileSync(admissionFile, JSON.stringify(record, null, 2) + '\n');
}
console.log(JSON.stringify({checked: cases.length, propsExact: cases.length, recorded: write, proof: proofFile}));
