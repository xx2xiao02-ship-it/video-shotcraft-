import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {admittedGraphicCards} from '../director/card-admission.mjs';
import {admittedNumericCards} from '../director/numeric-card-admission.mjs';
import {readShortAcceptance} from '../director/short-card-admission.mjs';

const root=path.resolve(import.meta.dirname,'..');
const batch=process.argv[2];
if (!/^[a-z0-9-]+$/.test(batch || '')) throw new Error('Specify a new lowercase batch name');
const out=path.join(root,'.isolated',batch);
if (fs.existsSync(out)) throw new Error('Snapshot already exists; preserve it and select a new batch name');
const reports=['director/card-production-admission.json','director/short-card-production-admission.json','director/numeric-card-production-admission.json'];
const sourceFiles=[...new Set([...reports.flatMap(file=>Object.keys(JSON.parse(fs.readFileSync(path.join(root,file),'utf8')).sourceHashes)),
  'director/a-mode-run.mjs','director/a-mode-render-preflight.mjs','demos/_fixtures/Fixtures.tsx','demos/data/odometer-digit-roll/OdometerDigitRoll.tsx',
  'demos/data/odometer-digit-roll/odometer-contract.mjs','demos/data/odometer-digit-roll/odometer-contract.d.mts',...process.argv.slice(3)])];
for (const file of sourceFiles) if (!path.resolve(root,file).startsWith(root+path.sep)) throw new Error('Snapshot source outside the project');
const priorAdmission={long:admittedGraphicCards(root),numeric:admittedNumericCards(root),
  short:readShortAcceptance(root)?.cards.filter(card=>card.status==='accepted').map(card=>card.id)};
if (!priorAdmission.long.length || !priorAdmission.numeric.length || !priorAdmission.short?.length) throw new Error('Current admission is invalid; reconcile before snapshot');
const files=[...sourceFiles,...reports,'director/a-mode-runs/f4f78a6c-aa2b-4917-9bed-66398863f3f9/props.json'];
const manifest={schema:'card-governance-snapshot-v1',batch,createdAt:new Date().toISOString(),priorAdmission,sourceFiles,files:{}};
for (const file of files) {
  const bytes=fs.readFileSync(path.join(root,file));
  const snapshot=path.join(out,'snapshots',file+'.txt');
  fs.mkdirSync(path.dirname(snapshot),{recursive:true});
  fs.writeFileSync(snapshot,bytes);
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  if (crypto.createHash('sha256').update(fs.readFileSync(snapshot)).digest('hex')!==sha256) throw new Error('Snapshot copy mismatch');
  manifest.files[file]={snapshot:path.relative(root,snapshot).replaceAll('\\','/'),sha256};
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({out,files:files.length,priorAdmission}));
