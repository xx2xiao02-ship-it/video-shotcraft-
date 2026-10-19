import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTalkcraftGovernedCatalog,validateTalkcraftDesignProps} from './talkcraft-governed-contract.mjs';
import {auditVisualContent,auditFilmExpression,visualContentContract,isTextDominant} from './talkcraft-visual-content-contract.mjs';
import {captionOutlineStyle} from './talkcraft-caption-style.mjs';
import {editorialRequiredParameterContracts} from './talkcraft-editorial-required-props.mjs';
const index=JSON.parse(fs.readFileSync('_audit/video-talkcraft/references/cards-index.json'));
const catalog=loadTalkcraftGovernedCatalog(index);
const shot=(id,shotCard,cardProps={})=>({id,shotCard,start:0,end:3,subject:'other',templateParams:{cardProps}});

test('本次第8镜的固定灰条/柱高和人物遮挡在正式参数校验中被阻止',()=>{
 const s={...shot('s08','color-slam-beat-card',{title1:'现实经常打脸',title2:'第一反应不是消费'}),subject:'person'};
 const before=structuredClone(s),audit=validateTalkcraftDesignProps([s],{catalog,projectRoot:process.cwd()});
 assert.ok(audit.errors.some(i=>i.code==='DEMO_VISUAL_NOT_REPLACEABLE'));
 assert.ok(audit.errors.some(i=>i.code==='HOST_CONTENT_REGION_CONFLICT'));assert.deepEqual(s,before);
});
test('真实长标题在源头按实际字号和单行容器检查，短标题仍通过',()=>{
 const s=shot('s09','soft-blur-in',{text:'很多人疑惑，为什么刺激政策，有时候效果不如预期？',fontSize:48});
 assert.equal(auditVisualContent([s],{catalog}).issues[0].code,'TEXT_LAYOUT_CAPACITY');
 s.templateParams.cardProps.text='为什么不消费？';assert.equal(auditVisualContent([s],{catalog}).passed,true);
 s.templateParams.cardProps.text='为什么\n不消费';assert.equal(auditVisualContent([s],{catalog}).passed,false);
});
test('源码变化不沿用旧容量/占位审计结果',()=>{
 const card=structuredClone(catalog.cards.find(c=>c.cardId==='soft-blur-in'));card.implementation.sha256='0'.repeat(64);
 assert.throws(()=>visualContentContract(card),/指纹/);
});
test('完整参数合同向模型透传相同容量，不只在返回后拦截',()=>{
 const card=catalog.cards.find(c=>c.cardId==='soft-blur-in'),compact={slug:card.cardId,fields:[],capabilities:{visualContent:visualContentContract(card)}};
 const [row]=editorialRequiredParameterContracts({windows:[{shotId:'s09',choices:[{slug:card.cardId,choiceId:'own'}]}]},{contracts:[compact]});
 assert.deepEqual(row.choices[0].visualContent.singleLine,visualContentContract(card).singleLine);
});
test('解释段按镜数和时长检查，背景及文字转场不能冒充图形',()=>{
 const intro=[shot('s01','soft-blur-in'),shot('s02','tracking-in'),shot('s03','ink-underline')];
 const text=[shot('s04','black-slam-transition'),shot('s05','soft-blur-in'),shot('s06','lower-third-nameplate')];
 text[1].templateParams={materialRole:'background',materialSrc:'real.mp4'};
 const report=auditFilmExpression([...intro,...text,shot('s07','step-timeline-vertical')],index);
 assert.equal(report.passed,false);assert.deepEqual(report.textShotIds,['s04','s05','s06']);
 const corrected=[...intro,text[0],shot('s05','step-timeline-vertical'),shot('s06','info-card-assemble'),shot('s07','doc-park-left-pill-deal')];
 assert.equal(auditFilmExpression(corrected,index).passed,true);
 corrected[3].end=30;assert.equal(auditFilmExpression(corrected,index).passed,false);
});
test('前三镜风格豁免，字幕细白边随画布等比且不覆盖填充字形',()=>{
 assert.equal(auditFilmExpression([shot('s01','soft-blur-in'),shot('s02','tracking-in'),shot('s03','ink-underline')],index).passed,true);
 assert.equal(captionOutlineStyle(2).WebkitTextStroke,'4px #ffffff');
 assert.equal(captionOutlineStyle(1).paintOrder,'stroke fill');
});


test('真实资料槽不等于人物布局兼容，源依赖指纹与冲突一同检查且不挪动画面',()=>{
 for(const id of ['rack-focus-pair','info-card-assemble','still-layout-relay']){
  const s={...shot('different-task-scene',id),subject:'person'},before=structuredClone(s);
  assert.ok(auditVisualContent([s],{catalog}).issues.some(i=>i.code==='HOST_CONTENT_REGION_CONFLICT'));
  assert.deepEqual(s,before);s.subject='other';
  assert.ok(!auditVisualContent([s],{catalog}).issues.some(i=>i.code==='HOST_CONTENT_REGION_CONFLICT'));
 }
 const card=structuredClone(catalog.cards.find(c=>c.cardId==='rack-focus-pair'));
 card.implementation.dependencies.find(d=>d.file.replaceAll('\\','/').endsWith('/template/cards/rack-focus-pair.tsx')).sha256='bad';
 assert.throws(()=>visualContentContract(card),/布局指纹/);
});

test('图形分类在原卡目录、治理目录和紧凑目录之间保持一致，不能丢类别后将文字误判成图形',()=>{
 for(const card of catalog.cards){
  const source=index.cards.find(c=>c.slug===card.cardId);assert.equal(card.category,source.category);
  assert.equal(isTextDominant({shotCard:card.cardId},catalog),isTextDominant({shotCard:card.cardId},index));
 }
 const bad=structuredClone(index);delete bad.cards[0].category;assert.throws(()=>loadTalkcraftGovernedCatalog(bad),/类别/);
});

test('品牌文字和固定演示标志、单条步骤不能冒充有效图形结构',()=>{
 const logo=shot('s04','logo-enter',{brand:'诺贝尔经济学奖',tag:'解释'});
 assert.equal(isTextDominant(logo,index),true);
 assert.ok(auditVisualContent([logo],{catalog}).issues.some(i=>i.code==='DEMO_VISUAL_NOT_REPLACEABLE'));
 const single=shot('s05','numbered-step-stack',{stepsDsl:'钱|期待'});
 assert.equal(isTextDominant(single,index),true);
 assert.ok(auditVisualContent([single],{catalog}).issues.some(i=>i.code==='STRUCTURE_ITEMS_REQUIRED'));
 single.templateParams.cardProps.stepsDsl='收入|变化\n选择|消费';
 assert.equal(isTextDominant(single,index),false);assert.equal(auditVisualContent([single],{catalog}).passed,true);
});

test('必填人物槽必须在选卡阶段核验人物窗口，不留到06索取不存在的人物',()=>{
 const s=shot('s06','parallel-items-with-host',{item1:'过去',item2:'政策',item3:'变化'});
 assert.ok(auditVisualContent([s],{catalog}).issues.some(i=>i.code==='HOST_SUBJECT_REQUIRED'));
 s.subject='person';assert.ok(!auditVisualContent([s],{catalog}).issues.some(i=>i.code==='HOST_SUBJECT_REQUIRED'));
});
test('手绘固定车身不是可替换经济图形，改标签和手部图片不能通过占位检查',()=>{
 const s=shot('s17','pencil-sketch-draw',{label:'收入与消费',handSrc:'sources/official.png'});
 assert.ok(auditVisualContent([s],{catalog}).issues.some(i=>i.code==='DEMO_VISUAL_NOT_REPLACEABLE'));
 assert.match(visualContentContract(catalog.cards.find(c=>c.cardId===s.shotCard)).reason,/固定车身/);
});
