import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {validateGlobalPlan,validateShotPlan,buildStoryboard,createAModeRun,executeAModeRun} from './a-mode-run.mjs';
import {NUMERIC_CARD_CONTRACTS} from './numeric-card-contracts.mjs';
import {admittedNumericCards} from './numeric-card-admission.mjs';
import {preflightAModeRender} from './a-mode-render-preflight.mjs';

const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(path.join(root,'template/package.json'));
const ts=require('typescript');
const source=fs.readFileSync(path.join(root,'template/src/TemplateAdapter.tsx'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
new Function('require','exports',compiled)(createRequire(path.join(root,'template/src/TemplateAdapter.tsx')),exports);
const card='data/counter-confetti';
const params=NUMERIC_CARD_CONTRACTS[card].fixture;

test('real adapter injects scalar data, preserves zero, and rejects short duration',()=>{
  const shot={text:'留住现金',lines:['留住现金'],narration:params.evidence,durationInFrames:138,templateParams:params};
  const props=exports.translateShot(card,shot);
  assert.equal(props.value,1200);assert.equal(props.label,'应急储备');assert.equal(props.title,'留住现金');
  const zero={...params,value:0,evidence:'应急储备0元'};
  assert.equal(exports.translateShot(card,{...shot,narration:zero.evidence,templateParams:zero}).value,0);
  assert.throws(()=>exports.translateShot(card,{...shot,durationInFrames:60}));
  assert.throws(()=>exports.translateShot(card,{...shot,narration:'另一段原文'}));
  assert.throws(()=>exports.translateShot(card,{...shot,templateParams:undefined}));
});

test('actual A-mode entry consumes admitted odometer guide; render preflight closes on source drift (injected model)',async t=>{
  assert.ok(admittedNumericCards(root).includes('data/odometer-digit-roll'),'Current odometer integration admission must be valid');
  const isolated=fs.mkdtempSync(path.join(os.tmpdir(),'odometer-director-'));
  t.after(()=>fs.rmSync(isolated,{recursive:true,force:true}));
  const admission=JSON.parse(fs.readFileSync(path.join(root,'director/numeric-card-production-admission.json'),'utf8'));
  const currentAdmission=JSON.parse(fs.readFileSync(path.join(root,'director/numeric-card-current-long-admission.json'),'utf8'));
  const short=JSON.parse(fs.readFileSync(path.join(root,'director/short-card-production-admission.json'),'utf8'));
  const files=[...Object.keys(admission.sourceHashes),...Object.keys(currentAdmission.sourceHashes),...Object.keys(short.sourceHashes),
    ...admission.evidence.map(item=>item.file),...currentAdmission.evidence.map(item=>item.file),
    admission.report,currentAdmission.report,short.acceptanceReport,short.graphicAcceptanceReport,
    'director/short-card-production-admission.json','director/numeric-card-production-admission.json',
    'director/numeric-card-current-long-admission.json','director/card-capability-index.json','director/template-registry.json'];
  for (const file of new Set(files)) {
    const target=path.join(isolated,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);
  }
  const params=NUMERIC_CARD_CONTRACTS['data/odometer-digit-roll'].fixture;
  const first='我们先看现金储备的重要性。';
  const timing={fps:30,totalFrames:294,segments:[{text:first,fromFrame:0,durationInFrames:150},
    {text:params.evidence,fromFrame:150,durationInFrames:144}]};
  const {runId,dir}=createAModeRun(isolated,{text:first+params.evidence});
  const audio=path.join(isolated,'template/public/audio/a-mode',`${runId}.mp3`);
  fs.mkdirSync(path.dirname(audio),{recursive:true});fs.writeFileSync(audio,'local audio fixture, not a production recording');
  fs.writeFileSync(path.join(dir,'timing.json'),JSON.stringify(timing));
  fs.writeFileSync(path.join(dir,'material-candidates.json'),JSON.stringify([0,1,2,3].map(i=>({path:`cash-${i}.mp4`,duration_sec:10}))));
  const cards=[null,'typography/marker-underline-title','typography/paper-title-card','data/odometer-digit-roll'];
  const globals=cards.map((card,i)=>({fromSegment:i,toSegment:i+1,type:'content',card,
    material:`cash-${i}.mp4`,materialRole:card?'backdrop':'background',reason:'现金储备指标与场景背景'}));
  const details=[0,1,2,3].map(i=>({index:i,displayLines:[i===3?'储备规模':'现金'],elementPlan:i===3?'真实数位逐位滚动锁定':'背景视频与短标题',
    captionHighlights:[i===3?'现金储备':''],...(i===3 ? {templateParams:params} : {})}));
  let calls=0;
  const sb=await executeAModeRun(isolated,runId,{resumeFromDirector:true,tts:async()=>{throw new Error('Must retain frozen fixture audio');},
    director:async(prompt,{phase})=>{
      calls++;assert.ok(prompt.includes('data/odometer-digit-roll') && prompt.includes('144帧') && prompt.includes('最多6个数位'));
      return {shots:phase==='global'?globals:details};
    }});
  assert.equal(calls,2);assert.deepEqual(sb.shots.map(shot=>shot.durationInFrames),[30,60,60,144]);
  assert.deepEqual(sb.shots[3].templateParams,params);
  const preflight=()=>preflightAModeRender(isolated,{runId,runDir:dir,probe:()=>9.8});
  assert.equal(preflight().shots[3].shotCard,'data/odometer-digit-roll');
  fs.appendFileSync(path.join(isolated,'demos/data/odometer-digit-roll/odometer-contract.mjs'),'\n');
  assert.throws(preflight,/尚未完成当前版本/);
});

test('odometer passes the real adapter, two director layers and storyboard without losing digits',()=>{
  const id='data/odometer-digit-roll';
  for (const value of [0,12.34,999999]) {
    const params={value,unit:'元',label:'现金储备',evidence:`现金储备${value}元`};
    const shot={text:'现金底气',lines:['现金底气'],narration:params.evidence,durationInFrames:144,templateParams:params};
    const props=exports.translateShot(id,shot);
    assert.equal(props.value,value);assert.equal(props.unit,'元');assert.equal(props.label,'现金储备');assert.equal(props.title,'现金底气');
    assert.throws(()=>exports.translateShot(id,{...shot,durationInFrames:143}));
    assert.throws(()=>exports.translateShot(id,{...shot,narration:'无数值'}));
    assert.throws(()=>exports.translateShot(id,{...shot,templateParams:undefined}));
    const segments=[{text:params.evidence,fromFrame:0,durationInFrames:144}];
    const globals=[{fromSegment:0,toSegment:1,type:'claim',card:id,material:null,materialRole:'none',reason:'突出指标'}];
    validateGlobalPlan({shots:globals},segments,[],{availableCards:[id]});
    const details={shots:[{index:0,displayLines:['现金底气'],elementPlan:'真实数位逐位锁定',captionHighlights:['现金储备'],templateParams:params}]};
    validateShotPlan(details,globals,segments);
    const sb=buildStoryboard(root,'odometer-test',{fps:30,totalFrames:144,segments},globals,details.shots,{});
    assert.deepEqual(sb.shots[0].templateParams,params);
  }
});

test('global and per-shot director preserve verified data into the storyboard',()=>{
  const segments=[{text:params.evidence,fromFrame:0,durationInFrames:138}];
  const globals=[{fromSegment:0,toSegment:1,type:'claim',card,material:null,materialRole:'none',reason:'突出储备指标'}];
  assert.deepEqual(validateGlobalPlan({shots:globals},segments,[],{availableCards:[card]}),globals);
  const details={shots:[{index:0,displayLines:['留住现金'],elementPlan:'数字冲刺到位后停留',captionHighlights:['应急储备'],templateParams:params}]};
  validateShotPlan(details,globals,segments);
  const storyboard=buildStoryboard(root,'test',{fps:30,totalFrames:138,segments},globals,details.shots,{});
  assert.deepEqual(storyboard.shots[0].templateParams,params);
  assert.throws(()=>validateGlobalPlan({shots:globals},[{...segments[0],durationInFrames:60}],[]));
  assert.throws(()=>validateShotPlan(details,globals,[{...segments[0],text:'本镜头没有数值'}]));
});
