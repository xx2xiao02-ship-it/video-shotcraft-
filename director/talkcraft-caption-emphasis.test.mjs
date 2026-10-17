import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {captionPhrases,compileCaptionEmphasis,captionEmphasisForLine,CAPTION_EMPHASIS_RULES} from './talkcraft-caption-emphasis.mjs';
import {installCaptionEmphasis,assertCaptionEmphasis,saveEditorialCaptionEmphasis} from './talkcraft-caption-emphasis-plan.mjs';
const scene=(id,text,start=0)=>({id,text,chars:Array.from(text,(ch,i)=>({ch,t:start+i*.137+.011,e:start+(i+1)*.137+.011}))});
const fixture=()=>{
 const timing={totalSec:8,scenes:[scene('s1','未来收入稳定。'),scene('s2','存钱不是消费。',2),scene('s3','不妨换个视角。',4)]};
 const plan={schema:'talkcraft-caption-emphasis-plan-v1',sentences:timing.scenes.map((s,i)=>({i,text:s.text,...(i<2?{keyword:i?'不是消费':'收入稳定',occurrence:1,reason:'原句的核心对比或条件'}:{keyword:'',skipReason:'引出下一结论的过渡句'})}))};
 return {timing,plan};
};
test('独立逐句重点从真实字符取时，向上取帧，不读取任何镜头或模板',()=>{
 const {timing,plan}=fixture(),snapshot=JSON.stringify(timing),r=compileCaptionEmphasis(plan,timing);
 assert.equal(r.passed,true);assert.equal(r.events.length,2);assert.equal(r.dependsOnShotCards,false);
 const e=r.events[0];assert.equal(e.spokenSec,timing.scenes[0].chars[2].t);assert.ok(e.startFrame/30>=e.spokenSec);assert.ok(e.startFrame/30-e.spokenSec<1/30);
 assert.equal(JSON.stringify(timing),snapshot);assert.equal(r.coverage.highlighted,2);assert.equal(r.coverage.ordinary,1);
 const line=captionPhrases(timing)[0];assert.deepEqual(captionEmphasisForLine(line,r.events),{before:'未来',keyword:'收入稳定',after:'',start:e.spokenSec});
 assert.equal(captionEmphasisForLine({...line,start:line.start+.01},r.events),null);
});
test('重复关键词绑定明确的第几次出现，不能取第一个凑数',()=>{
 const timing={totalSec:4,scenes:[scene('s1','收入稳定收入稳定。')]},plan={schema:'talkcraft-caption-emphasis-plan-v1',sentences:[{i:0,text:timing.scenes[0].text,keyword:'收入稳定',occurrence:2,reason:'强调后一次'}]};
 const r=compileCaptionEmphasis(plan,timing);assert.equal(r.passed,true);assert.equal(r.events[0].spokenSec,timing.scenes[0].chars[4].t);assert.equal(r.events[0].textStart,4);
 plan.sentences[0].occurrence=3;assert.equal(compileCaptionEmphasis(plan,timing).passed,false);
});
test('缺失句、原文错位、无依据空标和少数覆盖均不能通过',()=>{
 for(const mutate of [p=>p.sentences.pop(),p=>p.sentences[0].text='其他原文',p=>p.sentences[2].skipReason='',p=>{p.sentences[0]={...p.sentences[0],keyword:'',skipReason:'过渡'};}]){
  const {timing,plan}=fixture();mutate(plan);assert.equal(compileCaptionEmphasis(plan,timing).passed,false);
 }
});
test('禁止编造时间、跨显示短句、单字与超长色块，原字级时间不修改',()=>{
 const {timing,plan}=fixture();plan.sentences[0].start=0;assert.equal(compileCaptionEmphasis(plan,timing).passed,false);
 const t={totalSec:4,scenes:[scene('s1','收入，稳定。')]};
 const p={schema:'talkcraft-caption-emphasis-plan-v1',sentences:[{i:0,text:t.scenes[0].text,keyword:'收入，稳定',occurrence:1,reason:'跨句示例'}]};
 assert.match(compileCaptionEmphasis(p,t).issues.join(''),/跨显示短句|不跨标点/);
 p.sentences[0].keyword='入';assert.equal(compileCaptionEmphasis(p,t).passed,false);
});
test('生成器与渲染门禁共用规则，人工修订不被旧响应覆盖',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'caption-plan-'));try{
  fs.mkdirSync(path.join(dir,'remotion'),{recursive:true});const {timing,plan}=fixture();
  fs.writeFileSync(path.join(dir,'remotion/timing.json'),JSON.stringify(timing));
  assert.throws(()=>assertCaptionEmphasis(dir),/CAPTION_EMPHASIS_REQUIRED/);
  saveEditorialCaptionEmphasis(dir,{sentences:timing.scenes,captionEmphasis:plan});
  installCaptionEmphasis(dir);assert.equal(assertCaptionEmphasis(dir).passed,true);
  const file=path.join(dir,'remotion/caption-emphasis.json'),before=fs.readFileSync(file,'utf8');
  timing.scenes[0].chars[2].t+=.01;fs.writeFileSync(path.join(dir,'remotion/timing.json'),JSON.stringify(timing));
  assert.throws(()=>assertCaptionEmphasis(dir),/CAPTION_EMPHASIS_STALE/);assert.equal(fs.readFileSync(file,'utf8'),before);
  saveEditorialCaptionEmphasis(dir,{sentences:timing.scenes,captionEmphasis:{...plan,sentences:plan.sentences.map(r=>({...r,reason:'新响应'}))}});
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'remotion/caption-emphasis-plan.json'))).sentences[0].reason,plan.sentences[0].reason);
  assert.match(CAPTION_EMPHASIS_RULES,/顶层captionEmphasis/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
