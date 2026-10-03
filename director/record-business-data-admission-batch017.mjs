import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const reportFile = 'template/out/card-business-text-batch017-v2/acceptance.json';
const fixtureFile = 'template/fixtures/card-business-text-batch017-v2.json';
const report = JSON.parse(fs.readFileSync(path.join(root, reportFile), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(path.join(root, fixtureFile), 'utf8'));
const hash = relative => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');

if (report.schema !== 'business-data-card-batch-acceptance-v1' ||
    report.localVisualReview !== 'passed-encoded-mp4-frames' ||
    report.sourceConsistency !== true ||
    report.cases.length !== fixture.cards.length * fixture.aspects.length) {
  throw new Error('第17批验收报告未达到本地业务准入条件');
}

const sourceHashes = Object.fromEntries(Object.keys(report.sourceHashes).map(file => [file, hash(file)]));
sourceHashes['director/business-data-admission.mjs'] = hash('director/business-data-admission.mjs');
sourceHashes['director/admission-source-policy.mjs'] = hash('director/admission-source-policy.mjs');

const record = {
  schema: 'business-data-card-admission-v1',
  version: 1,
  review: 'passed',
  localVisualReview: report.localVisualReview,
  userVisualAcceptance: 'pending',
  actualModelValidated: false,
  productionAdmission: 'not-recorded',
  reviewer: 'Codex: batch 17 exact registrations, real props, 8 encoded MP4 cases',
  scope: '4 business-text cards, 8 landscape/portrait cases, 180 frames at 30fps; paid model, service loading, production execution and user acceptance remain pending',
  cards: fixture.cards.map(card => card.id),
  fixtureFile,
  fixtureSha256: hash(fixtureFile),
  report: reportFile,
  reportSha256: hash(reportFile),
  sourceHashes,
  evidence: report.cases.map(item => ({
    card: item.card,
    aspect: item.aspect,
    file: item.video.file,
    sha256: item.video.sha256,
    fullDecodePassed: item.video.fullDecodePassed,
  })),
};

const output = path.join(root, 'director/business-data-batch017-admission.json');
fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({output: 'director/business-data-batch017-admission.json', cards: record.cards.length, evidence: record.evidence.length}));
