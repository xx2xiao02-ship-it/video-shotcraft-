import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

if (!process.argv.includes('--record-reviewed')) throw new Error('先完成第20批真实编码画面复核，再记录准入');
const root = path.resolve(import.meta.dirname, '..');
const reportFile = 'template/out/card-business-transition-batch020-v1/acceptance.json';
const fixtureFile = 'template/fixtures/card-business-transition-batch020-v1.json';
const read = file => JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, file))).digest('hex');
const report = read(reportFile);
const fixture = read(fixtureFile);
assert.equal(report.schema, 'business-data-card-batch-acceptance-v1');
assert.equal(report.localVisualReview, 'passed-encoded-mp4-frames');
assert.equal(report.sourceConsistency, true);
assert.equal(report.cases.length, fixture.cards.length * fixture.aspects.length);
const sourceHashes = {...report.sourceHashes,
  'director/business-data-admission.mjs': hash('director/business-data-admission.mjs'),
  'director/admission-source-policy.mjs': hash('director/admission-source-policy.mjs')};
const record = {
  schema: 'business-data-card-admission-v1', version: 1, review: 'passed', localVisualReview: report.localVisualReview,
  userVisualAcceptance: 'pending', actualModelValidated: false, productionAdmission: 'not-recorded',
  reviewer: 'Codex: batch 20 exact transition registrations, real structured props, 16 encoded MP4 cases',
  scope: '8 transition cards, 16 landscape/portrait cases, 180 frames at 30fps; paid model, production execution and user acceptance remain pending',
  cards: fixture.cards.map(card => card.id), fixtureFile, fixtureSha256: hash(fixtureFile), report: reportFile,
  reportSha256: hash(reportFile), sourceHashes,
  evidence: report.cases.map(item => ({card: item.card, aspect: item.aspect, file: item.video.file,
    sha256: item.video.sha256, fullDecodePassed: item.video.fullDecodePassed})),
};
const output = 'director/business-data-batch020-admission.json';
fs.writeFileSync(path.resolve(root, output), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({output, cards: record.cards.length, evidence: record.evidence.length}));
