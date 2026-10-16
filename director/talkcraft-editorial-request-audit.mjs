import {createHash} from 'node:crypto';
import {editorialPlanningLimits} from './talkcraft-editorial-planning-contract.mjs';
import {editorialDslLocks} from './talkcraft-editorial-params.mjs';

// Verify the actual serialized request data, not a second prose-only rule list.
export function auditEditorialRequestContract({promptCatalog,catalog,planningContract}){
 const issues=[],same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 if(!same(planningContract.limits,editorialPlanningLimits()))issues.push('规划数值与正式校验常量不一致');
 if(!planningContract.readiness?.passed)issues.push('真实时间轴与人物窗口没有可行覆盖路径');
 if(!same(promptCatalog.cards.map(c=>c.slug),catalog.cards.map(c=>c.cardId))||
    !same(promptCatalog.contracts.map(c=>c.slug),catalog.cards.map(c=>c.cardId)))issues.push('模型目录与已审目录不一致');
 for(const card of catalog.cards){
  const sent=promptCatalog.contracts.find(c=>c.slug===card.cardId);
  if(!sent){issues.push(`${card.cardId} 缺少模型契约`);continue;}
  if(!same(sent.required,card.policy.required)||!same(sent.media,card.policy.media)||
     !same(sent.mediaAlternatives,card.policy.mediaAlternatives)||sent.fps!==card.duration.fps||
     sent.nativeFrames!==card.duration.frames||sent.originalFrames!==card.duration.originalFrames)issues.push(`${card.cardId} 必填、媒体或时长信息不一致`);
  if(!same(sent.allowedBusinessKeys,card.fields.filter(f=>f.writable&&f.role!=='media').map(f=>f.key))||
     !same(sent.frozenKeys,card.fields.filter(f=>!f.writable).map(f=>f.key))||!same(sent.lockedDsl,editorialDslLocks(card)))issues.push(`${card.cardId} 可写字段或冻结时序不一致`);
  for(const field of card.fields.filter(f=>f.writable&&f.role!=='media'||card.policy.required.includes(f.key))){
   const actual=sent.fields.find(f=>f.key===field.key);
   if(!actual||['type','label','blankAllowed','min','max','step','options','valueConstraint'].some(key=>!same(actual[key],field[key])))issues.push(`${card.cardId}.${field.key} 字段类型、用途或限制缺失/不一致`);
  }
  for(const [key,rule]of Object.entries(card.policy.dsl||{})){
   const {source,sourceParsers,...expected}=rule;
   if(!same(sent.dsl[key],expected))issues.push(`${card.cardId}.${key} DSL与源校验不一致`);
   if(sent.dslExamples?.[key]?.sourceFormatExample!==String(card.fields.find(f=>f.key===key)?.default??'').split('\n')[0])issues.push(`${card.cardId}.${key} 格式示例与源码不一致`);
  }
 }
 return {schema:'talkcraft-editorial-request-audit-v1',passed:issues.length===0,issues,
  requestDataSha256:createHash('sha256').update(JSON.stringify({promptCatalog,planningContract})).digest('hex'),
  checkedCards:catalog.cards.length,externalRequests:0,userAcceptance:false};
}
