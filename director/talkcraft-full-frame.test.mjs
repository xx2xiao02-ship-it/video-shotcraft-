import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {cardStageLayout,cardOwnsNarrationCaption} from './talkcraft-presentation-skin.mjs';
import {installPresentationSkin} from './talkcraft-presentation-install.mjs';

test('原卡横屏全幅，竖屏完整等比容纳，不裁切原构图',()=>{
 for(const [w,h] of [[960,540],[1920,1080],[1280,720]]){
  const p=cardStageLayout(w,h);assert.equal(p.left,0);assert.equal(p.top,0);
  assert.equal(960*p.scale,w);assert.equal(540*p.scale,h);
 }
 const p=cardStageLayout(1080,1920);assert.equal(p.scale,1.125);assert.equal(p.top,656.25);
});
test('仅关键词原卡的同句字幕去重，不隐藏不同文案',()=>{
 const shot={shotCard:'keyword-pop-highlight',templateParams:{cardProps:{textBefore:'发现一个',keyword:'有趣现象',textAfter:''}}};
 assert.equal(cardOwnsNarrationCaption(shot,'发现一个，有趣现象。'),true);
 assert.equal(cardOwnsNarrationCaption(shot,'另一个现象'),false);
 assert.equal(cardOwnsNarrationCaption({...shot,shotCard:'quote-card'},'发现一个有趣现象'),false);
 assert.equal(cardOwnsNarrationCaption({},''),false);
});
test('升级生成字幕使用正式切镜秒数，重复安装幂等',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'talkcraft-full-frame-'));
 try{
  const src=path.join(dir,'remotion/src');fs.mkdirSync(src,{recursive:true});
  const file=path.join(src,'Subtitles.tsx');
  fs.writeFileSync(file,'// preserved\nconst now=frame/fps;\nreturn line ? <SubtitleLine text={line.text} /> : null;');
  installPresentationSkin(dir);const first=fs.readFileSync(file,'utf8');
  assert.match(first,/s.startSec\+s.durationSec/);assert.match(first,/return line \? <KeywordCaption/);
  assert.match(first,/preserved/);installPresentationSkin(dir);assert.equal(fs.readFileSync(file,'utf8'),first);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
