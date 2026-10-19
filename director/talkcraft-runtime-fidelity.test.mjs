import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import os from 'node:os';
import {installTalkcraftCardRuntime} from './talkcraft-card-runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {assertTalkcraftRuntimeFidelity} from './talkcraft-runtime-fidelity.mjs';

test('全治理目录在隔离生成工程中精确映射到参数化注册和源码依赖', t => {
  const root=path.resolve('.');
  const index=JSON.parse(fs.readFileSync(path.join(root,'_audit/video-talkcraft/references/cards-index.json'),'utf8'));
  const ids=index.cards.map(card=>card.slug);
  const actualSkill=path.resolve(path.dirname(loadTalkcraftGovernedCatalog(index).cards[0].implementation.file),'../../../..');
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-fidelity-'));t.after(()=>fs.rmSync(work,{recursive:true,force:true}));
  fs.cpSync(path.join(actualSkill,'template/cards'),path.join(work,'remotion/src/cards'),{recursive:true});
  fs.writeFileSync(path.join(work,'remotion/src/cards/index.ts'),'export const CARD_REGISTRY:Record<string,unknown>={};');
  for(const n of ['source-run.json','input.txt','aligned-sentences.json','audio/full.mp3','remotion/shots.json']){const f=path.join(work,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,n==='source-run.json'?JSON.stringify({runId:'aaaaaaaa-bbbb-cccc-dddd-777777777777'}):'fixture');}
  fs.copyFileSync('director/talkcraft-template-adapter.tsx',path.join(work,'remotion/src/talkcraft-template-adapter.tsx'));
  installTalkcraftCardRuntime(actualSkill,path.join(work,'remotion/src'));
  const result=assertTalkcraftRuntimeFidelity(work,{cardIds:ids,skillRoot:actualSkill});
  assert.equal(result.cards.length,108);
  assert.equal(result.sourceIntegrityPassed,true);
  assert.equal(result.productionAdmitted,false);
});
