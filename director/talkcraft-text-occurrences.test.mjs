import test from 'node:test';
import assert from 'node:assert/strict';
import {textOccurrences,normalizeVisibleText,isPictogram,includeMatchedPunctuation} from './talkcraft-text-occurrences.mjs';
import {normalizeCardText} from './talkcraft-word-reveal.mjs';
import {validateTextBindings} from './talkcraft-word-runtime-validation.mjs';
test('规划与浏览器共用显示文字规则，列表分隔符不要求在画面出现',()=>{
 for(const value of ['1|经济冷了','1｜经济冷了','**1**，经济冷了']){
  assert.equal(normalizeVisibleText(value),'1经济冷了');assert.equal(normalizeCardText(value),normalizeVisibleText(value));
 }
 assert.equal(normalizeVisibleText('💰？'),'💰');assert.equal(normalizeVisibleText('？'),'');
});
test('彩色图标必须是纯图形文本，混合正文和普通标点不能豁免单色文字检查',()=>{
 for(const v of ['💰','😀','👩‍💻','👍🏽'])assert.equal(isPictogram(v),true,v);
 for(const v of ['','？','1','收入💰','💰|','❤️收入'])assert.equal(isPictogram(v),false,v);
});
test('全镜头绑定不能拿首镜通过代替，动态文字可在本镜后续帧取得绑定',()=>{
 const events=[{id:'s01-text-1',beatId:'s01',text:'开头'},{id:'s04-text-1',beatId:'s04',text:'1|经济冷了'}];
 const rows=[{frame:12,beatId:'s01',events:[{id:'s01-text-1',found:true}]}];
 assert.deepEqual(validateTextBindings({frames:[12],rows,events}).map(f=>f.id),['s04-text-1']);
 rows.push({frame:50,beatId:'s04',events:[{id:'s04-text-1',found:false}]},{frame:60,beatId:'s04',events:[{id:'s04-text-1',found:true}]});
 assert.deepEqual(validateTextBindings({frames:[12,50,60],rows,events}),[]);
 assert.ok(validateTextBindings({frames:[12,50,60,70],rows,events}).some(f=>f.frame===70));
});
test('空白正规化为空时立即结束，标点仍可按原字符定位',()=>{
 assert.deepEqual([...textOccurrences('你发现了吗？','')],[]);
 assert.deepEqual([...textOccurrences('你发现了吗？','？')],[5]);
 assert.deepEqual([...textOccurrences('','')],[]);
});
test('重叠短语、未命中及 UTF-16 偏移保持正确',()=>{
 assert.deepEqual([...textOccurrences('哈哈哈','哈哈')],[0,1]);
 assert.deepEqual([...textOccurrences('你好','再见')],[]);
 assert.deepEqual([...textOccurrences('😀问号？','？')],[4]);
});
test('同一词组内的逗号跟随正文显影，不能提前孤立出现或保留错误字色',()=>{
 const text='以前，未来',positions=new Map([[0,'a'],[1,'a'],[3,'a'],[4,'a']]);
 assert.equal(includeMatchedPunctuation(text,positions).get(2),'a');
 assert.equal(positions.has(2),false);
 for(const separator of ['，','💰','X']){
  const different=new Map([[0,'a'],[2,'b']]);
  assert.equal(includeMatchedPunctuation('前'+separator+'后',different).has(1),false);
 }
 assert.equal(includeMatchedPunctuation('前💰后',new Map([[0,'a'],[3,'a']])).has(1),false);
});
