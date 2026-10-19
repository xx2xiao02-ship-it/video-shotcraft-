import test from 'node:test';
import assert from 'node:assert/strict';
import {auditGraphicRelations,graphicRelationContract} from './talkcraft-graphic-relation.mjs';
import {auditEditorialMaterialContract} from './talkcraft-editorial-material-contract.mjs';
import {auditVisualContent,VISUAL_CONTENT_RULES} from './talkcraft-visual-content-contract.mjs';
import {creativeCode} from './talkcraft-node-correction-plan.mjs';
const shot=(sources,hub)=>({id:'new-shot',shotCard:'source-converge',templateParams:{cardProps:{sources,hub},semanticDeviations:{转折:'借助机制图承接转折'}}});
test('截图同类错误：连接词不是来源，选卡理由和改配色不能豁免关系错误',()=>{
 const s=shot('可\n现实经常打脸','打脸'),before=structuredClone(s);
 assert.equal(auditGraphicRelations([s]).passed,false);
 assert.match(auditGraphicRelations([s]).issues[0].message,/连接词/);
 s.templateParams.cardProps.color='#ffffff';assert.equal(auditGraphicRelations([s]).passed,false);
 delete s.templateParams.cardProps.color;assert.deepEqual(s,before);
 assert.equal(creativeCode('GRAPHIC_RELATION_INVALID'),true);
});
test('独立来源汇向共同目标可通过，重复、单条及来源等于结果不能凑多源',()=>{
 assert.equal(auditGraphicRelations([shot('电商订单\n门店订单\n电话订单','订单中心')]).passed,true);
 for(const [sources,hub]of [['甲','中心'],['客户反馈\n客户反馈','中心'],['甲\n中心','中心'],['甲\n乙','但是']])assert.equal(auditGraphicRelations([shot(sources,hub)]).passed,false);
 // 不能简单以“来源包含结果词”误拒正常汇聚。
 assert.equal(auditGraphicRelations([shot('北京订单\n上海订单','订单')]).passed,true);
 assert.equal(auditGraphicRelations([{...shot('可','结果'),shotCard:'ink-underline'}]).passed,true);
});
test('04和后续节点同源执行，不因主句转折、need强调或无素材需求漏检',()=>{
 const s={...shot('可\n现实经常打脸','打脸'),firstSentence:0,lastSentence:0};
 const catalog={cards:[{cardId:'source-converge',category:'数据信息图',fields:[],policy:{media:{}}}]};
 const report=auditEditorialMaterialContract({shots:[s],sentences:[{i:0,shot:s.id,sem:['转折'],need:['强调']}],catalog});
 assert.ok(report.issues.some(i=>i.code==='GRAPHIC_RELATION_INVALID'));
 assert.ok(auditVisualContent([s],{catalog}).issues.some(i=>i.code==='GRAPHIC_RELATION_INVALID'));
 assert.equal(graphicRelationContract('source-converge').type,'many-to-one');
 assert.match(VISUAL_CONTENT_RULES,/关系再匹配关键词/);
});
