import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRecognizedSourceText} from './talkcraft-source-content.mjs';
test('本地内容核验不把空OCR、模型语言和零散误识别当作已确认内容',()=>{
 for(const text of ['', '可 马 大 字', 'BUCKLEY MEAT 众 亻 到 了 的 酣'])assert.equal(classifyRecognizedSourceText({text,language:'zh-CN'}),null);
 assert.equal(classifyRecognizedSourceText({text:'中国人民银行发布货币政策执行报告摘要',language:'zh-Hans-CN'}).contentLanguage,'zh-CN');
 assert.equal(classifyRecognizedSourceText({text:'This is the market and the people are shopping for food with cash',language:'zh-Hans-CN'}).contentLanguage,'en');
 assert.equal(classifyRecognizedSourceText({text:'Das ist eine fremde Sprache mit vielen Worten heute',language:'zh-CN'}),null);
});
