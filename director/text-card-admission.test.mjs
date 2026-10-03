import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import test from 'node:test';
import {admittedTextCards} from './text-card-admission.mjs';

test('text card admission requires exact current source, report and both real video artifacts',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'text-card-admission-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'director'));
  const write=(name,text)=>{fs.writeFileSync(path.join(root,name),text);return crypto.createHash('sha256').update(text).digest('hex');};
  const shared=write('runtime.tsx','runtime'),first=write('first.tsx','first'),second=write('second.tsx','second');
  const report=write('evidence.json','{}'),landscape=write('landscape.mp4','video-fixture'),portrait=write('portrait.mp4','video-fixture');
  const card=(id,source,expected)=>({id,localReview:'passed',acceptedFrames:[180],fps:30,sourceHashes:{'runtime.tsx':shared,[source]:expected},
    report:'evidence.json',reportSha256:report,evidence:[{file:'landscape.mp4',sha256:landscape},{file:'portrait.mp4',sha256:portrait}]});
  write('director/text-card-production-admission.json',JSON.stringify({schema:'native-business-text-admission-v1',cards:[card('first','first.tsx',first),card('second','second.tsx',second)]}));
  assert.deepEqual(admittedTextCards(root),['first','second']);
  write('first.tsx','changed-first');assert.deepEqual(admittedTextCards(root),['second']);
  write('runtime.tsx','changed-shared');assert.deepEqual(admittedTextCards(root),[]);
  write('runtime.tsx','runtime');assert.deepEqual(admittedTextCards(root),['second']);
  write('portrait.mp4','changed-video');assert.deepEqual(admittedTextCards(root),[]);
});

test('missing admission or artifacts cannot pass',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'text-card-missing-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  assert.deepEqual(admittedTextCards(root),[]);
});
