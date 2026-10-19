import {selectTalkcraftContinuation} from './talkcraft-orchestration-policy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {repairPresentationSource,installPresentationCorrections} from './talkcraft-presentation-correction.mjs';
import {approvePresentationCorrection} from './talkcraft-presentation-approval.mjs';
import {auditVisualContent} from './talkcraft-visual-content-contract.mjs';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {hostStageStyle} from './talkcraft-host-context.mjs';
const skill=path.resolve('_audit/video-talkcraft');
const catalog=loadTalkcraftGovernedCatalog(JSON.parse(fs.readFileSync(path.join(skill,'references/cards-index.json'))));
test('独立演示外壳整体移除，含业务兄弟、真实视频或动态属性的容器不匹配',()=>{
 assert.equal(repairPresentationSource('<div className="badge"><HostSilhouette /></div>','gen/a.tsx').includes('<div'),false);
 for(const input of ['<div className="badge"><HostSilhouette /><span>真实说明</span></div>','<div style={{opacity:t}}><HostSilhouette /></div>','<div className="badge"><OffthreadVideo /></div>'])assert.equal(repairPresentationSource(input,'gen/a.tsx'),input);
});
test('正式源码安装可重复，先审批再写入并留原件；自定义源变化拒绝覆盖',t=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'presentation-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const root=path.join(base,'skill'),src=path.join(base,'project/remotion/src');
 for(const dir of ['workbench/src/cards/gen','template/cards'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 fs.mkdirSync(path.join(src,'parameterized-cards/gen'),{recursive:true});
 for(const n of ['source-run.json','input.txt','aligned-sentences.json','audio/full.mp3','remotion/shots.json']){const f=path.resolve(src,'../..',n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,n==='source-run.json'?JSON.stringify({runId:'aaaaaaaa-bbbb-cccc-dddd-777777777777'}):'protected');}
 const name='map-route-pin.tsx',original=fs.readFileSync(path.join(skill,'workbench/src/cards/gen',name),'utf8');
 fs.writeFileSync(path.join(root,'workbench/src/cards/gen',name),original);fs.writeFileSync(path.join(src,'parameterized-cards/gen',name),original);
 fs.writeFileSync(path.join(src,'talkcraft-template-adapter.tsx'),fs.readFileSync('director/talkcraft-template-adapter.tsx'));
 const first=installPresentationCorrections(root,src);assert.equal(first.approval.approved,true);assert.equal(first.externalRequests,0);
 const output=fs.readFileSync(path.join(src,'parameterized-cards/gen',name),'utf8');
 installPresentationCorrections(root,src);assert.equal(fs.readFileSync(path.join(src,'parameterized-cards/gen',name),'utf8'),output);
 const titleName='behind-text-title.tsx',titleOriginal=fs.readFileSync(path.join(skill,'workbench/src/cards/gen',titleName),'utf8');
 fs.writeFileSync(path.join(root,'workbench/src/cards/gen',titleName),titleOriginal);
 fs.writeFileSync(path.join(src,'parameterized-cards/gen',titleName),repairPresentationSource(titleOriginal,'gen/'+titleName,{legacyTitle:true}));
 installPresentationCorrections(root,src);
 assert.equal(fs.readFileSync(path.join(src,'parameterized-cards/gen',titleName),'utf8'),repairPresentationSource(titleOriginal,'gen/'+titleName));
 fs.appendFileSync(path.join(src,'parameterized-cards/gen',name),'CUSTOM');assert.throws(()=>installPresentationCorrections(root,src),/不能被展示修正覆盖/);
});
test('中心拒绝篡改方案、外部请求和假人工通过',()=>{
 const p={schema:'talkcraft-presentation-correction-v1',runId:'aaaaaaaa-bbbb-cccc-dddd-777777777777',inputs:{input:'sha'},files:[{relative:'gen/a.tsx',beforeSha256:'a',afterSha256:'b'}],externalRequests:0,userAcceptance:false};
 assert.equal(approvePresentationCorrection(p,structuredClone(p)).approved,true);
 for(const patch of [{externalRequests:1},{userAcceptance:true},{files:[]}])assert.throws(()=>approvePresentationCorrection({...p,...patch},p),/中心/);
});
test('标题与说明完整保留，字体与换行修改不触碰动效时钟；来源字号不能变成字级重写',()=>{
 for(const key of ['gen/behind-text-title.tsx','source-converge.tsx','gen/line-by-line-slide.tsx','gen/host-shrink-to-chip.tsx']){
  const original=fs.readFileSync(path.join(skill,key.startsWith('gen/')?'workbench/src/cards':'template/cards',key),'utf8');
  const fixed=repairPresentationSource(original,key);
  assert.equal(fixed.match(/const (?:FIXED|CONFIG) = \{[\s\S]*?\n\};/u)?.[0],original.match(/const (?:FIXED|CONFIG) = \{[\s\S]*?\n\};/u)?.[0]);
  assert.ok(!fixed.includes('substring('));assert.match(fixed,/TEXT_LAYOUT_CAPACITY|<tspan|empty demo avatar ring removed/);
  if(key.includes('host-shrink'))assert.ok(!fixed.includes('opacity: ringOp, pointerEvents'));
  if(key.includes('behind-text-title')){assert.match(fixed,/hasHost \? 538 : 864/);assert.match(fixed,/right: hasHost \? "34%"/);assert.notEqual(fixed,repairPresentationSource(original,key,{legacyTitle:true}));}
 }
});
test('新任务同样核验容量与人物安全区，不依赖本次镜号',()=>{
 const s=(shotCard,props,subject='other')=>({id:'brand-new-task-shot',shotCard,subject,start:0,end:4,templateParams:{cardProps:props}});
 assert.equal(auditVisualContent([s('behind-text-title',{title:'经济不是冰冷机器'})],{catalog}).passed,true);
 assert.ok(auditVisualContent([s('behind-text-title',{title:'这是非常非常非常非常非常长的标题'})],{catalog}).issues.some(i=>i.code==='TEXT_LAYOUT_CAPACITY'));
 assert.ok(auditVisualContent([s('map-route-pin',{pinsDsl:'40|300|会被人物挡住'},'person')],{catalog}).issues.some(i=>i.code==='HOST_CONTENT_REGION_CONFLICT'));
 assert.equal(hostStageStyle('source-converge').display,'none');
 assert.equal(hostStageStyle('scanline-annotate').display,'none');
});

test('前端只提交当前待审片修正意图，后端选择免费阶段，不能指定阶段或带费用',()=>{
 const run={provenance:{verified:true},qaPassed:true,reviewPassed:false,nextStage:'approve-final'};
 assert.equal(selectTalkcraftContinuation(run,{intent:'continue',repairPresentation:true}),'presentation-repair');
 assert.equal(selectTalkcraftContinuation({...run,qaPassed:false,final:true,nextStage:'qa',lastFailure:{code:'TASK_FAILED'}},{intent:'continue',repairPresentation:true}),'presentation-repair');
 for(const patch of [{activeTask:{id:1}},{reviewPassed:true},{qaPassed:false}])assert.throws(()=>selectTalkcraftContinuation({...run,...patch},{intent:'continue',repairPresentation:true}),/展示修正/);
 assert.throws(()=>selectTalkcraftContinuation(run,{intent:'continue',repairPresentation:true,approveModelCost:true}),/费用/);
 const recover={...run,qaPassed:false,final:true,nextStage:'editorial-check',correctionCenter:{issues:[{code:'ATTENTION_TARGET_BOUNDS',repair:'presentation-integrity'}]}};
 assert.equal(selectTalkcraftContinuation(recover,{intent:'continue',repairPresentation:true}),'presentation-repair');
 for(const correctionCenter of [{issues:[]},{issues:[{code:'OTHER',repair:'presentation-integrity'}]},{issues:[...recover.correctionCenter.issues,{code:'MISSING_CONTENT'}]}])
  assert.throws(()=>selectTalkcraftContinuation({...recover,correctionCenter},{intent:'continue',repairPresentation:true}),/展示修正/);
});

test('渲染中规则版本过期可回免费正式修正，其他渲染错误不得借此跳过',()=>{
 const run={provenance:{verified:true},reviewPassed:false,nextStage:'render-all',lastFailure:{task:{name:'talkcraft-render-all'},cause:'展示修正合同缺失、过期或未通过治理中心审批'}};
 assert.equal(selectTalkcraftContinuation(run,{intent:'continue',repairPresentation:true}),'presentation-repair');
 assert.throws(()=>selectTalkcraftContinuation({...run,lastFailure:{...run.lastFailure,cause:'OTHER'}},{intent:'continue',repairPresentation:true}));
});
