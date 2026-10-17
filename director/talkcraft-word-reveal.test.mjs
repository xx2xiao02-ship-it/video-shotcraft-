import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveReveal,normalizeText,normalizeCardText} from './talkcraft-word-reveal.mjs';
const timing={scenes:[{id:'s1',chars:[{ch:'想',t:.225,e:.415},{ch:'清',t:.415,e:.545},{ch:'楚',t:.545,e:.685},{ch:'想',t:2.575,e:2.785}]}]};
const beat={id:'v1',card:'card',startFrame:0,endFrame:100};
const e={id:'v1-text',text:'想清楚',anchor:'想清楚',sentence:'s1'};
test('真实发声秒转换为30fps帧，不回退到句首',()=>{
 const row=resolveReveal(timing,beat,e);assert.equal(row.spokenSec,.225);assert.equal(row.globalFrame,7);
 assert.equal(resolveReveal(timing,beat,{...e,text:'想',anchor:'想',occurrence:1}).globalFrame,77);
});
test('重复锚词必须有明确出现序号',()=>assert.throws(()=>resolveReveal(timing,beat,{...e,text:'想',anchor:'想'}),/重复/));
test('缺失锚词禁止使用0秒兜底',()=>assert.throws(()=>resolveReveal(timing,beat,{...e,anchor:'脑子'}),/找不到/));
test('无发声时长不是有效字级证据',()=>assert.throws(()=>resolveReveal({scenes:[{id:'s1',chars:[{ch:'想',t:0,e:0}]}]},beat,{...e,text:'想',anchor:'想'}),/无真实发声/));
test('摘要必须登记实际口播语义锚点及理由',()=>assert.throws(()=>resolveReveal(timing,beat,{...e,text:'先想清楚再开口'}),/摘要/));
test('跨拍早于本拍要明确carry，晚于本拍禁止提前展示',()=>{
 assert.throws(()=>resolveReveal(timing,{...beat,startFrame:30},e),/早于/);
 assert.throws(()=>resolveReveal(timing,{...beat,endFrame:10},{...e,text:'想',anchor:'想',occurrence:1}),/晚于/);
});
test('标点空锚点与越界序号被拒绝',()=>{
 assert.throws(()=>resolveReveal(timing,beat,{...e,anchor:'。'}),/只有标点/);
 assert.throws(()=>resolveReveal(timing,beat,{...e,text:'想',anchor:'想',occurrence:3}),/越界/);
});
test('显示文字正规化保留中文字符，忽略排版标记',()=>assert.equal(normalizeText('**想清楚**，\n 更快'), '想清楚更快'));
test('卡片 DSL 的分隔符不应阻断字级绑定',()=>assert.equal(
 normalizeCardText('政策落地|钱流到市场\n老百姓|拿到钱'),
 '政策落地钱流到市场老百姓拿到钱'));
test('非口播的上下文标签只需登记语义依据，不强求音频锚词',()=>{
 const row=resolveReveal(timing,beat,{id:'v1-context',text:'银行 App',anchor:'银行 App',sentence:'s1',role:'context',reason:'界面窗口标题'});
 assert.equal(row.globalFrame,0);assert.equal(row.spokenSec,null);
});
