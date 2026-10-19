import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {classifyRecognizedSourceText,inspectSourceContent} from './talkcraft-source-content.mjs';
test('本地内容核验不把空OCR、模型语言和零散误识别当作已确认内容',()=>{
 for(const text of ['', '可 马 大 字', 'BUCKLEY MEAT 众 亻 到 了 的 酣'])assert.equal(classifyRecognizedSourceText({text,language:'zh-CN'}),null);
 assert.equal(classifyRecognizedSourceText({text:'中国人民银行发布货币政策执行报告摘要',language:'zh-Hans-CN'}).contentLanguage,'zh-CN');
 assert.equal(classifyRecognizedSourceText({text:'This is the market and the people are shopping for food with cash',language:'zh-Hans-CN'}).contentLanguage,'en');
 assert.equal(classifyRecognizedSourceText({text:'Das ist eine fremde Sprache mit vielen Worten heute',language:'zh-CN'}),null);
});

test('语言核验复用原OCR并独立保存可追溯判定，重复继续不伪造或覆盖原始结果',t=>{
 const project=fs.mkdtempSync(path.join(os.tmpdir(),'source-language-'));t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
 fs.mkdirSync(path.join(project,'remotion/public'),{recursive:true});const bytes=Buffer.from('unchanged-media');
 const file=path.join(project,'remotion/public/source.png');fs.writeFileSync(file,bytes);
 const source={localPath:'source.png',sha256:createHash('sha256').update(bytes).digest('hex')};let calls=0;
 const recognize=()=>{calls++;return {text:'This is the market and the people are shopping for food with cash',language:'zh-Hans-CN'};};
 const first=inspectSourceContent(project,source,{recognize}),second=inspectSourceContent(project,source,{recognize});
 assert.equal(calls,1);assert.equal(first.contentLanguage,'en');assert.deepEqual(first,second);assert.deepEqual(fs.readFileSync(file),bytes);
 const evidence=path.join(project,first.contentReview.evidence),record=JSON.parse(fs.readFileSync(evidence));
 assert.equal(record.mediaSha256,source.sha256);assert.equal(record.classification.contentLanguage,'en');assert.ok(record.classifierSha256);assert.ok(record.lexiconSha256);
 record.classification.contentLanguage='zh-CN';fs.writeFileSync(evidence,JSON.stringify(record));
 assert.throws(()=>inspectSourceContent(project,source,{recognize}),/语言核验证据/u);
});

test('没有英文虚词的完整图表标签可由真实OCR与固定词典交叉核验',()=>{
 const text='Lenders Savers Households Business firms Government Foreigners Financial intermediary Financial Markets Direct finance Borrowers Spenders Households Business firms Government Foreigners';
 const c=classifyRecognizedSourceText({text,language:'zh-Hans-CN'});
 assert.equal(c.contentLanguage,'en');assert.equal(c.languageEvidence.method,'ocr-english-spelling');
 assert.ok(c.languageEvidence.distinctKnownWords>=12);assert.ok(c.languageEvidence.coverage>=0.9);
 for(const invalid of ['market '.repeat(30),'the and with xyzabc qwertyu plmnko asdfgh zxcvbn poiuyt',
  'Das sind unsere finanziellen Beziehungen zwischen privaten Haushalten verschiedenen Unternehmen ausländischen Anlegern und staatlichen Einrichtungen',
  'Les ménages épargnent leurs revenus et les entreprises empruntent auprès des banques pour financer leurs investissements'])
  assert.equal(classifyRecognizedSourceText({text:invalid}),null);
});


test('中文OCR字间空白只用于连续性判定；不补字，不合并数字标点，不降低字数比例门槛',()=>{
 const text='温 馨 提 示 ： 为 了 您 和 他 人 的 健 康 安 全 请 勿 用 手 直 接 触 摸 商 品';
 const result=classifyRecognizedSourceText({text,language:'zh-Hans-CN'});
 assert.equal(result.contentLanguage,'zh-CN');assert.equal(result.recognizedText,text);
 assert.equal(result.languageEvidence.normalizedInterglyphWhitespace,true);
 for(const text of ['可 马 大 字','中 1 文 2 测 3 试 4 资 5 料 6 图 7 片 8 显 9 示 0 识 1 别',
  'the with market many shopping for food cash receipt 中 文 字 体 检 测 噪 声'])assert.equal(classifyRecognizedSourceText({text}),null);
});
