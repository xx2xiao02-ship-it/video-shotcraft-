import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {admittedBusinessDataCards, readBusinessDataAdmission} from './business-data-admission.mjs';

const root = process.cwd();

test('batch 16 business admission is independent from graphic admission', () => {
  const record = readBusinessDataAdmission(root);
  assert.equal(record?.schema, 'business-data-card-admission-v1');
  const admitted = admittedBusinessDataCards(root);
  assert.ok(record.cards.every(id => admitted.includes(id)));
  assert.ok(admitted.length >= record.cards.length);
  assert.equal(record.cards.length, 8);
  assert.equal(record.evidence.length, 16);
});

test('changing the batch report closes business admission', () => {
  const record = readBusinessDataAdmission(root);
  const reportFile = path.join(root, record.report);
  const originalBytes = fs.readFileSync(reportFile);
  const report = JSON.parse(originalBytes.toString('utf8'));
  const original = report.localVisualReview;
  report.localVisualReview = 'tampered';
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  try {
    const admitted = admittedBusinessDataCards(root);
    assert.ok(record.cards.every(id => !admitted.includes(id)));
  } finally {
    report.localVisualReview = original;
    fs.writeFileSync(reportFile, originalBytes);
  }
});
