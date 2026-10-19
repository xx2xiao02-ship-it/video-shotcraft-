// Same explicit-presence rule as the original validator; media remains owned
import {visualContentContract,auditVisualContent} from './talkcraft-visual-content-contract.mjs';
// by the existing binding stage. Never substitute source/demo defaults.
export function editorialRequiredBusinessFields(card){
 const required=card.policy?.required??card.required??[],media=card.policy?.media??card.media??{};
 return required.filter(key=>!Object.hasOwn(media,key)).map(key=>{
  const f=card.fields.find(f=>f.key===key);
  return {key,type:['number','slider'].includes(f?.type)?'number':f?.type==='boolean'?'boolean':'string',
    blankAllowed:f?.blankAllowed===true,label:f?.label??'',presence:'explicit-own-property',defaultsAllowed:false};
 });
}
export function editorialRequiredParameterContracts(request,catalog){
 return request.windows.map(w=>({shotId:w.shotId,choices:w.choices.map(choice=>{
  const card=(catalog.cards??catalog.contracts).find(c=>(c.cardId??c.slug)===choice.slug);
  if(!card)throw Error(`缺少${choice.slug}原卡参数合同`);
  return {choiceId:choice.choiceId,slug:choice.slug,materialQueryContract:{path:'templateParams.templateMaterialQueries',type:'object',
      fieldKeys:Object.keys(card.policy?.media??card.media??{}).filter(key=>!/host/iu.test(key)),valueType:'nonempty-string',
      instruction:'只返回字段到单条检索词的对象，例如实际字段名对应实际中文查询；禁止列表条目、重复字段和queryZh/queryEn/visualConcepts对象。多图片字段的逐项资料必须在research规划中明确，不把多条同名field合并为一条查询，也不能借素材查询补造空业务内容。'},visualContent:visualContentContract(card),requiredBusinessFields:editorialRequiredBusinessFields(card),
    rule:'cardProps must explicitly contain every required business field of the selected choice; empty object is invalid when fields are required; no demo fallback'};
 })}));
}
export function auditEditorialRequiredProps(card,props,shotId){
 const issues=auditVisualContent([{id:shotId,shotCard:card.cardId,templateParams:{cardProps:props}}],{catalog:{cards:[card]}}).issues;
 if(!props||typeof props!=='object'||Array.isArray(props))return {passed:false,issues:[{shotId,code:'PROPS_OBJECT_REQUIRED',message:`${shotId}.cardProps必须是完整JSON对象`}]};
 for(const f of editorialRequiredBusinessFields(card)){
  const v=props[f.key];
  if(!Object.hasOwn(props,f.key)||v===null||(typeof v==='string'&&!v.trim()&&!(f.blankAllowed&&v==='')))
   issues.push({shotId,field:f.key,code:'REQUIRED_PROP',message:`${shotId}.cardProps.${f.key}必须显式填写本镜内容，不能省略、复制空对象或使用演示默认值`});
 }
 return {passed:!issues.length,issues};
}
