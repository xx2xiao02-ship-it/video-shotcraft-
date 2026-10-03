import assert from 'node:assert/strict';
import test from 'node:test';
import {buildSourceAudit} from './card-source-audit.mjs';
import {cardAcceptancePlan} from './card-acceptance-plan.mjs';

test('frame acceptance covers all 214 variants instead of one component per card',()=>{
  const plan=cardAcceptancePlan(buildSourceAudit());
  assert.equal(plan.length,214);assert.equal(new Set(plan.map(item=>item.card)).size,157);
  assert.equal(plan.filter(item=>item.runtimeId).length,212);
  assert.equal(plan.filter(item=>!item.runtimeId).length,2);
  const group=plan.filter(item=>item.card==='interaction/canvas-materialize-moves');
  assert.deepEqual(group.map(item=>item.component.export),['PanelToCanvasMaterialize','DiagramCascadeBuild']);
  assert.notEqual(group[0].runtimeId,group[1].runtimeId);
  assert.equal(plan.find(item=>item.card==='camera/crash-zoom-punch').runtimeId,null);
});

test('an incomplete binding or changed cardinality cannot produce an acceptance plan',()=>{
  const audit=buildSourceAudit();
  const missing=structuredClone(audit);missing.cards[0].variants[0].runtimeId='unknown/component';
  assert.throws(()=>cardAcceptancePlan(missing));
  assert.throws(()=>cardAcceptancePlan({...audit,counts:{...audit.counts,variants:213}}));
});
