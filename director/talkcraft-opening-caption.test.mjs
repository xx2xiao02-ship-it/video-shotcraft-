import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openingChoiceEvidence,OPENING_CHOICE_RULES} from './talkcraft-opening-choice.mjs';
import {captionKeyword,captionPop} from './talkcraft-caption-style.mjs';
test('开场线索保留用途字段，标签不变成白名单',()=>{
 assert.equal(openingChoiceEvidence({position:'开场',energy:'高',semantics:['钩子']}).openingClues.hookSemantic,true);
 assert.equal(openingChoiceEvidence({semantics:['强调']}).openingClues.hookSemantic,false);
 assert.match(OPENING_CHOICE_RULES,/非白名单/);assert.match(OPENING_CHOICE_RULES,/字幕样式独立/);
 const source=fs.readFileSync(new URL('./talkcraft-ark-editorial.mjs',import.meta.url),'utf8');
 assert.match(source,/\.\.\.openingChoiceEvidence\(card,\{skillRoot\}\)/);assert.doesNotMatch(source,/oneliner:.*slice/);
 assert.match(source,/\$\{OPENING_CHOICE_RULES\}/);
});
test('统一字幕只使用当前句已有的真实关键词锚点',()=>{
 const line={text:'发现一个有趣现象',start:0,end:3};
 const event={field:'keyword',role:'spoken',text:'有趣现象',spokenSec:1};
 assert.deepEqual(captionKeyword(line,[event]),{before:'发现一个',keyword:'有趣现象',after:'',start:1});
 for(const e of [{...event,spokenSec:4},{...event,text:'不存在'},{...event,role:'carry'}])assert.equal(captionKeyword(line,[e]),null);
 assert.equal(captionKeyword(line,[]),null);
});
test('等待关键词时正文完整可见，弹出只动字幕不动场景与口型',()=>{
 assert.deepEqual(captionPop(-1),{scale:1,rotate:0,active:false});
 assert.equal(captionPop(.18).scale,1.65);assert.equal(captionPop(1).scale,1.15);
 const source=fs.readFileSync(new URL('./talkcraft-keyword-caption.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/opacity:|OffthreadVideo|Audio/);assert.match(source,/keyword\.keyword/);
 const ui=fs.readFileSync(new URL('../console-ui.html',import.meta.url),'utf8');
 assert.match(ui,/id="b-caption-style-card"/);assert.match(ui,/静态样式示意/);
});
