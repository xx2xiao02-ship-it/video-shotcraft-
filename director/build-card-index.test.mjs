import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {buildCardIndex} from './build-card-index.mjs';
import {admittedGraphicCards} from './card-admission.mjs';
import {readShortAcceptance} from './short-card-admission.mjs';
import {admittedTextCards} from './text-card-admission.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('indexes all gallery cards with source and preview evidence', () => {
  const index = buildCardIndex(root);
  assert.equal(index.count, 157);
  assert.equal(index.missingPreviewCount, 57);
  assert.equal(new Set(index.cards.map(card => card.id)).size, 157);
  assert.ok(index.cards.every(card => card.semanticUse && card.summary && card.motionBeats.length &&
    card.variants.length && card.poster && card.sourceSha256));
  assert.equal(index.cards.find(card => card.id === 'typography/cel-flash-stomp').runtime.textSlots.length, 1);
  assert.equal(index.cards.find(card => card.id === 'interaction/ai-stream-response').runtime.enabled, false);
  assert.equal(index.sourceRuntimeCounts.variants,214);
  assert.ok(index.cards.every(card=>card.sourceRuntime.id===card.id && card.sourceRuntime.variants.length===card.variants.length));
});

test('157卡统一登记短镜头准入，源标注不能替代真实时长验收',()=>{
  const index=buildCardIndex(root);
  assert.ok(index.cards.every(card=>card.shortShot?.fps===30 && Array.isArray(card.shortShot.acceptedFrames)));
  const admitted=(readShortAcceptance(root)?.cards || []).filter(card=>card.status==='accepted');
  assert.equal(index.cards.filter(card=>card.shortShot.status==='accepted').length,admitted.length);
  assert.equal(index.cards.filter(card=>card.shortShot.kind==='graphic' && card.shortShot.status==='accepted').length,admitted.filter(card=>card.kind==='graphic').length);
  assert.deepEqual(index.cards.find(card=>card.id==='typography/marker-underline-title').shortShot.acceptedFrames,admitted.find(card=>card.id==='typography/marker-underline-title')?.acceptedFrames || []);
  assert.equal(index.cards.find(card=>card.id==='typography/countdown-arc-scatter').shortShot.status,'not-accepted');
  assert.deepEqual(index.cards.find(card=>card.id==='typography/cel-flash-stomp').shortShot.acceptedFrames,[]);
});

test('every text variant exposes its exact ID and current admission independently of its family',()=>{
  const index=buildCardIndex(root),admitted=admittedTextCards(root);
  const family=index.cards.find(card=>card.id==='typography/type-assembly-moves');
  assert.equal(family.variants.length,4);
  assert.equal(family.runtime.enabled,family.variants.every(variant=>admitted.includes(variant.runtimeId)));
  assert.equal(family.runtime.exactVariantSelectionRequired,true);
  for(const variant of family.variants){
    assert.ok(variant.runtimeId.startsWith(family.id+'/'));
    assert.equal(variant.businessRuntime.enabled,admitted.includes(variant.runtimeId));
    assert.equal(variant.businessRuntime.actualModelValidated,false);
  }
});

test('every graphic variant exposes its exact ID and current admission independently of its family',()=>{
  const index=buildCardIndex(root),admitted=admittedGraphicCards(root);
  for(const familyId of ['data/chart-live-moves','data/gauge-readout-moves','data/particle-celebrate-hits']){
    const family=index.cards.find(card=>card.id===familyId);
    assert.ok(family,`missing graphic family ${familyId}`);
    assert.ok(family.variants.every(variant=>variant.businessRuntime),`${familyId} lost variant business runtime`);
    assert.equal(family.runtime.enabled,family.variants.every(variant=>admitted.includes(variant.runtimeId)));
    for(const variant of family.variants){
      assert.ok(variant.runtimeId.startsWith(`${familyId}/`));
      assert.equal(variant.businessRuntime.enabled,admitted.includes(variant.runtimeId));
      assert.deepEqual(variant.businessRuntime.acceptedDuration,
        {frames:admitted.includes(variant.runtimeId)?[180]:[],fps:30});
      assert.equal(variant.businessRuntime.actualModelValidated,false);
    }
  }
});
