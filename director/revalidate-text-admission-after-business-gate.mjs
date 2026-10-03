import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {themeAdapter} from './theme-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const recordFile = path.join(root, 'director/text-card-production-admission.json');
const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const hash = relative => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
const write = process.argv.includes('--record');

const templateRequire = createRequire(path.join(root, 'template/package.json'));
const ts = templateRequire('typescript');
const adapterFile = path.join(root, 'template/src/TemplateAdapter.tsx');
const adapterJs = ts.transpileModule(fs.readFileSync(adapterFile, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const adapterExports = {};
new Function('require', 'exports', adapterJs)(createRequire(adapterFile), adapterExports);
const theme = themeAdapter({...read('director/current-theme.json'), aspectRatio: '16:9'}, 'A');
const skin = {
  bg: theme.style.bg,
  text: theme.style.text,
  muted: theme.style.sub,
  accent: theme.style.accent,
  surface: theme.theme.surface || theme.style.bg,
  fontFamily: theme.style.fontFamily || "'Noto Sans SC','Microsoft YaHei',sans-serif",
  transparentBackground: false,
};

function evidence(relative, expected) {
  assert.equal(hash(relative), expected, `evidence changed: ${relative}`);
}

function fixtureCards(report) {
  const fixture = read(report.fixtureFile);
  return fixture.baselineFixture ? [...read(fixture.baselineFixture).cards, ...fixture.cards] : fixture.cards;
}

const changedShared = {
  'director/a-mode-run.mjs': hash('director/a-mode-run.mjs'),
  'director/a-mode-render-preflight.mjs': hash('director/a-mode-render-preflight.mjs'),
  'director/business-data-admission.mjs': hash('director/business-data-admission.mjs'),
  'director/admission-source-policy.mjs': hash('director/admission-source-policy.mjs'),
};

for (const item of record.cards) {
  assert.equal(item.localReview, 'passed', item.id);
  const report = read(item.report);
  const input = fixtureCards(report).find(card => card.id === item.id);
  assert.ok(input, `missing fixture card: ${item.id}`);
  assert.equal(report.schema, 'business-text-card-batch-v1', item.id);
  assert.equal(report.sourceConsistency, true, item.id);
  assert.ok(['passed', 'partial'].includes(report.localVisualReview), item.id);
  const cases = report.cases.filter(candidate => candidate.card === item.id);
  assert.equal(cases.length, 2, item.id);
  for (const candidate of cases) {
    assert.equal(candidate.error, undefined, `${item.id}/${candidate.aspect}`);
    assert.equal(candidate.directorConsumption, 'passed-authored-plan');
    assert.equal(candidate.resolvedCard, item.id);
    evidence(candidate.propsFile, candidate.propsSha256);
    evidence(candidate.nativeDefault.file, candidate.nativeDefault.sha256);
    evidence(candidate.video.file, candidate.video.sha256);
    for (const sample of candidate.samples) evidence(sample.file, sample.sha256);
    for (const sample of candidate.decodedVideoReview || []) evidence(sample.file, sample.sha256);

    const props = read(candidate.propsFile);
    const shot = props.storyboard?.shots?.[0];
    assert.equal(shot?.shotCard, item.id);
    assert.deepEqual(shot.displayLines, input.lines, `${item.id}/${candidate.aspect} lines`);
    assert.equal(shot.durationInFrames, report.durationInFrames, `${item.id}/${candidate.aspect} duration`);
    const translated = adapterExports.translateShot(item.id, {
      text: shot.text,
      lines: shot.displayLines,
      displayLines: shot.displayLines,
      templateParams: shot.templateParams,
      narration: shot.text,
      durationInFrames: shot.durationInFrames,
      skin,
    });
    assert.ok(translated, `adapter returned no props: ${item.id}`);
    assert.deepEqual(translated.skin, skin, `${item.id}/${candidate.aspect} skin`);
    if (Object.hasOwn(translated, 'durationInFrames'))
      assert.equal(translated.durationInFrames, shot.durationInFrames, `${item.id}/${candidate.aspect} duration props`);
    if (shot.templateParams) {
      for (const [key, value] of Object.entries(shot.templateParams))
        assert.deepEqual(translated[key], value, `${item.id}/${candidate.aspect} param ${key}`);
    }
  }
  if (write) {
    for (const [file, expected] of Object.entries(changedShared)) item.sourceHashes[file] = expected;
  }
}

if (write) {
  const original = fs.readFileSync(recordFile);
  const backup = path.join(root, `docs/audits/text-admission-before-business-gate-${hash('director/text-card-production-admission.json').slice(0, 12)}.json`);
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, {flag: 'wx'});
  fs.writeFileSync(recordFile, JSON.stringify(record, null, 2) + '\n');
}
console.log(JSON.stringify({checked: record.cards.length, changedShared: Object.keys(changedShared), recorded: write}));
