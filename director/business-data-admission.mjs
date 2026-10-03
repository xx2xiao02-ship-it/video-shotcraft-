import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {admissionArtifactsCurrent, admissionSourcesCurrent} from './admission-source-policy.mjs';

const RECORDS = [
  'director/business-data-card-admission.json',
  'director/business-data-batch015-admission.json',
  'director/business-data-batch017-admission.json',
  'director/business-data-batch019-admission.json',
  'director/business-data-batch020-admission.json',
];

function readJson(root, relative) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  } catch {
    return null;
  }
}

function hashFile(root, relative) {
  const file = path.resolve(root, relative);
  if (!fs.existsSync(file)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function currentEvidence(root, file, expected) {
  return typeof file === 'string' && typeof expected === 'string' && hashFile(root, file) === expected;
}

function reportEvidenceCurrent(root, report, evidenceRoot = '') {
  if (!report || report.schema !== 'business-data-card-batch-acceptance-v1' ||
      report.sourceConsistency !== true || report.localVisualReview !== 'passed-encoded-mp4-frames' ||
      !Array.isArray(report.cases) || report.cases.length === 0) return false;
  return report.cases.every(item => {
    if (!item.card || !['16:9', '9:16'].includes(item.aspect) || item.error !== undefined ||
        item.resolvedCard !== item.card || item.componentId !== item.card ||
        item.directorConsumption !== 'passed-authored-plan' || !item.video?.fullDecodePassed) return false;
    const files = [
      [item.propsFile, item.propsSha256],
      [item.componentPropsFile, item.componentPropsSha256],
      [item.nativeDefault?.file, item.nativeDefault?.sha256],
      [item.video.file, item.video.sha256],
      ...(item.samples || []).map(sample => [sample.file, sample.sha256]),
      ...(item.decodedVideoReview || []).map(sample => [sample.file, sample.sha256]),
    ];
    return item.samples?.length >= 4 && item.decodedVideoReview?.length === 2 &&
      files.every(([file, expected]) => currentEvidence(root, path.join(evidenceRoot, file), expected));
  });
}

export function readBusinessDataAdmission(root) {
  return readJson(root, RECORDS[0]);
}

export function readBusinessDataAdmissions(root) {
  return RECORDS.map(file => readJson(root, file)).filter(Boolean);
}

export function admittedBusinessDataCards(root) {
  const admitted = [];
  for (const record of readBusinessDataAdmissions(root)) {
    if (record.version !== 1 || record.schema !== 'business-data-card-admission-v1' ||
        record.review !== 'passed' ||
        !['passed-encoded-mp4-frames', 'passed-current-runtime-static-props'].includes(record.localVisualReview) ||
        !Array.isArray(record.cards) || !record.cards.length ||
        !admissionSourcesCurrent(root, record.sourceHashes) ||
        !admissionArtifactsCurrent(root, record)) continue;
    const report = readJson(root, record.report);
    const fixture = readJson(root, record.fixtureFile);
    const evidenceRoot = record.evidenceRoot || '';
    const compatibility = record.compatibilityReport ? readJson(root, record.compatibilityReport) : null;
    if (!currentEvidence(root, record.fixtureFile, record.fixtureSha256) ||
        !reportEvidenceCurrent(root, report, evidenceRoot) || !fixture ||
        !Array.isArray(fixture.cards) ||
        !record.cards.every(id => fixture.cards.some(card => card.id === id)) ||
        (record.compatibilityReport && (!compatibility || compatibility.status !== 'passed' ||
          !currentEvidence(root, record.compatibilityReport, record.compatibilityReportSha256)))) continue;
    const reportCases = new Set(report.cases.map(item => `${item.card}|${item.aspect}|${item.video?.file}|${item.video?.sha256}`));
    const recordedCases = new Set((record.evidence || []).map(item => {
      const file = evidenceRoot ? item.file.replace(`${evidenceRoot}/`, '') : item.file;
      return `${item.card}|${item.aspect}|${file}|${item.sha256}`;
    }));
    if (reportCases.size !== report.cases.length || recordedCases.size !== record.evidence.length ||
        reportCases.size !== recordedCases.size || [...reportCases].some(key => !recordedCases.has(key))) continue;
    admitted.push(...record.cards);
  }
  return [...new Set(admitted)];
}
