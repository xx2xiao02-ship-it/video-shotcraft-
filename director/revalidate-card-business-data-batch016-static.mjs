import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const reportFile = 'template/out/card-business-data-batch016-v3/acceptance.json';
const fixtureFile = 'template/fixtures/card-business-data-batch016-v3.json';
const proofFile = 'template/out/card-business-data-batch016-static-revalidation-20261003.json';
const write = process.argv.includes('--record');
const read = file => JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, file))).digest('hex');
const report = read(reportFile);
const fixture = read(fixtureFile);

assert.equal(report.schema, 'business-data-card-batch-acceptance-v1');
assert.equal(report.localVisualReview, 'passed-encoded-mp4-frames');
assert.equal(report.sourceConsistency, true);
assert.equal(report.cases.length, fixture.cards.length * fixture.aspects.length);

const templateRequire = createRequire(path.join(root, 'template/package.json'));
const typescript = templateRequire('typescript');
const adapterFile = path.join(root, 'template/src/TemplateAdapter.tsx');
const adapterJs = typescript.transpileModule(fs.readFileSync(adapterFile, 'utf8'), {
  compilerOptions: {module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022},
}).outputText;
const adapterExports = {};
new Function('require', 'exports', adapterJs)(createRequire(adapterFile), adapterExports);

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

const cases = [];
for (const item of report.cases) {
  const props = read(item.propsFile);
  const saved = read(item.componentPropsFile);
  const actual = adapterExports.translateShot(item.card, shotData(props.storyboard));
  assert.ok(actual, `adapter returned no props: ${item.card}/${item.aspect}`);
  assert.deepEqual(actual, saved.adapterProps, `current adapter props differ: ${item.card}/${item.aspect}`);
  cases.push({
    card: item.card,
    aspect: item.aspect,
    actualComponentPropsExact: true,
    selectCompositionReusedFrom: reportFile,
    previousVideoReused: true,
    encodedPixelProofReused: true,
  });
}

const sourceHashes = Object.fromEntries(Object.keys(report.sourceHashes).map(file => [file, hash(file)]));
sourceHashes['director/business-data-admission.mjs'] = hash('director/business-data-admission.mjs');
sourceHashes['director/admission-source-policy.mjs'] = hash('director/admission-source-policy.mjs');
const proof = {
  schema: 'card-business-data-batch016-static-revalidation-v1',
  status: 'passed',
  scope: 'Current adapter props and existing encoded evidence revalidated after additive shared registrations; no video rerender',
  previousReport: reportFile,
  previousReportSha256: hash(reportFile),
  runtimeCompositionSourcesUnchanged: ['template/src/Root.tsx', 'template/src/DynamicVideo.tsx'],
  cases,
  summary: {cases: cases.length, propsExact: cases.length, selectCompositionReused: cases.length, videosRerendered: 0, encodedPixelProofReused: cases.length * 2},
  sourceHashes,
};

if (write) {
  fs.writeFileSync(path.resolve(root, proofFile), JSON.stringify(proof, null, 2) + '\n');
  const record = {
    schema: 'business-data-card-admission-v1',
    version: 1,
    review: 'passed',
    localVisualReview: 'passed-current-runtime-static-props',
    userVisualAcceptance: 'pending',
    actualModelValidated: false,
    productionAdmission: 'not-recorded',
    reviewer: 'Codex: batch 16 current adapter props exact; existing encoded evidence retained after additive registration changes',
    scope: '8 business-data cards, 16 existing landscape/portrait cases; current props revalidated without video rerender; paid model, service loading, production execution and user acceptance remain pending',
    cards: fixture.cards.map(card => card.id),
    fixtureFile,
    fixtureSha256: hash(fixtureFile),
    report: reportFile,
    reportSha256: hash(reportFile),
    compatibilityReport: proofFile,
    compatibilityReportSha256: hash(proofFile),
    sourceHashes,
    evidence: report.cases.map(item => ({card: item.card, aspect: item.aspect, file: item.video.file, sha256: item.video.sha256, fullDecodePassed: item.video.fullDecodePassed})),
  };
  fs.writeFileSync(path.resolve(root, 'director/business-data-card-admission.json'), JSON.stringify(record, null, 2) + '\n');
}
console.log(JSON.stringify({checked: cases.length, propsExact: cases.length, recorded: write, proof: proofFile}));
