// Structural meaning constraints of audited graphic cards, independent of broad
// semantic tags. This detects proven malformed nodes, not arbitrary meaning.
export const GRAPHIC_RELATION_RULES='图形模板先匹配关系再匹配关键词。多源汇聚表示至少两个不同且完整的来源/因素/论据指向一个共同目标或结论，不表示句子片段拼接、转折强调或前后流程。sources逐行填写真实独立来源，hub填写共同目标；不得把“可/但是/而是”等连接词当来源，不以semanticDeviations理由豁免。过程链、对比、转折应比较对应关系模板，不能为了图形比例硬套汇聚。';
export function graphicRelationContract(cardId){
 if(cardId!=='source-converge')return null;
 return {type:'many-to-one',sourceField:'sources',targetField:'hub',minimumSources:2,
  instruction:GRAPHIC_RELATION_RULES};
}
const norm=x=>String(x??'').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();
const connectives=new Set(['可','可是','但','但是','然而','而','而是','不是','所以','因此','因为','于是','并且','以及','和','与','或','首先','然后','最后']);
export function auditGraphicRelations(shots){
 const issues=[],rows=[];
 for(const shot of shots||[]){
  const contract=graphicRelationContract(shot.shotCard);if(!contract)continue;
  const p=shot.templateParams?.cardProps||{};
  const sources=String(p.sources??'').split(/\r?\n/u).map(s=>s.trim()).filter(Boolean),target=norm(p.hub);
  rows.push({shotId:shot.id,cardId:shot.shotCard,contract,sources,target:String(p.hub??'')});
  const add=(field,reason)=>issues.push({shotId:shot.id,code:'GRAPHIC_RELATION_INVALID',field,
   repair:'editorial-selection',message:`${shot.id} 多源汇聚关系无效：${reason}；须依据本镜内容重新设计关系或选卡，不自动编写来源、结果或理由`});
  const normalized=sources.map(norm);
  if(normalized.length<2||normalized.some(x=>!x)||new Set(normalized).size!==normalized.length)
   add('sources','必须有至少两个不同的完整来源，空行和重复节点不计数');
  if(normalized.some(x=>connectives.has(x)))add('sources','把连接词或顺序词当成独立来源');
  if(!target||connectives.has(target))add('hub','缺少完整共同目标或把连接词当作结果');
  if(target&&normalized.includes(target))add('sources','来源与共同结果完全相同，未形成多对一关系');
 }
 return {passed:!issues.length,issues,rows,semanticReviewRequired:true};
}
