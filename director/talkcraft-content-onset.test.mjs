import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {checkContentOnset} from './talkcraft-content-onset.mjs';
const shot={id:'s04',shotCard:'numbered-step-stack',start:14.400208,end:24.425291,subject:'other'};
const e=(localFrame,text='经济冷了')=>({id:'s04-word',beatId:'s04',localFrame,text,role:'spoken'});
test('回归真实任务中3.5秒和2.733秒等待关键词的编排缺口',()=>{
  for(const localFrame of [105,82]){
    const report=checkContentOnset([shot],{fps:30,events:[e(localFrame)]});
    assert.equal(report.passed,false);assert.equal(report.issues[0].delaySec,localFrame/30);
    assert.equal(report.issues[0].code,'CONTENT_ONSET_GAP');
  }
});
test('按帧核验首秒边界，标点及延期文字不能冒充初始内容',()=>{
  assert.equal(checkContentOnset([shot],{events:[e(30)]}).passed,true);
  assert.equal(checkContentOnset([shot],{events:[e(31),e(0,'？')]}).passed,false);
  assert.equal(checkContentOnset([shot],{events:[{...e(0),deferredTo:'s05'},e(105)]}).passed,false);
});
test('装饰编号箭头及越界事件不能代替关键词前的主体内容',()=>{
  for(const text of ['01','1|2','→→','★★'])assert.equal(checkContentOnset([shot],{events:[e(0,text),e(105)]}).passed,false);
  assert.equal(checkContentOnset([shot],{events:[e(-1),e(999),e(105)]}).passed,false);
  assert.equal(checkContentOnset([shot],{events:[{...e(0,'2026'),anchor:'2026',spokenSec:shot.start}]}).passed,true);
});
test('当前语义上下文可承接，但晚出现的context不能借角色声明绕过',()=>{
  assert.equal(checkContentOnset([shot],{events:[{...e(0,'过去的理解'),role:'context',reason:'当前句子话题'},e(105)]}).passed,true);
  assert.equal(checkContentOnset([shot],{events:[{...e(105),role:'context'}]}).passed,false);
});
test('人物承接属于规划职责，不冒充实际素材或视觉验收',()=>{
  const report=checkContentOnset([{...shot,subject:'person'}],{events:[e(105)]});
  assert.equal(report.passed,true);assert.equal(report.checks[0].mediaAdmissionVerified,false);
  assert.equal(report.userAcceptance,false);assert.equal(report.visualVerified,false);
});
test('真实本地素材路径可承接；检索文案、缺失素材、目录越界和非媒体文件不能放行',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'content-onset-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const pub=path.join(root,'remotion/public');fs.mkdirSync(pub,{recursive:true});
  fs.writeFileSync(path.join(pub,'clip.mp4'),'fixture-path-only');fs.writeFileSync(path.join(pub,'config.json'),'{}');
  const check=src=>checkContentOnset([{...shot,templateParams:{cardProps:{src},materialQuery:'真正素材还没找到'}}],{events:[e(105)]},{project:root});
  assert.equal(check('remotion/public/clip.mp4').passed,true);
  for(const value of ['missing.mp4','../../outside.mp4','https://remote/clip.mp4','config.json'])assert.equal(check(value).passed,false);
});
