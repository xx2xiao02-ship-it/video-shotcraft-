import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveRuntimeCardId} from './card-runtime-choice.mjs';
import {buildSourceAudit} from './card-source-audit.mjs';

test('business runtime resolves every mapped gallery variant by its exact registered ID',()=>{
  const report=buildSourceAudit();
  const ids=report.registrations.map(item=>item.id);
  const variants=report.cards.flatMap(card=>card.variants).filter(variant=>variant.runtimeId);
  assert.equal(variants.length,212);
  for (const variant of variants) assert.equal(resolveRuntimeCardId(variant.runtimeId,ids),variant.runtimeId);
  assert.equal(resolveRuntimeCardId(null,ids),null);
});

test('business groups and missing runtime IDs cannot select a directory-first component',()=>{
  const ids=['group/z','group/a','solo/child'];
  assert.throws(()=>resolveRuntimeCardId('group',ids),/完整变体ID/);
  assert.throws(()=>resolveRuntimeCardId('solo',ids),/完整变体ID/);
  assert.throws(()=>resolveRuntimeCardId('missing',ids),/精确运行注册/);
  assert.equal(resolveRuntimeCardId('group/a',ids),'group/a');
});

test('explicit legacy scope preserves original directory-first and missing-card fallback',()=>{
  const ids=['group/z','group/a'];
  assert.equal(resolveRuntimeCardId('group',ids,{legacyDirectoryFallback:true}),'group/z');
  assert.equal(resolveRuntimeCardId('missing',ids,{legacyDirectoryFallback:true}),null);
});
