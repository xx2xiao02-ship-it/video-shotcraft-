import test from 'node:test';
import assert from 'node:assert/strict';
import {cardOwnsNarrationCaption} from './talkcraft-presentation-skin.mjs';
test('完整双句模板字幕去重，不能仅因包含短语隐藏额外口播',()=>{
 const shot={shotCard:'keyword-pop-highlight',startSec:2.36,durationSec:2.445,templateParams:{cardProps:{textBefore:'很多国际大奖',keyword:'听着宏大',textAfter:'，'}}};
 const phrases=[{text:'先前一句',start:0},{text:'很多国际大奖',start:2.4},{text:'听着宏大',start:3.6},{text:'下一句',start:4.9}];
 assert.equal(cardOwnsNarrationCaption(shot,'很多国际大奖',phrases),true);
 assert.equal(cardOwnsNarrationCaption(shot,'听着宏大',phrases),true);
 assert.equal(cardOwnsNarrationCaption(shot,'下一句',phrases),false);
 assert.equal(cardOwnsNarrationCaption(shot,'听着宏大'),false);
 assert.equal(cardOwnsNarrationCaption({...shot,startSec:2.3600416},'很多国际大奖',phrases.map(p=>p.text==='很多国际大奖'?{...p,start:2.36}:p)),true);
 assert.equal(cardOwnsNarrationCaption(shot,'听着宏大',[...phrases,{text:'未显示的口播',start:4.5}]),false);
 assert.equal(cardOwnsNarrationCaption({...shot,shotCard:'type-contrast-emphasis'},'听着宏大',phrases),false);
});
