import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {templateCaptionMask,templateCaptionRole,assertCaptionScene} from './talkcraft-caption-layer.mjs';
import {installPresentationSkin} from './talkcraft-presentation-install.mjs';
test('屏蔽口播字幕不按花字类别隐藏标题或图表',()=>{
 assert.match(templateCaptionMask('keyword-pop-highlight'),/data-native-card/);
 for(const id of ['type-contrast-emphasis','chart-grow','number-counter','impact-open-title','alt-block-lines']){
  assert.equal(templateCaptionMask(id),'');assert.equal(templateCaptionRole(id),'visual-information');
 }
 assert.throws(()=>assertCaptionScene({id:'s1',subject:'other',shotCard:'keyword-pop-highlight'}),/缺少主画面/);
 assert.doesNotThrow(()=>assertCaptionScene({id:'s1',subject:'person',shotCard:'keyword-pop-highlight'}));
});
test('字幕独立于CameraRig，放在根合成最后，重复安装幂等',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'caption-layer-'));
 try{
  const src=path.join(dir,'remotion/src');fs.mkdirSync(src,{recursive:true});
  const main=path.join(src,'Main.tsx');
  fs.writeFileSync(main,'const Main=()=> <AbsoluteFill><CameraRig><Scene/></CameraRig><Subtitles /><Overlays /></AbsoluteFill>;');
  installPresentationSkin(dir);const first=fs.readFileSync(main,'utf8');
  assert.equal((first.match(/<Subtitles\s*\/>/g)||[]).length,1);
  assert.ok(first.indexOf('data-final-caption-layer')>first.indexOf('</CameraRig>'));
  assert.ok(first.indexOf('data-final-caption-layer')>first.indexOf('<Overlays />'));
  assert.match(first,/zIndex:1000/);
  installPresentationSkin(dir);assert.equal(fs.readFileSync(main,'utf8'),first);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
