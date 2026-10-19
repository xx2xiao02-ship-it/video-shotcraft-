import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {EDITORIAL_NEW_RESEARCH_CONTRACT} from './talkcraft-editorial-material-contract.mjs';

// Model-facing rules and response enforcement share these field definitions.
export const MATERIAL_CREATIVE_KEYS=['background','backgroundQuery','backgroundDecision','backgroundConcepts',
  'backgroundReason','graphicIntent','graphicAlternatives','pureTextReason'];
export const PERSON_DISPLAY_KEYS=['entityName','role','displayShotId','labelField','labelText','bindingQuery'];
export const SOURCE_FACT_KEYS=['url','sourceUrl','pageUrl','license','licenseUrl','attribution','localPath','sha256','sourceId',
  'verified','sourceVerified','licenseVerified','sourceCoordinates','contentLanguage','languageReason','identityReason'];
export const RESEARCH_IDENTITY_KEYS=['kind','query','entityType','entityName'];
const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(row||{},k)).map(k=>[k,structuredClone(row[k])]));
const sameIdentity=(a,b)=>RESEARCH_IDENTITY_KEYS.every(k=>isDeepStrictEqual(a?.[k],b?.[k]));
const sourceMatch=(a,b)=>a?.kind===b?.kind&&a?.query===b?.query;
const nonempty=value=>typeof value==='string'&&!!value.trim();

// References belong to one request, source row and array item. They are not
// global asset IDs and cannot resolve against another run or another shot.
export function editorialMaterialRefs(request,shotId,key){
  const row=request.baseProposal.materialResearch?.shots?.find(r=>r.shotId===shotId);
  return (row?.[key]||[]).map((item,index)=>({ref:createHash('sha256').update(JSON.stringify(
    [request.requestId,shotId,key,index,item])).digest('hex'),item:structuredClone(item)}));
}

export function resolveEditorialMaterialRefs(response,request){
  const copy=structuredClone(response),issues=[];
  for(const row of copy.materialResearchUpdates||[]){
    const editable=request.editableShotIds.includes(row.shotId);
    const add=message=>issues.push({code:'EDITORIAL_MATERIAL_REF_INVALID',shotId:row.shotId,message:`${row.shotId}${message}`});
    for(const [key,refKey,editableKeys]of [
      ['research','researchRef',['reason','displayShotId','displayField','displayReason']],
      ['bindings','bindingRef',['field','displayShotId','displayReason']]]){
      if(!Array.isArray(row[key]))continue;
      const refs=editorialMaterialRefs(request,row.shotId,key),seen=new Set();
      row[key]=row[key].map(item=>{
        if(!Object.hasOwn(item||{},refKey))return item; // Strict legacy protocol remains unchanged.
        const found=refs.find(r=>r.ref===item[refKey]);
        if(!found||seen.has(item[refKey])){add(`${key}引用不属于本次本镜或重复使用`);return item;}
        seen.add(item[refKey]);
        const allowed=editable?editableKeys:[key==='research'?'displayField':'field'];
        if(Object.keys(item).some(k=>k!==refKey&&!allowed.includes(k))){
          add(`${key}引用仅允许填写展示补丁，禁止重写身份、检索词或来源事实`);return item;
        }
        if(key==='research'&&editable&&!nonempty(item.reason))add('资料引用仍须填写本次设计理由，不能沿用旧卡理由');
        const { [refKey]:ignored,...patch}=item;
        return {...found.item,...patch};
      });
    }
    for(const person of row.personDisplays||[]){
      if(!Object.hasOwn(person||{},'bindingResearchRef'))continue;
      const found=editorialMaterialRefs(request,row.shotId,'research').find(r=>r.ref===person.bindingResearchRef);
      if(!found||found.item.entityType!=='person'||found.item.entityName!==person.entityName||Object.hasOwn(person,'bindingQuery'))
        add('核心人物引用与本次本镜人物身份不一致，或同时回填了检索词');
      else {person.bindingQuery=found.item.query;delete person.bindingResearchRef;}
    }
  }
  if(issues.length)throw Object.assign(Error(issues.map(i=>i.message).join('；')),{issues});
  return copy;
}

// Field names alone are insufficient instructions for a model. These describe
// output shape, never copy creative values from the bound historical design.
const designDefinitions={
  background:{type:'string',instruction:'本镜背景表达；按当前选卡设计，不沿用旧卡说明'},
  backgroundQuery:{type:'string',instruction:'本镜相关背景检索词；不需要背景时可为空字符串，但仍须返回本字段'},
  backgroundDecision:{type:'string',enum:['compare','use','omit'],instruction:'明确比较、使用或不使用背景；自行判断，代码不默认选择'},
  backgroundConcepts:{type:'array',items:{type:'string'},instruction:'本镜背景视觉概念词；不需要时可为空数组，不能省略'},
  backgroundReason:{type:'string',instruction:'本次背景决定的理由，说明与当前镜头的关系'},
  graphicIntent:{type:'string',instruction:'本镜图形表达意图，按当前选卡与真实口播填写'},
  graphicAlternatives:{type:'array',items:{type:'object',required:['cardId','reason'],properties:{cardId:{type:'string'},reason:{type:'string'}}},instruction:'比较可行图形卡及理由；无可行替代可返回空数组，不能省略'},
  pureTextReason:{type:'string',instruction:'若保留纯文字，说明本次依据；非纯文字可为空字符串，不能省略'}
};
export function editorialMaterialDesignFields(request,shotId){
  const row=request.baseProposal.materialResearch?.shots?.find(r=>r.shotId===shotId);
  return Object.fromEntries((request.editableShotIds.includes(shotId)?MATERIAL_CREATIVE_KEYS:[])
    .filter(key=>Object.hasOwn(row||{},key)).map(key=>[key,structuredClone(designDefinitions[key])]));
}

export function editorialResponseContract(request){
  const rows=request.baseProposal.materialResearch?.shots||[];
  return {schema:'talkcraft-editorial-response-contract-v1',requestId:request.requestId,
    codeOwned:['shotCard','firstSentence','lastSentence','subject','playbackRate','timeline','sentenceIndex','anchor',
      'audio','wordTiming','sourceFacts','lockedShots'],
    sourceFactKeys:[...SOURCE_FACT_KEYS],
    repairs:request.windows.map((w,i)=>({shotId:w.shotId,choicesPath:`windows[${i}].choices`,
      requiredFields:['shotId','choiceId','intent','visual','templateParams','nativePresentation'],
      anchorScopeId:w.anchorScope.scopeId,eventSentenceRule:'same-shot-same-sentence',anchorProtocol:'sentence-ref-character-offsets-v1',
      textFieldFields:['key','visibility','reason'],
      wordEventFields:['field','text','sentenceRef','fromOffset','throughOffset','role','reason']})),
    materials:request.materialShotIds.map(shotId=>{
      const row=rows.find(r=>r.shotId===shotId),editable=request.editableShotIds.includes(shotId);
      return {shotId,mode:editable?'replace-design':'retarget-only',
        newResearchContract:editable?structuredClone(EDITORIAL_NEW_RESEARCH_CONTRACT):null,
        designFields:editorialMaterialDesignFields(request,shotId),
        requiredFields:['shotId','research',...(editable?MATERIAL_CREATIVE_KEYS.filter(k=>Object.hasOwn(row||{},k)):[]),
          ...(row?.personDisplays?['personDisplays']:[])],
        writablePaths:editable?['research.reason','research.displayShotId','research.displayField','bindings.field',
          'bindings.displayShotId','personDisplays.labelField','personDisplays.labelText','personDisplays.bindingQuery',
          ...MATERIAL_CREATIVE_KEYS.filter(k=>Object.hasOwn(row||{},k))]:['research.displayField','bindings.field'],
        requiredResearch:(row?.research||[]).map(r=>pick(r,RESEARCH_IDENTITY_KEYS)),
        researchRefs:editorialMaterialRefs(request,shotId,'research').map(r=>r.ref),
        bindingRefs:editorialMaterialRefs(request,shotId,'bindings').map(r=>r.ref),
        researchResponseKeys:editable?['researchRef','reason','displayShotId','displayField','displayReason']:['researchRef','displayField'],
        bindingResponseKeys:editable?['bindingRef','field','displayShotId','displayReason']:['bindingRef','field'],
        retainedBindings:(row?.bindings||[]).map(r=>pick(r,['kind','query','displayShotId','field'])),
        corePeople:(row?.personDisplays||[]).filter(p=>p.role==='core').map(p=>p.entityName)};
    })};
}

// Runs before cost reservation. Check independent scope/slot invariants too,
// rather than trusting that two copies of the same projection agree.
export function auditEditorialConstraintInput(request,{catalog,modelInput}){
  const issues=[],add=message=>issues.push(message),contract=editorialResponseContract(request);
  if(!isDeepStrictEqual(modelInput?.responseContract,contract))add('实际输入缺少或篡改了代码生成的响应字段合同');
  const ids=(modelInput?.materials||[]).map(r=>r.shotId);
  if(ids.length!==request.materialShotIds.length||new Set(ids).size!==ids.length||ids.some(id=>!request.materialShotIds.includes(id)))
    add('实际输入的资料行没有精确覆盖本次修订范围');
  for(const spec of contract.materials){
    const row=modelInput?.materials?.find(r=>r.shotId===spec.shotId);
    if(row?.mode!==spec.mode||spec.mode==='retarget-only'&&row?.rewriteFields?.length)
      add(`${spec.shotId}锁定换槽与创意重写任务冲突`);
    if(!isDeepStrictEqual(row?.designFields,spec.designFields))add(`${spec.shotId}实际输入缺少逐字段类型及填写说明`);
    if(!isDeepStrictEqual(row?.newResearchContract,spec.newResearchContract))add(`${spec.shotId}实际输入缺少同源的新增资料种类与语境配图区分合同`);
    if(!isDeepStrictEqual(row?.requiredArrays,spec.requiredFields.filter(k=>['research','personDisplays'].includes(k)))||
      !isDeepStrictEqual(row?.rewriteFields,spec.requiredFields.filter(k=>MATERIAL_CREATIVE_KEYS.includes(k))))
      add(`${spec.shotId}输入必填数组或创意字段与执行合同不一致`);
    if(!isDeepStrictEqual((row?.research||[]).map(r=>pick(r,RESEARCH_IDENTITY_KEYS)),spec.requiredResearch))
      add(`${spec.shotId}发送投影遗漏了已登记的研究身份`);
    if(!isDeepStrictEqual((row?.research||[]).map(r=>r.researchRef),spec.researchRefs)||
      !isDeepStrictEqual((row?.bindings||[]).map(r=>r.bindingRef),spec.bindingRefs))
      add(`${spec.shotId}发送投影的资料引用与本次本镜记录不一致`);
    for(const binding of row?.bindings||[])if(SOURCE_FACT_KEYS.some(k=>Object.hasOwn(binding,k)))
      add(`${spec.shotId}来源事实应由代码保存，不能变成模型回抄任务`);
  }
  for(const window of request.windows)for(const choice of window.choices){
    const card=catalog.cards.find(c=>c.cardId===choice.slug);
    const fields=Object.entries(card?.policy?.media||{}).filter(([k,v])=>k!=='hostSrc'&&
      ['image','image-list','image-or-video','video','portrait-video'].includes(v)).map(([k])=>k);
    if(!card||!isDeepStrictEqual(fields,choice.sourceDisplayFields)||window.requiresSource&&!fields.length)
      add(`${window.shotId}方案的真实资料槽与模板源码合同不一致`);
  }
  return {passed:!issues.length,issues};
}

// This gate checks ownership only. Existing material/identity/file/license,
// semantic, text coverage and time validators still decide admission.
export function auditEditorialMaterialOwnership(response,request){
  const issues=[],rows=request.baseProposal.materialResearch?.shots||[];
  for(const update of response.materialResearchUpdates||[]){
    const original=rows.find(r=>r.shotId===update?.shotId),id=update?.shotId;
    const editable=request.editableShotIds.includes(id),label=editable?'资料行':'锁定资料行';
    const add=(code,message,extra={})=>issues.push({code,shotId:id,message:`${id}${label}${message}`,...extra});
    const managed=['shotId','research','bindings','personDisplays',...MATERIAL_CREATIVE_KEYS];
    for(const key of Object.keys(update||{}).filter(k=>!managed.includes(k)))
      if(!Object.hasOwn(original||{},key)||!isDeepStrictEqual(update[key],original[key]))
        add('EDITORIAL_MATERIAL_FIELD_NOT_WRITABLE',`不能新增或改写未授权字段${key}`,{field:key});
    if(Array.isArray(update?.research)){
      for(const old of original?.research||[])if(!update.research.some(r=>sameIdentity(r,old)))
        add('EDITORIAL_RESEARCH_IDENTITY_MISSING','遗漏或修改已登记的资料身份与检索对应关系',{kind:old.kind,query:old.query});
      for(const item of update.research){
        if(!item||typeof item!=='object'||Array.isArray(item))continue; // Original structural gate reports this.
        if(editable&&!nonempty(item.reason))add('EDITORIAL_RESEARCH_REASON_REQUIRED','须明确填写本次资料理由，不能自动沿用旧卡理由');
        const old=original?.research?.find(r=>sourceMatch(r,item));
        const planned=[...RESEARCH_IDENTITY_KEYS,'reason','displayShotId','displayField','displayReason','queryZh'];
        for(const key of Object.keys(item).filter(k=>!planned.includes(k)))if(!isDeepStrictEqual(item[key],old?.[key]))
          add('EDITORIAL_SOURCE_FACT_LOCKED',`不能编造或改写来源事实${key}`,{field:key});
      }
    }
    if(Object.hasOwn(update||{},'bindings')){
      if(!Array.isArray(update.bindings)){add('EDITORIAL_BINDING_INVALID','bindings必须是数组');continue;}
      for(const old of original?.bindings||[])if(!update.bindings.some(r=>sourceMatch(r,old)))
        add('EDITORIAL_BINDING_REMOVAL','不能删除本次已登记的真实素材绑定',{kind:old.kind,query:old.query});
      for(const item of update.bindings){
        const old=original?.bindings?.find(r=>sourceMatch(r,item));
        if(!old){add('EDITORIAL_BINDING_NOT_OWNED','不能新增已采集绑定；新资料先返回research规划并由06核验');continue;}
        // New metadata keys default to server-owned too. Only explicit target
        // fields may change, so a new verification flag cannot bypass this gate.
        for(const key of Object.keys(item||{}).filter(k=>!['kind','query','field','displayShotId','displayReason'].includes(k)))
          if(!isDeepStrictEqual(item[key],old[key]))
          add('EDITORIAL_SOURCE_FACT_LOCKED',`不能改写真实素材的${key}`,{field:key});
      }
    }
  }
  return {passed:!issues.length,issues};
}
