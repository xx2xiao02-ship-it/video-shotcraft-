import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createRequire} from 'node:module';
import {buildSourceAudit} from './card-source-audit.mjs';
import {resolveRuntimeCardId} from './card-runtime-choice.mjs';
import {themeAdapter} from './theme-contract.mjs';
import {GRAPHIC_CONTRACTS,validateGraphicParams} from './graphic-contracts.mjs';
import {NUMERIC_CARD_CONTRACTS,validateNumericCardParams} from './numeric-card-contracts.mjs';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const fixtureFile='template/fixtures/card-business-data-batch014-v1.json';
const fixture=read(fixtureFile);
const metrics=read(fixture.metricsSource.file);
const theme=themeAdapter({...read('director/current-theme.json'),aspectRatio:'16:9'},'A');
const templateRequire=createRequire(path.join(root,'template/package.json'));
const ts=templateRequire('typescript');
const adapterFile=path.join(root,'template/src/TemplateAdapter.tsx');
const adapterJs=ts.transpileModule(fs.readFileSync(adapterFile,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const adapterExports={};
new Function('require','exports',adapterJs)(createRequire(adapterFile),adapterExports);
const audit=buildSourceAudit(root);

test('batch 14 fixture values remain bound to the frozen governance snapshot',()=>{
  assert.equal(fixture.schema,'business-card-data-batch-v1');
  assert.equal(hash(fixture.metricsSource.file),fixture.metricsSource.sha256);
  assert.equal(metrics.asOf,fixture.asOf);
  assert.equal(fixture.cards.length,3);
  for(const item of fixture.cards){
    assert.equal(item.backgroundPolicy.role,'none');
    assert.ok(item.backgroundPolicy.reason.startsWith('特殊强调免背景：'));
    if(NUMERIC_CARD_CONTRACTS[item.id]){
      assert.ok(item.narration.includes(item.templateParams.evidence));
      assert.equal(item.templateParams.value,metrics.counts[item.sourceBindings.value]);
      validateNumericCardParams(item.id,item.templateParams,item.narration);
    }else{
      assert.ok(GRAPHIC_CONTRACTS[item.id]);
      for(let index=0;index<item.templateParams.rows.length;index++){
        assert.ok(item.narration.includes(item.templateParams.rows[index].evidence));
        assert.equal(item.templateParams.rows[index].value,metrics.counts[item.sourceBindings.rows[index]]);
      }
      validateGraphicParams(item.id,item.templateParams,item.narration);
    }
  }
});

test('batch 14 selects exact registered components and passes business fields plus theme',()=>{
  assert.equal(typeof adapterExports.translateShot,'function');
  const runtimeIds=audit.registrations.map(registration=>registration.id);
  for(const item of fixture.cards){
    const registration=audit.registrations.find(candidate=>candidate.id===item.id);
    assert.ok(registration?.skinDeclared);
    assert.equal(registration.adapter?.shotCard,item.id);
    assert.equal(resolveRuntimeCardId(item.id,runtimeIds),item.id);
    const skin={bg:theme.style.bg,text:theme.style.text,muted:theme.style.sub,accent:theme.style.accent,
      surface:theme.theme.surface||theme.style.bg,fontFamily:theme.style.fontFamily||"'Noto Sans SC','Microsoft YaHei',sans-serif",
      transparentBackground:false};
    const props=adapterExports.translateShot(item.id,{
      text:item.narration,lines:item.lines,templateParams:item.templateParams,narration:item.narration,
      accent:theme.style.accent,bg:theme.style.bg,durationInFrames:fixture.durationInFrames,skin,
    });
    assert.ok(props);
    assert.deepEqual(props.skin,skin);
    assert.equal(props.durationInFrames,fixture.durationInFrames);
    assert.equal(props.title,item.lines.join('\n'));
    if(NUMERIC_CARD_CONTRACTS[item.id])
      for(const key of ['value','unit','label']) assert.deepEqual(props[key],item.templateParams[key]);
    else
      for(const key of ['rows','unit']) assert.deepEqual(props[key],item.templateParams[key]);
  }
});
