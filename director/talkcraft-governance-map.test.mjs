import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {buildGovernanceMap,buildGovernanceCase,GOVERNANCE_HANDLERS} from './talkcraft-governance-map.mjs';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {MANAGED_WORKFLOW_NODES} from './talkcraft-workflow-contract.mjs';
test('中心模板地图复用完整已审合同；参数、DSL、源码、时长及15节点处理器同源',()=>{
 const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/u,'$1'));
 const index=JSON.parse(fs.readFileSync(path.join(root,'_audit/video-talkcraft/references/cards-index.json'))),catalog=loadTalkcraftGovernedCatalog(index);
 const map=buildGovernanceMap(root,{index,catalog});assert.equal(map.templates.length,108);
 assert.deepEqual(map.nodes.map(n=>n.node),MANAGED_WORKFLOW_NODES.map(n=>n.id));
 for(const card of catalog.cards){const t=map.templates.find(t=>t.slug===card.cardId);assert.equal(t.source.sha256,card.implementation.sha256);
  assert.deepEqual(t.media,card.policy.media);assert.deepEqual(t.fields.map(f=>f.key),card.fields.map(f=>f.key));assert.ok(!t.source.component);}
 assert.ok(map.nodes.find(n=>n.node==='review').humanOnly);assert.equal(GOVERNANCE_HANDLERS['material-completion'].paid,false);
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'governance-map-'));
 try{fs.mkdirSync(path.join(p,'remotion'));const shots=catalog.cards.slice(0,4).map((c,i)=>({id:'s0'+i,shotCard:c.cardId,start:i,end:i+1,templateParams:{cardProps:{text:'原文'}}}));
  fs.writeFileSync(path.join(p,'remotion/shots.json'),JSON.stringify(shots));
  const review=buildGovernanceCase(p,{run:{runId:'current'},feedback:{failedChecks:shots.map(s=>({shotId:s.id,code:'MISSING'}))},rules:{version:1},map,catalog});
  assert.equal(review.shotPlans.length,4);assert.ok(review.shotPlans.every(s=>s.templateContractSha256&&s.steps.length===3));assert.equal(review.globalReview.executionDoesNotPassGate,true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json'))),shots);
 }finally{fs.rmSync(p,{recursive:true,force:true});}
});
