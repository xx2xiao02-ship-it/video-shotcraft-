import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {SCREEN_CARD_IDS,validateScreenCardParams} from './screen-card-contracts.mjs';
import {assertScreenCardAssets} from './screen-card-assets.mjs';

const root=path.resolve(import.meta.dirname,'..');
const capture=JSON.parse(fs.readFileSync(path.join(root,'template/out/card-business-media-batch013-v6/capture.json')));
const source=name=>{const row=capture.captures.find(row=>row.name===name);return {
  src:'card-media/'+row.name+'.png',kind:'image',width:row.width,height:row.height,sha256:row.sha256};};
test('screen contracts preserve exact records, measured target and mode order',()=>{
  const screen=source('all'),targetRect=capture.captures[0].dom.targetRect;
  const params={screen,targetRect};
  const result=validateScreenCardParams('effects/fui-hud-moves/reticle-lock-on',params);
  assert.deepEqual(result,params);assert.notEqual(result.screen,screen);
  const modes={screens:[screen,source('gaps')],portraitScreens:[source('all-portrait'),source('gaps-portrait')]};
  assert.deepEqual(validateScreenCardParams('effects/brand-frame-snap',modes),modes);
  assert.equal(SCREEN_CARD_IDS.size,7);
  assert.equal(validateScreenCardParams('effects/spotlight-sweep-moves/unknown',params),undefined);
});
test('rejects invented paths, duplicate media, malformed targets, dropped fields and short phone screenshots',()=>{
  const screen=source('all'),targetRect=capture.captures[0].dom.targetRect;
  const id='effects/fui-hud-moves/reticle-lock-on';
  for(const value of [{},{screen},{screen,targetRect:null},{screen,targetRect:{...targetRect,x:1900}},
    {screen:{...screen,src:'card-media/../secret.png'},targetRect},
    {screen:{...screen,kind:'video'},targetRect},
    {screen:{...screen,sha256:'invented'},targetRect},{screen,targetRect,unexpected:1}])
    assert.throws(()=>validateScreenCardParams(id,value));
  assert.throws(()=>validateScreenCardParams('effects/brand-frame-snap',{screens:[screen,{...screen,src:'card-media/alias.png'}]}));
  assert.throws(()=>validateScreenCardParams('effects/radial-ripple-phone-chips',{screen:{...source('phone'),height:1600}}));
  assert.deepEqual(validateScreenCardParams('effects/radial-ripple-phone-chips',{screen:source('phone')}),{screen:source('phone')});
});
test('actual frozen screenshots have declared PNG dimensions and hashes',()=>{
  for(const row of capture.captures){
    const bytes=fs.readFileSync(path.join(root,'template/out/card-business-media-batch013-v6',row.file));
    assert.equal(bytes.readUInt32BE(16),row.width);assert.equal(bytes.readUInt32BE(20),row.height);
  }
  assert.equal(assertScreenCardAssets(root,'unknown',{}),undefined);
});
test('preflight asset check reads actual frozen files and rejects wrong dimensions or hashes',()=>{
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'template/fixtures/card-business-text-batch013-media-v2.json')));
  for(const item of fixture.cards) assert.deepEqual(assertScreenCardAssets(root,item.id,item.templateParams),item.templateParams);
  const item=fixture.cards[0];
  const phone=fixture.cards.find(item=>item.id==='effects/radial-ripple-phone-chips');
  assert.throws(()=>assertScreenCardAssets(root,phone.id,{...phone.templateParams,
    screen:{...phone.templateParams.screen,width:539}}),/actual PNG/);
  assert.throws(()=>assertScreenCardAssets(root,item.id,{...item.templateParams,
    screen:{...item.templateParams.screen,sha256:'0'.repeat(64)}}),/SHA differs/);
});
