import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {cardStageLayout,nativeCardSkin,subtitleSkin} from './talkcraft-presentation-skin.mjs';
import {installPresentationSkin} from './talkcraft-presentation-install.mjs';
import {minimumContrast,compositeColor} from './talkcraft-color-contrast.mjs';

test('实际42px正文缩到390px手机后仍达12px，保留独立字幕区',()=>{
 for(const [width,height] of [[1920,1080],[1080,1920]]){
  const p=cardStageLayout(width,height);
  assert.ok(42*p.scale*390/width>=12);
  assert.ok(p.left>=0&&p.left+960*p.scale<=width);
  assert.ok(p.top+540*p.scale<=height*(height>width?.73:.82)+.01);
 }
 assert.throws(()=>cardStageLayout(0,1080),/画幅/);
 const material=cardStageLayout(1920,1080,{separateMaterial:true});assert.ok(material.top>=1080*.55);
});
test('长关键词预留原生1.65倍弹出空间，只改演示语境与间距',()=>{
 const props={keyword:'很有意思的现象',fontSize:42},before=JSON.stringify(props);
 const css=nativeCardSkin({shotId:'s01',cardId:'keyword-pop-highlight',humanLayout:'none',cardProps:props,keywordEventId:'s01-text-2'});
 assert.match(css,/display:none/);assert.match(css,/top:50%/);
 const margin=Number(/margin-inline:([\d.]+)px/.exec(css)[1]);assert.ok(margin>=7*42*.65/2);
 assert.equal(JSON.stringify(props),before);assert.doesNotMatch(css,/scale\(|animation|opacity|font-size/);
});
test('浅底白字幕自动取可读色，已有合格字色保持，黑白底床均达到4.5',()=>{
 for(const surface of ['#ffffff','#111817']){
  const theme={surface,background:surface,captionColor:'#ffffff'},skin=subtitleSkin(theme);
  assert.ok(minimumContrast(skin.color,['#000000','#ffffff'].map(bg=>compositeColor(surface,bg,.76)))>=4.5);
  if(surface==='#111817')assert.equal(skin.color,'#ffffff');
 }
 assert.equal(subtitleSkin({surface:'#ffffff',background:'#ffffff',captionColor:'#111817'}).color,'#111817');
});

test('可读性蒙皮只在分镜明确声明后生效，不改输入参数或原卡运动',()=>{
 const base={shotId:'s11',cardId:'step-timeline-vertical',humanLayout:'none',cardProps:{titleSize:34}};
 assert.doesNotMatch(nativeCardSkin(base),/font-size/);
 const css=nativeCardSkin({...base,readabilityLayout:'mobile-readable-v1'});
 assert.match(css,/font-size:42px/);assert.doesNotMatch(css,/opacity|transform|animation|visibility/);
 assert.equal(base.cardProps.titleSize,34);
 assert.throws(()=>nativeCardSkin({...base,readabilityLayout:'unknown'}),/未知/);
});
test('恢复已有工程时仅升级识别出的公共容器与字幕，不覆盖用户代码，重复安装幂等',t=>{
 const project=fs.mkdtempSync(path.join(os.tmpdir(),'talkcraft-skin-'));t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
 const src=path.join(project,'remotion/src');fs.mkdirSync(path.join(src,'scenes'),{recursive:true});
 fs.writeFileSync(path.join(src,'scenes/scene-shared.tsx'),`// user's scene\nconst scale = Math.min(width*.90/960,height*(material && p.materialRole !== 'background' ? .36 : .64)/540);\nconst position={left:(width-960*scale)/2,top:material && p.materialRole !== 'background'?height*.55:portrait?height*.27:(height-540*scale)/2};`);
 fs.writeFileSync(path.join(src,'Subtitles.tsx'),"// user's phrase function\ncolor:'var(--sc-caption-color, var(--sc-text))', background:'color-mix(in srgb, var(--sc-surface) 76%, transparent)'\n>{text}</div>");
 installPresentationSkin(project);
 const a=fs.readFileSync(path.join(src,'scenes/scene-shared.tsx'),'utf8'),b=fs.readFileSync(path.join(src,'Subtitles.tsx'),'utf8');
 assert.match(a,/cardStageLayout/);assert.doesNotMatch(a,/\.64\)\/540/);assert.match(b,/user's phrase/);assert.match(b,/data-readable-caption/);
 installPresentationSkin(project);assert.equal(fs.readFileSync(path.join(src,'scenes/scene-shared.tsx'),'utf8'),a);assert.equal(fs.readFileSync(path.join(src,'Subtitles.tsx'),'utf8'),b);
 const canonical=fs.readFileSync('director/talkcraft-scene-shared.tsx','utf8');
 fs.writeFileSync(path.join(src,'scenes/scene-shared.tsx'),canonical);installPresentationSkin(project);
 assert.equal(fs.readFileSync(path.join(src,'scenes/scene-shared.tsx'),'utf8'),canonical);
});
