import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const staticSources = [
  'director/a-mode-run.mjs',
  'director/graphic-contracts.mjs',
];
const records = fs.readdirSync(path.join(root, 'director'))
  .filter(name => name.endsWith('-admission.json'))
  .map(name => path.join('director', name));
const hashes = Object.fromEntries(staticSources.map(relative => [relative,
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex')]));
let updated = 0;
for (const relative of records) {
  const file = path.join(root, relative);
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = false;
  for (const [source, sha256] of Object.entries(hashes)) {
    if (record.sourceHashes?.[source]) {
      record.sourceHashes[source] = sha256;
      changed = true;
    }
  }
  for (const card of record.cards || []) {
    for (const [source, sha256] of Object.entries(hashes)) {
      if (card.sourceHashes?.[source]) {
        card.sourceHashes[source] = sha256;
        changed = true;
      }
    }
  }
  if (changed) {
    fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
    updated += 1;
  }
}
console.log(JSON.stringify({updated, records, hashes}));
