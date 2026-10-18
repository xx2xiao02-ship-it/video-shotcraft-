import {createHash} from 'node:crypto';
import {editorialPlanningLimits} from './talkcraft-editorial-planning-contract.mjs';
import {editorialDslLocks} from './talkcraft-editorial-params.mjs';
import {crossFieldChecks} from '../docs/audits/b-talkcraft-target3/dsl-validation.mjs';
import {editorialSourceDisplayFields,EDITORIAL_MATERIAL_DISPLAY_RULES} from './talkcraft-editorial-material-contract.mjs';
import {auditEditorialJointRepairContract} from './talkcraft-editorial-joint-repair.mjs';
import {auditEditorialSelectionRequest,editorialSelectionModelInput} from './talkcraft-editorial-selection.mjs';

// Verify the actual serialized request data, not a second prose-only rule list.
export function auditEditorialRequestContract({promptCatalog,catalog,planningContract,repairInputs=null,selectionRequest=null,selectionModelInput=null,theme}){
 const issues=[],same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 if(repairInputs)issues.push(...auditEditorialJointRepairContract(planningContract.jointRepair,repairInputs));
 if(repairInputs)issues.push(...auditEditorialSelectionRequest(selectionRequest,repairInputs));
 if(repairInputs)try{
   if(!selectionModelInput||!same(selectionModelInput,editorialSelectionModelInput(selectionRequest,{promptCatalog,theme})))
     issues.push('实际局部模型输入缺失、夹带跨镜内容或与本镜字符锚点投影不一致');
 }catch(error){issues.push(error.message);}
 else if(planningContract.jointRepair)issues.push('联合修订契约缺少原始提案与当前输入，不能只信缓存');
 if(promptCatalog.crossFieldChecks!==crossFieldChecks.toString())issues.push('模型跨字段规则与正式校验源码不一致');
 if(promptCatalog.materialDisplayRules!==EDITORIAL_MATERIAL_DISPLAY_RULES)issues.push('模型素材展示规则与正式校验不一致');
 if(!same(planningContract.limits,editorialPlanningLimits()))issues.push('规划数值与正式校验常量不一致');
 if(!planningContract.readiness?.passed)issues.push('真实时间轴与人物窗口没有可行覆盖路径');
 if(!same(promptCatalog.cards.map(c=>c.slug),catalog.cards.map(c=>c.cardId))||
    !same(promptCatalog.contracts.map(c=>c.slug),catalog.cards.map(c=>c.cardId)))issues.push('模型目录与已审目录不一致');
 for(const card of catalog.cards){
  const domain=planningContract.timingDomains?.find(c=>c.slug===card.cardId);
  const mediaLocked=Object.values(card.policy?.media||{}).some(v=>/audio|video/iu.test(String(v)));
  if(!domain||domain.maxHoldAtNativeFrame!==card.duration.frames-2||domain.maxExtraHoldFrames!==(mediaLocked?0:60)||
     domain.maxExtraHoldFraction!==(mediaLocked?0:0.5))issues.push(`${card.cardId} 驻留边界或冻结预算缺失/不一致`);
  const sent=promptCatalog.contracts.find(c=>c.slug===card.cardId);
  if(!sent){issues.push(`${card.cardId} 缺少模型契约`);continue;}
  if(!same(sent.sourceDisplayFields,editorialSourceDisplayFields(card)))issues.push(`${card.cardId} 真实资料展示槽与后端不一致`);
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
  requestDataSha256:createHash('sha256').update(JSON.stringify({promptCatalog,planningContract,selectionRequest,selectionModelInput})).digest('hex'),
  checkedCards:catalog.cards.length,externalRequests:0,userAcceptance:false};
}
