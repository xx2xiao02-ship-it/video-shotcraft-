import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {validateGlobalPlan,validateShotPlan,buildStoryboard} from './a-mode-run.mjs';
import {LIST_CARD_IDS} from './list-card-contracts.mjs';
import {preflightAModeRender} from './a-mode-render-preflight.mjs';
import {installTextAdmissionFixture} from './test-support/text-admission-fixture.mjs';

const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(path.join(root,'template/package.json'));
const ts=require('typescript');
const source=fs.readFileSync(path.join(root,'template/src/TemplateAdapter.tsx'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const adapter={};
new Function('require','exports',compiled)(createRequire(path.join(root,'template/src/TemplateAdapter.tsx')),adapter);
const fixture=JSON.parse(fs.readFileSync(path.join(root,'template/fixtures/card-business-text-batch013.json'),'utf8'));

test('actual adapter preserves every frozen list record, target and focus label',()=>{
  for(const input of fixture.cards){
    const shot={text:input.narration,lines:input.lines,durationInFrames:180,templateParams:input.templateParams,
      skin:{bg:'#101820',text:'#ffffff',muted:'#c4ced5',accent:'#66d2cc',surface:'#202c35',fontFamily:'Microsoft YaHei'}};
    const props=adapter.translateShot(input.id,shot);
    assert.deepEqual(props.rows,input.templateParams.rows);assert.equal(props.targetId,input.templateParams.targetId);
    assert.equal(props.focusLabel,input.templateParams.focusLabel);assert.deepEqual(props.words,input.lines);
    assert.deepEqual(props.skin,shot.skin);
    assert.throws(()=>adapter.translateShot(input.id,{...shot,templateParams:undefined}));
    assert.throws(()=>adapter.translateShot(input.id,{...shot,templateParams:{...input.templateParams,targetId:'missing'}}));
  }
});

test('both director layers preserve structured rows into storyboard and reject missing data',()=>{
  for(const input of fixture.cards){
    assert.ok(LIST_CARD_IDS.has(input.id));
    const segments=[{text:input.narration,fromFrame:0,durationInFrames:180}];
    const globals=[{fromSegment:0,toSegment:1,type:'claim',card:input.id,material:null,materialRole:'none',reason:'突出真实清单停点'}];
    validateGlobalPlan({shots:globals},segments,[],{availableCards:[input.id]});
    const detail={index:0,displayLines:input.lines,elementPlan:'真实记录按唯一ID急刹停位',captionHighlights:[''],templateParams:input.templateParams};
    validateShotPlan({shots:[detail]},globals,segments);
    const sb=buildStoryboard(root,'isolated-list-contract',{fps:30,totalFrames:180,segments},globals,[detail],{});
    assert.deepEqual(sb.shots[0].templateParams,input.templateParams);
    const missing={...detail,templateParams:undefined};
    assert.throws(()=>validateShotPlan({shots:[missing]},globals,segments));
    assert.throws(()=>buildStoryboard(root,'isolated-list-contract',{fps:30,totalFrames:180,segments},globals,[missing],{}));
    assert.throws(()=>buildStoryboard(root,'isolated-list-contract',{fps:30,totalFrames:60,segments:[{...segments[0],durationInFrames:60}]},globals,[detail],{}));
  }
});

test('unknown list ID is never substituted with a default component',()=>{
  assert.equal(adapter.translateShot('data/scroll-brake-moves/unknown',{text:'真实清单',durationInFrames:180}),null);
  const segments=[{text:'实际清单内容',fromFrame:0,durationInFrames:180}];
  assert.throws(()=>validateGlobalPlan({shots:[{fromSegment:0,toSegment:1,type:'claim',card:'data/scroll-brake-moves/unknown',material:null,materialRole:'none',reason:'突出记录'}]},segments,[]));
});

test('render preflight validates complete list fields after the admission gate (isolated synthetic control flow)',t=>{
  const isolated=fs.mkdtempSync(path.join(os.tmpdir(),'list-preflight-'));
  t.after(()=>fs.rmSync(isolated,{recursive:true,force:true}));
  fs.mkdirSync(path.join(isolated,'director'));fs.mkdirSync(path.join(isolated,'template/public'),{recursive:true});
  fs.writeFileSync(path.join(isolated,'template/public/audio.mp3'),'synthetic control-flow audio, not production evidence');
  installTextAdmissionFixture(isolated);
  const file=path.join(isolated,'director/text-card-production-admission.json');
  const admission=JSON.parse(fs.readFileSync(file,'utf8'));
  admission.cards=fixture.cards.map(input=>({...admission.cards[0],id:input.id}));
  fs.writeFileSync(file,JSON.stringify(admission));
  for(const input of fixture.cards){
    const shot={type:'claim',shotCard:input.id,text:input.narration,displayLines:input.lines,durationInFrames:180,
      templateParams:input.templateParams,materialRole:'none',direction:'特殊强调免背景：突出真实清单停点'};
    const write=value=>fs.writeFileSync(path.join(isolated,'director/storyboard.json'),JSON.stringify({mode:'A',fps:30,audio:'audio.mp3',shots:[value]}));
    write(shot);assert.deepEqual(preflightAModeRender(isolated,{probe:()=>6}).shots[0].templateParams,input.templateParams);
    write({...shot,templateParams:{...input.templateParams,targetId:'missing'}});
    assert.throws(()=>preflightAModeRender(isolated,{probe:()=>6}),/长列表/);
    write({...shot,templateParams:undefined});assert.throws(()=>preflightAModeRender(isolated,{probe:()=>6}),/长列表/);
  }
});
