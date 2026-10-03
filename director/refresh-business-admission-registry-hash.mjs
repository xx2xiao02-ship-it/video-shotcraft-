import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const registry = 'director/business-data-admission.mjs';
const records = [
  'director/business-data-card-admission.json',
  'director/business-data-batch015-admission.json',
  'director/business-data-batch017-admission.json',
  'director/card-production-admission.json',
  'director/numeric-card-production-admission.json',
  'director/numeric-card-current-long-admission.json',
];
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, registry))).digest('hex');
for (const relative of records) {
  const file = path.join(root, relative);
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!record.sourceHashes?.[registry]) {
    console.log(JSON.stringify({record: relative, registry, skipped: 'no registry hash binding'}));
    continue;
  }
  record.sourceHashes[registry] = sha256;
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({record: relative, registry, sha256}));
}

const textFile = path.join(root, 'director/text-card-production-admission.json');
const textRecord = JSON.parse(fs.readFileSync(textFile, 'utf8'));
let textUpdated = 0;
for (const card of textRecord.cards || []) {
  if (card.sourceHashes?.[registry]) {
    card.sourceHashes[registry] = sha256;
    textUpdated += 1;
  }
}
fs.writeFileSync(textFile, JSON.stringify(textRecord, null, 2) + '\n');
console.log(JSON.stringify({record: 'director/text-card-production-admission.json', registry, sha256, cardsUpdated: textUpdated}));
