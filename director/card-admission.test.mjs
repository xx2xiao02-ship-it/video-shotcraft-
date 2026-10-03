import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {admittedGraphicCards} from './card-admission.mjs';
test('图形卡准入绑定运行源码、策略、报告和视频；验收工具只作为历史证据',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'card-admission-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const director=path.join(root,'director');fs.mkdirSync(director);
  fs.mkdirSync(path.join(root,'template'));
  assert.deepEqual(admittedGraphicCards(root),[]);
  fs.writeFileSync(path.join(root,'source.txt'),'verified source');
  fs.writeFileSync(path.join(root,'template/accept-business-text-batch004.mjs'),'tool v1');
  fs.writeFileSync(path.join(director,'admission-source-policy.mjs'),'policy v1');
  fs.writeFileSync(path.join(root,'report.json'),'report v1');
  fs.writeFileSync(path.join(root,'render.mp4'),'video v1');
  const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const report={version:1,review:'pending',cards:['data/hatch-depth'],sourceHashes:{
      'source.txt':sha(path.join(root,'source.txt')),'template/accept-business-text-batch004.mjs':sha(path.join(root,'template/accept-business-text-batch004.mjs')),
      'director/admission-source-policy.mjs':sha(path.join(director,'admission-source-policy.mjs'))},
    report:'report.json',reportSha256:sha(path.join(root,'report.json')),
    evidence:[{file:'render.mp4',sha256:sha(path.join(root,'render.mp4'))}]};
  const file=path.join(root,'director/card-production-admission.json');
  fs.writeFileSync(file,JSON.stringify(report));assert.deepEqual(admittedGraphicCards(root),[]);
  fs.writeFileSync(file,JSON.stringify({...report,review:'passed'}));assert.deepEqual(admittedGraphicCards(root),report.cards);
  fs.writeFileSync(path.join(root,'template/accept-business-text-batch004.mjs'),'tool v2');
  assert.deepEqual(admittedGraphicCards(root),report.cards);
  fs.writeFileSync(path.join(root,'source.txt'),'modified source');assert.deepEqual(admittedGraphicCards(root),[]);
  fs.writeFileSync(path.join(root,'source.txt'),'verified source');
  fs.writeFileSync(path.join(root,'render.mp4'),'modified video');assert.deepEqual(admittedGraphicCards(root),[]);
  fs.writeFileSync(path.join(root,'render.mp4'),'video v1');
  fs.writeFileSync(path.join(root,'report.json'),'modified report');assert.deepEqual(admittedGraphicCards(root),[]);
  fs.writeFileSync(path.join(root,'report.json'),'report v1');
  fs.writeFileSync(path.join(director,'admission-source-policy.mjs'),'policy v2');
  assert.deepEqual(admittedGraphicCards(root),[]);
});
