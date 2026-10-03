import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {buildSourceAudit} from './card-source-audit.mjs';
import {admittedGraphicCards} from './card-admission.mjs';
import {admittedBusinessDataCards,readBusinessDataAdmission} from './business-data-admission.mjs';

test('gallery cards and variants retain exact cardinality and real exports',()=>{
  const report=buildSourceAudit();
  assert.equal(report.counts.cards,157);
  assert.equal(report.counts.variants,214);
  assert.equal(new Set(report.cards.map(card=>card.id)).size,157);
  assert.ok(report.registrations.every(item=>item.file.startsWith('demos/') && item.export && item.sha256.length===64));
});

test('user review remains scoped to the valid long and short source admissions',()=>{
  const report=buildSourceAudit();
  const admitted=admittedGraphicCards(process.cwd());
  const businessAdmitted=admittedBusinessDataCards(process.cwd());
  const graphicAdmission=JSON.parse(fs.readFileSync('director/card-production-admission.json','utf8'));
  const businessAdmission=readBusinessDataAdmission(process.cwd());
  for (const id of ['ui-entrance/bezier-source-converge-merge','data/hatch-depth']) {
    const variant=report.cards.find(card=>card.id===id).variants[0];
    const business=businessAdmitted.includes(id);
    const recordedAcceptance=business
      ? businessAdmission.userVisualAcceptance || 'pending'
      : graphicAdmission.addedCardAcceptance?.[id]?.userAcceptance || graphicAdmission.userVisualAcceptance || 'pending';
    assert.equal(variant.status.longUserAcceptance,(admitted.includes(id) || business) ? recordedAcceptance : 'not-admitted');
    assert.notEqual(variant.status.shortUserAcceptance,'passed');
  }
  const odometer=report.cards.find(card=>card.id==='data/odometer-digit-roll').variants[0];
  assert.equal(odometer.status.userAcceptance,'pending');
});

test('ambiguous group preview never selects its first component',()=>{
  const report=buildSourceAudit();
  const card=report.cards.find(item=>item.id==='camera/crash-zoom-punch');
  assert.equal(card.variants[0].runtimeId,null);
  assert.equal(card.ownedRuntimeIds.length,2);
  assert.ok(card.variants[0].blockers.includes('variant-source-reconciliation-required'));
});

test('numeric component implementation is separate from model and user acceptance',()=>{
  const report=buildSourceAudit();
  const variant=report.cards.find(item=>item.id==='data/counter-confetti').variants[0];
  assert.equal(variant.component.export,'CounterConfetti');
  assert.equal(variant.status.implemented,true);
  assert.equal(variant.status.actualModelValidated,false);
});

test('reviewed variant aliases resolve independently without cross-card ownership',()=>{
  const report=buildSourceAudit();
  const card=report.cards.find(item=>item.id==='interaction/canvas-materialize-moves');
  assert.deepEqual(card.variants.map(variant=>variant.component.export),['PanelToCanvasMaterialize','DiagramCascadeBuild']);
  assert.equal(card.variants[0].mappingEvidence.method,'reviewed-explicit-alias');
  assert.ok(!report.cards.find(item=>item.id==='interaction/input-trigger-moves').ownedRuntimeIds.includes('rhythm/trailer-grammar-moves/smash-cut'));
});
