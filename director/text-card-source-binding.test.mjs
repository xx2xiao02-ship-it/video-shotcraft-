import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import {registryBinding,bindTextCardSources,textCardSourcesCurrent,sourceHash} from './text-card-source-binding.mjs';
import {admittedTextCards,readTextCardAdmission} from './text-card-admission.mjs';

const root=path.resolve(import.meta.dirname,'..');
const adapter='template/src/TemplateAdapter.tsx',contracts='director/text-card-contracts.mjs';
const adapterText="export const COMPONENT_CONTRACTS = {'first':{shotCard:'first',propsMap:{text:'words'}},'second':{shotCard:'second',propsMap:{text:'text'}}}; export function translateShot(id,shot){return shot;}";
const contractText="const spec=(s,min,max,chars)=>({s,min,max,chars});export const TEXT_CARD_CONTRACTS=Object.freeze({'first':spec('one',1,1,8),'second':spec('two',1,1,8)});";

test('adding a static registration preserves existing cards, but shared code does not',()=>{
  for(const [file,text,addition] of [[adapter,adapterText,"'third':{shotCard:'third',propsMap:{text:'words'}},"],
    [contracts,contractText,"'third':spec('three',1,1,8),"]]){
    const original=registryBinding(file,text,'first');
    const extended=text.replace("{'first':","{"+addition+"'first':");
    assert.deepEqual(registryBinding(file,extended,'first'),original);
    assert.notDeepEqual(registryBinding(file,text+'\nexport const changedSharedBehavior=true;','first'),original);
  }
});

test('changing one card invalidates only its registry binding',()=>{
  const changed=adapterText.replace("text:'words'","text:'headline'");
  assert.notDeepEqual(registryBinding(adapter,changed,'first'),registryBinding(adapter,adapterText,'first'));
  assert.deepEqual(registryBinding(adapter,changed,'second'),registryBinding(adapter,adapterText,'second'));
  assert.throws(()=>registryBinding(adapter,adapterText.replace("'first':","'missing':"),'first'),/Missing exact/);
});

test('dynamic, duplicate, executable and invalid registrations fail closed',()=>{
  for(const text of [adapterText.replace("'first':","[getId()]:"),adapterText.replace("'second':","'first':"),
    adapterText.replace("{shotCard:'first',propsMap:{text:'words'}}","buildContract()"),
    adapterText.replace("{'first':","{...other,'first':"),adapterText+' }'])
    assert.throws(()=>registryBinding(adapter,text,'first'));
  assert.throws(()=>registryBinding(contracts,contractText.replace("spec('two',1,1,8)","runPaidCall()"),'first'));
  assert.doesNotThrow(()=>registryBinding(contracts,contractText.replace("spec('two',1,1,8)","spec('two',1,1,8,257)"),'first'));
  assert.throws(()=>registryBinding(contracts,contractText.replace("spec('two',1,1,8)","spec('two',1,1,8,getFrames())"),'first'));
});

test('scoped admission preserves tool history and still checks component, planner and policy',t=>{
  const isolated=fs.mkdtempSync(path.join(os.tmpdir(),'scoped-card-binding-'));
  t.after(()=>fs.rmSync(isolated,{recursive:true,force:true}));
  const write=(file,text)=>{fs.mkdirSync(path.dirname(path.join(isolated,file)),{recursive:true});
    fs.writeFileSync(path.join(isolated,file),text);return sourceHash(text);};
  write('director/text-card-source-binding.mjs',fs.readFileSync(path.join(root,'director/text-card-source-binding.mjs')));
  const hashes={[adapter]:write(adapter,adapterText),[contracts]:write(contracts,contractText),
    'component.tsx':write('component.tsx','original'),
    'director/a-mode-run.mjs':write('director/a-mode-run.mjs','planner'),
    'template/render-business-text-videos.mjs':write('template/render-business-text-videos.mjs','renderer tool')};
  const item={id:'first',sourceHashes:hashes,sourceBinding:bindTextCardSources(isolated,'first',hashes)};
  assert.equal(textCardSourcesCurrent(isolated,item),true);
  write('template/render-business-text-videos.mjs','updated tool');assert.equal(textCardSourcesCurrent(isolated,item),true);
  write('component.tsx','changed');assert.equal(textCardSourcesCurrent(isolated,item),false);
  write('component.tsx','original');write('director/a-mode-run.mjs','changed');assert.equal(textCardSourcesCurrent(isolated,item),false);
  write('director/a-mode-run.mjs','planner');
  write('director/text-card-source-binding.mjs','changed policy');assert.equal(textCardSourcesCurrent(isolated,item),false);
});

test('real current admissions have stable per-card fingerprints for additive registry edits',()=>{
  const valid=new Set(admittedTextCards(root));
  const cards=readTextCardAdmission(root).cards.filter(card=>valid.has(card.id));
  assert.ok(cards.length>=29,'Expected the reviewed batch-six admissions');
  for(const file of [adapter,contracts]){
    const text=fs.readFileSync(path.join(root,file),'utf8');
    const anchor=file===adapter ? "'typography/cel-flash-stomp': {" : "'typography/cel-flash-stomp':spec(";
    const entry=file===adapter ? "'testing/new-card':{shotCard:'testing/new-card',propsMap:{text:'words'}},\n" : "'testing/new-card':spec('new',1,1,8),\n";
    assert.ok(text.includes(anchor));
    const extended=text.replace(anchor,entry+anchor);
    for(const card of cards) assert.deepEqual(registryBinding(file,extended,card.id),registryBinding(file,text,card.id));
  }
  for(const card of cards){
    const bound={...card,sourceBinding:bindTextCardSources(root,card.id,card.sourceHashes)};
    assert.equal(textCardSourcesCurrent(root,bound),true,card.id);
  }
});
