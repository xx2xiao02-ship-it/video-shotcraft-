import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {admittedNumericCards} from './numeric-card-admission.mjs';

test('numeric admission closes on runtime, report, video or policy changes but preserves tool-version evidence',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'numeric-admission-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const director=path.join(root,'director');fs.mkdirSync(director);
  fs.mkdirSync(path.join(root,'template'));
  const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  fs.writeFileSync(path.join(root,'source.txt'),'source');
  fs.writeFileSync(path.join(root,'template/accept-business-text-batch004.mjs'),'tool v1');
  fs.writeFileSync(path.join(director,'admission-source-policy.mjs'),'policy v1');
  fs.writeFileSync(path.join(root,'report.json'),'report');
  fs.writeFileSync(path.join(root,'render.txt'),'render');
  const file=path.join(root,'director/numeric-card-production-admission.json');
  const report={schema:'numeric-card-production-admission-v1',localReview:'passed',cards:['data/counter-confetti'],
    sourceHashes:{'source.txt':sha(path.join(root,'source.txt')),
      'template/accept-business-text-batch004.mjs':sha(path.join(root,'template/accept-business-text-batch004.mjs')),
      'director/admission-source-policy.mjs':sha(path.join(director,'admission-source-policy.mjs'))},
    report:'report.json',reportSha256:sha(path.join(root,'report.json')),
    evidence:[{file:'render.txt',sha256:sha(path.join(root,'render.txt'))}]};
  assert.deepEqual(admittedNumericCards(root),[]);
  fs.writeFileSync(file,JSON.stringify(report));assert.deepEqual(admittedNumericCards(root),report.cards);
  fs.writeFileSync(path.join(root,'template/accept-business-text-batch004.mjs'),'tool v2');
  assert.deepEqual(admittedNumericCards(root),report.cards);
  fs.writeFileSync(path.join(root,'render.txt'),'changed');assert.deepEqual(admittedNumericCards(root),[]);
  fs.writeFileSync(path.join(root,'render.txt'),'render');
  fs.writeFileSync(path.join(root,'source.txt'),'changed');assert.deepEqual(admittedNumericCards(root),[]);
  fs.writeFileSync(path.join(root,'source.txt'),'source');
  fs.writeFileSync(path.join(root,'report.json'),'modified report');assert.deepEqual(admittedNumericCards(root),[]);
  fs.writeFileSync(path.join(root,'report.json'),'report');
  fs.writeFileSync(path.join(director,'admission-source-policy.mjs'),'policy v2');
  assert.deepEqual(admittedNumericCards(root),[]);
  fs.writeFileSync(path.join(director,'admission-source-policy.mjs'),'policy v1');
  for(const bad of [{...report,localReview:'pending'},{...report,evidence:[]},{...report,sourceHashes:{}},
    {...report,evidence:[{file:'../outside.txt',sha256:sha(path.join(root,'render.txt'))}]}]) {
    fs.writeFileSync(file,JSON.stringify(bad));assert.deepEqual(admittedNumericCards(root),[]);
  }
});
