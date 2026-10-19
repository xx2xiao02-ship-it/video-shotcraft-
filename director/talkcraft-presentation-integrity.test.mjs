import {installHostContextRuntime} from './talkcraft-host-context-install.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {attentionRegions,transitionContinuity,preparePresentationIntegrity,assertPresentationIntegrity,auditIntegrityPlan} from './talkcraft-presentation-integrity.mjs';
import {repairPresentationSource} from './talkcraft-presentation-correction.mjs';
import {approvePresentationIntegrity} from './talkcraft-presentation-approval.mjs';
import {hostPresentationDecision,hostStageStyle,shouldRenderHost} from './talkcraft-host-context.mjs';
import {contrastRatio,crossfadeBackground,readableInkOnSingleBackground} from './talkcraft-color-contrast.mjs';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'integrity-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const write=(n,v)=>{const f=path.join(dir,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v));};
 const png=Buffer.alloc(24);png.write('\x89PNG');png.writeUInt32BE(600,16);png.writeUInt32BE(396,20);
 write('remotion/public/doc.png',png);write('remotion/public/coords.json',{url:'https://example.gov.cn/policy',text:'政策预期及信心',detailBounds:{x:0,y:0,width:600,height:396},deviceScaleFactor:1,headings:[]});
 write('source-run.json',{runId:'aaaaaaaa-bbbb-cccc-dddd-777777777777'});write('input.txt','当前任务');write('aligned-sentences.json',{});write('audio/full.mp3','paid-voice');
 write('remotion/native-presentation.json',{});write('remotion/word-reveal-plan.json',{events:[]});write('remotion/word-reveals.json',{events:[]});
 write('remotion/shots.json',[{id:'new-shot',subject:'other',shotCard:'cursor-actor-demo',templateParams:{cardProps:{winTitle:'政策预期'}}}]);
 write('material-research-plan.json',{shots:[{shotId:'source',bindings:[{sourceVerified:true,licenseVerified:true,license:'verified-document',licenseUrl:'https://example.gov.cn/license',sourceUrl:'https://example.gov.cn/policy',localPath:'doc.png',sourceCoordinates:'coords.json',sha256:sha(png),contentLanguage:'zh-CN'}]}]});
 return {dir,write};
}
test('原文定位经过裁切和contain换算，不使用编导任意坐标',()=>{
 const m={detailBounds:{x:100,y:200,width:1000,height:500},deviceScaleFactor:1,headings:[{text:'下调政策利率',x:200,y:250,width:200,height:30}]};
 const r=attentionRegions({labels:['政策利率'],metadata:m,imageWidth:1000,imageHeight:500});
 assert.equal(r.mode,'source-annotation');assert.equal(r.regions[0].x,60);assert.equal(r.regions[0].y,78);assert.equal(r.regions[0].h,18);
});
test('隐喻、重复命中、裁切外文字和过期截图不制造资料引用框',()=>{
 const metadata={detailBounds:{x:0,y:0,width:600,height:396},headings:[{text:'利率',x:10,y:400,width:30,height:20},{text:'利率',x:20,y:40,width:30,height:20}]};
 for(const [labels,w]of [[['拧旋钮'],600],[['利率'],600],[['利率'],900]]){
  const r=attentionRegions({labels,metadata,imageWidth:w,imageHeight:396});assert.equal(r.mode,'document-context');assert.equal(r.regions.length,0);
 }
});
test('第12镜空档用已说出的A承接到B字级锚点，不提前B或改变时钟',()=>{
 const r=transitionContinuity({id:'new'},[{beatId:'new',field:'textA',localFrame:23},{beatId:'new',field:'textB',localFrame:101},{beatId:'other',field:'textB',localFrame:1}]);
 assert.equal(r.firstFrame,23);assert.equal(r.secondFrame,101);assert.equal(r.changesSpeechClock,false);
 assert.throws(()=>transitionContinuity({id:'new'},[{beatId:'old',field:'textB',localFrame:2}]),/字级事件/);
});

test('粒子转场切点后仍是浅色交叠时，正文承接与标签不能直接取深底白字',()=>{
 for(let i=0;i<=100;i++){
  const bg=crossfadeBackground('#f7f5f0','#0a2a5a',i/100),ink=readableInkOnSingleBackground('#ffffff',bg);
  assert.ok(contrastRatio(ink,bg)>=4.5);
 }
 assert.equal(readableInkOnSingleBackground('#ffffff',crossfadeBackground('#f7f5f0','#0a2a5a',.04)),'#111817');
 assert.throws(()=>crossfadeBackground('#fff','#000',2),/透明度/);
 const root=resolveTalkcraftSkillRoot(process.cwd()),n='gen/particle-weld-transition.tsx',original=fs.readFileSync(path.join(root,'workbench/src/cards',n),'utf8');
 const current=repairPresentationSource(original,n),old=repairPresentationSource(original,n,{legacyV2:true});
 assert.match(current,/background=\{visibleBg\}/);assert.match(current,/color: readableInk\("#8a8a8a",visibleBg\)/);
 assert.match(old,/background=\{bgB\}/);assert.notEqual(current,old);
});
test('正式素材链先联网，复用已授权在线原件；重复继续不重复搜索或生成',async t=>{
 const f=fixture(t),calls=[];
 const options={discover:async()=>{calls.push('discover');return {candidates:[],errors:[]};},fetchImpl:async url=>{calls.push('verify');return {ok:true,url,text:async()=> '政策预期及信心'};}};
 const r=await preparePresentationIntegrity(f.dir,options);assert.deepEqual(calls,['discover','verify']);assert.equal(r.approval.approved,true);
 const plan=JSON.parse(fs.readFileSync(path.join(f.dir,'remotion/presentation-integrity.json')));assert.equal(plan.shots[0].media.role,'context');assert.equal(plan.shots[0].media.notEvidenceForNarration,true);
 const repeated=await preparePresentationIntegrity(f.dir,options);assert.equal(repeated.reused,true);assert.deepEqual(calls,['discover','verify']);
 assertPresentationIntegrity(f.dir);f.write('input.txt','另一个任务');assert.throws(()=>assertPresentationIntegrity(f.dir),/过期/);
});
test('仅有线上候选或本地文件不推断许可，不签发通过',async t=>{
 const f=fixture(t);f.write('material-research-plan.json',{shots:[]});
 await assert.rejects(()=>preparePresentationIntegrity(f.dir,{root:f.dir,discover:async()=>({candidates:[{url:'https://x'}]}),fetchImpl:async()=>({ok:false})}),/许可约束/);
 assert.equal(fs.existsSync(path.join(f.dir,'remotion/presentation-integrity.json')),false);
});
test('来源文件更换及审批后任意改方案均拒绝恢复',async t=>{
 const f=fixture(t);await preparePresentationIntegrity(f.dir,{discover:async()=>({candidates:[]}),fetchImpl:async url=>({ok:true,url,text:async()=> '政策预期'})});
 const file=path.join(f.dir,'remotion/presentation-integrity.json'),p=JSON.parse(fs.readFileSync(file));
 p.shots[0].media.localPath='other.png';f.write('remotion/presentation-integrity.json',p);assert.throws(()=>assertPresentationIntegrity(f.dir),/过期/);
});
test('中心拒绝费用扩大、用户代审和规则版本不同',()=>{
 const p={schema:'presentation-integrity-v1',runId:'run',inputs:{x:'sha'},rulesSha256:'rule',paidCalls:0,userAcceptance:false,shots:[]},context={inputs:{x:'sha'},rulesSha256:'rule',audit:{passed:true}};
 assert.equal(approvePresentationIntegrity(p,context).approved,true);
 for(const patch of [{paidCalls:1},{userAcceptance:true},{rulesSha256:'old'}])assert.throws(()=>approvePresentationIntegrity({...p,...patch},context),/中心/);
 assert.equal(auditIntegrityPlan({...p,schema:'old'}).passed,false);
});
test('不能把资料边上的细条当人物列；无可用区域时保留素材、抑制遮挡轨道',()=>{
 for(const id of ['scanline-annotate','source-converge','gallery-wall-dolly','map-route-pin','ink-underline']){
  assert.equal(hostPresentationDecision(id).mode,'suppressed');assert.equal(hostStageStyle(id).display,'none');
 }
 assert.equal(hostPresentationDecision('behind-text-title').mode,'reserved-region');
});
test('七个受控源码升级可编译；时钟常量未变化，演示块真正替换为实名槽',()=>{
 const root=resolveTalkcraftSkillRoot(process.cwd()),ts=createRequire(path.join(root,'runtime/package.json'))('typescript');
 for(const n of ['gen/black-slam-transition.tsx','gen/particle-weld-transition.tsx','gen/overexpose-flip-transition.tsx','gen/cursor-actor-demo.tsx','gen/tilt-3d-page.tsx','gen/host-shrink-to-chip.tsx','scanline-annotate.tsx']){
  const original=fs.readFileSync(path.join(root,n.startsWith('gen/')?'workbench/src/cards':'template/cards',n),'utf8'),source=repairPresentationSource(original,n);
  const diagnostics=ts.transpileModule(source,{fileName:n,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ESNext}}).diagnostics;
  assert.deepEqual(diagnostics.map(d=>d.messageText),[],n);
  assert.equal(source.match(/const (?:FIXED|CONFIG) = \{[\s\S]*?\n\};/u)?.[0],original.match(/const (?:FIXED|CONFIG) = \{[\s\S]*?\n\};/u)?.[0]);
  if(n.includes('cursor')){assert.equal((source.match(/<PresentationMedia \/>/gu)||[]).length,4);assert.ok(!source.includes('<svg viewBox="0 0 88 62"'));}
  if(n.includes('tilt'))assert.ok(!source.includes('<div className="t3p-blk" />'));
  if(n.includes('host-shrink')){assert.ok(!source.includes('BAR_RECTS.map'));assert.match(source,/<PresentationMedia \/>/);assert.match(source,/years.map/);}
  if(n.includes('transition'))assert.match(source,/ContinuityText text=\{textA\}/);
 }
 assert.ok(contrastRatio('#ffffff','#f7f5f0')<1.2);
});

test('被治理隐藏的人物不挂载视频组件，避免无效解码和尾帧越界',()=>{
 for(const shotCard of ['scanline-annotate','source-converge','map-route-pin'])assert.equal(shouldRenderHost({subject:'person',shotCard}),false);
 assert.equal(shouldRenderHost({subject:'other',shotCard:'type-contrast-emphasis'}),false);
 assert.equal(shouldRenderHost({subject:'person',shotCard:'type-contrast-emphasis'}),true);
 const source=fs.readFileSync(new URL('./talkcraft-scaffold.mjs',import.meta.url),'utf8');
 assert.match(source,/shouldRenderHost\(shot\) && <div/);
});
test('恢复旧正式工程同步人物挂载规则且幂等，自定义实现拒绝覆盖',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'host-mount-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const src=path.join(dir,'remotion/src');fs.mkdirSync(src,{recursive:true});const file=path.join(src,'Main.tsx');
 fs.writeFileSync(file,"import {hostStageStyle} from './talkcraft-host-context.mjs';\n{shot.subject === 'person' && <div style={hostStageStyle(shot.shotCard) as React.CSSProperties}><OffthreadVideo /></div>}");
 installHostContextRuntime(dir);const code=fs.readFileSync(file,'utf8');assert.match(code,/shouldRenderHost\(shot\) &&/);installHostContextRuntime(dir);assert.equal(fs.readFileSync(file,'utf8'),code);
 fs.writeFileSync(file,'CUSTOM');assert.throws(()=>installHostContextRuntime(dir),/拒绝覆盖/);assert.equal(fs.readFileSync(file,'utf8'),'CUSTOM');
});