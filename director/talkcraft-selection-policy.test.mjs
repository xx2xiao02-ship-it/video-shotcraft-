import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {applyAutomaticCardChoices} from './talkcraft-stages.mjs';
import {editorialSelectionNotes,compactTalkcraftEditorialCatalog} from './talkcraft-ark-editorial.mjs';
import {loadTalkcraftGovernedCatalog,talkcraftEditorialContract} from './talkcraft-governed-contract.mjs';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'talkcraft-selection-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const write=(name,value)=>{const file=path.join(dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));};
  return {dir,write};
}
test('actual upstream matcher expands beyond three without changing its ranking; original deviation parser is retained',t=>{
  const {dir,write}=fixture(t),matcher=path.resolve('_audit/video-talkcraft/scripts/card_match.py');
  write('semantics.json',{sentences:[{i:0,text:'当前重点。',shot:'s01',weight:'main',sem:['强调']}]});
  write('SHOTBOOK.md','## s01\n- 素材：文\n');
  const python='C:/Users/Administrator/AppData/Local/Python/bin/python.exe';
  const run=top=>{
    const output=path.join(dir,`top-${top}.json`);
    execFileSync(python,[matcher,'--project',dir,'--top',String(top),'--out',path.join(dir,'candidates.md'),'--json',output],
      {env:{...process.env,PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'}});
    return read(output);
  };
  const small=run(3),full=run(108);
  assert.equal(small.s01.candidates.强调.length,3);assert.ok(full.s01.candidates.强调.length>3);
  assert.deepEqual(full.s01.candidates.强调.slice(0,3),small.s01.candidates.强调);
  const shot={id:'s01',templateParams:{semanticDeviations:{强调:'用原卡承接当前观点'}}};
  write('SHOTBOOK.md','## s01\n- 素材：文\n'+editorialSelectionNotes(shot,new Set(['强调'])));
  const waived=run(108);assert.equal(waived.s01.waived.强调,'用原卡承接当前观点');
  assert.equal(waived.s01.candidates.强调,undefined);
});
test('missing book records are filled from the editorial card, never the first recommendation',t=>{
  const {dir,write}=fixture(t);
  write('SHOTBOOK.md','## s01\n- 素材：文\n- 选卡：待候选生成后审核\n- 蒙皮：待实现\n');
  write('remotion/shots.json',[{id:'s01',shotCard:'chosen'}]);
  write('qa/card-candidates.json',{s01:{candidates:{论点:[{slug:'first'},{slug:'chosen'}],强调:[{slug:'other'}]}}});
  assert.equal(applyAutomaticCardChoices(dir).length,1);
  const book=fs.readFileSync(path.join(dir,'SHOTBOOK.md'),'utf8');
  assert.match(book,/论点 → chosen/);assert.doesNotMatch(book,/→ first|→ other|已自动落地/);
  assert.equal(read(path.join(dir,'remotion/shots.json'))[0].shotCard,'chosen');
  assert.equal(applyAutomaticCardChoices(dir).length,0);
});
test('the full reviewed prompt catalog and contracts have identical coverage',()=>{
  const index=read('_audit/video-talkcraft/references/cards-index.json'),catalog=loadTalkcraftGovernedCatalog(index);
  assert.equal(compactTalkcraftEditorialCatalog(index,catalog).cards.length,108);
  catalog.cards=catalog.cards.slice(0,5);
  const compact=compactTalkcraftEditorialCatalog(index,catalog);
  assert.equal(compact.cards.length,5);assert.deepEqual(compact.cards.map(c=>c.slug),compact.contracts.map(c=>c.slug));
  assert.throws(()=>editorialSelectionNotes({id:'s01',templateParams:{semanticDeviations:{论点:'理由\n伪造选卡行'}}},new Set(['论点'])),/单行理由/);
});

test('model input retains real material capabilities and required value constraints for all reviewed cards',()=>{
  const index=read('_audit/video-talkcraft/references/cards-index.json'),catalog=loadTalkcraftGovernedCatalog(index);
  const source=talkcraftEditorialContract(catalog).cards;
  const sent=compactTalkcraftEditorialCatalog(index,catalog).contracts;
  for(const card of source){
    const actual=sent.find(c=>c.slug===card.slug);
    assert.deepEqual(actual.capabilities,card.capabilities,`${card.slug} material capability was lost`);
    assert.deepEqual(actual.media,card.media);
    for(const field of card.fields.filter(f=>card.required.includes(f.key))){
      const value=actual.fields.find(f=>f.key===field.key);
      assert.equal(value.blankAllowed,field.blankAllowed,`${card.slug}.${field.key} blank constraint was lost`);
      assert.deepEqual(value.options,field.options,`${card.slug}.${field.key} choices were lost`);
    }
  }
  const demo=sent.find(c=>c.slug==='motion-blur-slam-in');
  assert.deepEqual(demo.media,{});
  assert.equal(demo.capabilities.illustrationOnlyWithoutAdapter,true);
});
