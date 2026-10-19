import fs from 'node:fs';
import path from 'node:path';
import {textVideoRequirement,textVideoPositions,hasVideoBackground} from './talkcraft-text-video.mjs';
import {isTextDominant} from './talkcraft-visual-content-contract.mjs';
import {createHash} from 'node:crypto';

export const EDITORIAL_MATERIAL_CONTRACT_VERSION='editorial-material-display-v1';
export const EDITORIAL_RESEARCH_KINDS=['identity','evidence','data'];
export const EDITORIAL_NEW_RESEARCH_CONTRACT={type:'object',required:['kind','query','reason'],
  properties:{kind:{type:'string',enum:EDITORIAL_RESEARCH_KINDS},query:{type:'string',minLength:1},reason:{type:'string',minLength:1}},
  instruction:'research仅登记身份、论据、数据的核验要求，kind不是文件类型，禁止image/video/background。普通语境配图只在templateParams.templateMaterialQueries按真实槽查询，无核验需求时research:[]；不可将语境图改称证据。已有research必须使用本次researchRef保留。'};
export const EDITORIAL_MATERIAL_DISPLAY_RULES='选卡与素材展示同时规划：身份/证据/量化需求不能只给检索词。每条research使用displayShotId和displayField指定原卡真实图片/视频槽位；本镜只有一个可用槽时可省略displayField。多槽须逐条明确，不能把数字人hostSrc、背景或文字字段当证据槽。跨镜展示须有当前稿件与音频绑定的用户集中来源批准，核心人物介绍不得移到别镜。没有可展示槽应重选已审模板，不能加覆盖层、缩卡或伪造媒体路径。每个选中的必需媒体槽须填写真实本地路径或逐槽templateMaterialQueries；搜索词只能表示待采集，不能算素材已齐。选用媒体模板时不得同时声明无外部素材。data论断须保留待核验来源要求；作者观点只有在明确创作决定下才改标，不能自动降级事实要求。04检查规划一致性，06仍逐项核验真实文件、身份、许可、内容语言和实际绑定；结构通过不代表采集通过。';

export function editorialSourceDisplayFields(card){
  return Object.entries(card?.policy?.media||{})
    .filter(([field,kind])=>!['hostSrc','handSrc'].includes(field)&&['image','image-list','image-or-video','video','portrait-video'].includes(kind))
    .map(([field])=>field);
}

const nonempty=value=>typeof value==='string'&&!!value.trim();
const hasValue=value=>nonempty(value)||Array.isArray(value)&&value.length>0&&value.every(nonempty);
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function concentratedDisplayAllowed(project,shotId){
  try{
    const approval=JSON.parse(fs.readFileSync(path.join(project,'qa/material-display-policy-approval.json'),'utf8'));
    return approval.policy==='concentrated-sources'&&approval.authorizedBy==='user'&&
      approval.sourceShotIds?.includes(shotId)&&approval.scriptSha256===sha(path.join(project,'script.txt'))&&
      approval.audioSha256===sha(path.join(project,'audio/full.mp3'));
  }catch{return false;}
}

// Pure structural checks. Files, licensing and factual support remain the
// responsibility of the unchanged material audit in node 06.
export function auditEditorialMaterialContract({shots=[],sentences=[],researchPlan,catalog,projectRoot}){
  const issues=[],pending=[],checks=[];
  const positions=textVideoPositions(shots);
  const add=(shotId,code,message,extra={})=>issues.push({shotId,code,message,...extra});
  const needKind={身份:'identity',证据:'evidence',量化:'data'};
  const rows=researchPlan?.shots;
  if(rows!==undefined&&(!Array.isArray(rows)||rows.length!==shots.length||
    new Set(rows.map(r=>r?.shotId)).size!==shots.length||rows.some(r=>!shots.some(s=>s.id===r?.shotId))))
    add(null,'MATERIAL_SHOT_COVERAGE','素材规划与分镜必须一一对应');
  for(const shot of shots){
    const card=catalog.cards.find(c=>c.cardId===shot.shotCard);
    if(!card)continue; // The existing template validator reports unknown cards.
    const params=shot.templateParams||{},props=params.cardProps||{};
    const row=Array.isArray(rows)?rows.find(r=>r?.shotId===shot.id):null;
    const sentenceRows=(Array.isArray(sentences)?sentences:[]).filter((s,i)=>s?.shot===shot.id||s&&!s.shot&&i>=shot.firstSentence&&i<=shot.lastSentence);
    const sourceDisplay=['evidence','subject'].includes(params.materialRole)&&!!params.materialSrc||editorialSourceDisplayFields(card).some(field=>hasValue(props[field])||hasValue(params.templateMaterialQueries?.[field]));
    const textVideo=textVideoRequirement({shot,sentences,position:positions.get(shot.id),considerBackground:isTextDominant(shot,catalog)&&!sourceDisplay});
    if(textVideo.required&&!hasVideoBackground(shot)){
      if(!textVideo.supported)add(shot.id,'TEXT_VIDEO_TEMPLATE_REQUIRED','普通论述文字的原卡不支持已审视频底板，须在04比较并选择兼容模板；不得用色块或纸底代替');
      else if(row?.backgroundDecision!=='use'||!nonempty(row?.backgroundQuery))add(shot.id,'TEXT_VIDEO_PLAN_REQUIRED','普通论述文字须在04明确use及本镜视频检索词，由06采集绑定；omit理由不能豁免');
    }
    const researchRows=Array.isArray(row?.research)?row.research:[];
    // Core-person labels already belong to the original display contract.
    // Check their plan before acquisition too: a changed card cannot retain
    // an old label field that no longer exists in its public business props.
    for(const display of Array.isArray(row?.personDisplays)?row.personDisplays:[]){
      if(display.role!=='core')continue;
      const field=card.fields?.find(f=>f.key===display.labelField&&f.writable&&f.role!=='media');
      if(!field||!nonempty(display.labelText)||!String(props[display.labelField]??'').split('\n').includes(display.labelText))
        add(shot.id,'MATERIAL_PERSON_LABEL_PLAN_INVALID','核心人物姓名必须对应当前原卡公开文字字段，换卡后不能沿用旧姓名字段',
          {entityName:display.entityName,field:display.labelField});
    }
    if(row&&row.research!==undefined&&!Array.isArray(row.research))add(shot.id,'MATERIAL_RESEARCH_PLAN_INVALID','research必须是逐项资料数组');
    const requiredKinds=[...new Set(sentenceRows.flatMap(s=>(s.need||[]).map(n=>needKind[n]).filter(Boolean)))];
    for(const kind of requiredKinds)if(!researchRows.some(r=>r?.kind===kind&&nonempty(r.query)&&nonempty(r.reason)))
      add(shot.id,'MATERIAL_RESEARCH_PLAN_REQUIRED',`本镜${kind}需求缺少具体资料规划`,{kind});
    const media=card.policy?.media||{},skip=new Set();
    for(const group of card.policy?.mediaAlternatives||[]){
      const supplied=group.filter(k=>hasValue(props[k]));
      if(supplied.length>1){add(shot.id,'MATERIAL_ALTERNATIVE_CONFLICT',`${group.join('/')}只能使用一个素材入口`);group.forEach(k=>skip.add(k));}
      else{
        const planned=group.filter(k=>nonempty(params.templateMaterialQueries?.[k]));
        if(!supplied.length&&planned.length>1)add(shot.id,'MATERIAL_ALTERNATIVE_CONFLICT',`${group.join('/')}须明确选择一个采集入口`);
        // Match resolveTalkcraftTemplateMaterials exactly: absent media uses
        // hostSrc for a person, otherwise the first non-host alternative.
        const chosen=supplied[0]||(shot.subject==='person'&&group.includes('hostSrc')?'hostSrc':group.find(k=>k!=='hostSrc'));
        if(!supplied.length&&planned.some(k=>k!==chosen))add(shot.id,'MATERIAL_ALTERNATIVE_CONFLICT',`采集计划须对应原解析器选择的${chosen}入口，其他入口须先绑定真实文件`);
        group.filter(k=>k!==chosen).forEach(k=>skip.add(k));
      }
    }
    const active=Object.keys(media).filter(k=>!skip.has(k)&&k!=='hostSrc');
    if(active.length&&/无外部素材|不需要外部素材|无需外部素材/u.test(params.materialRole||''))
      add(shot.id,'MATERIAL_ROLE_CONFLICT','已选模板需要真实媒体，不能同时声明无外部素材');
    for(const [field,query]of Object.entries(params.templateMaterialQueries||{}))if(nonempty(query)&&
      !Object.hasOwn(media,field)&&!(field==='hostSrc'&&shot.subject==='person'))
      add(shot.id,'MATERIAL_QUERY_FIELD_INVALID',`采集字段${field}不属于原卡媒体槽`,{field});
    for(const field of active){
      if(!hasValue(props[field])&&!nonempty(params.templateMaterialQueries?.[field]))
        add(shot.id,'MATERIAL_SLOT_PLAN_REQUIRED',`原卡${field}缺少真实素材或逐槽采集计划`,{field});
      if(!hasValue(props[field]))pending.push({shotId:shot.id,field,code:'MATERIAL_ACQUISITION_PENDING'});
    }
    for(const research of researchRows){
      if(!research||!EDITORIAL_RESEARCH_KINDS.includes(research.kind)||!nonempty(research.query)||!nonempty(research.reason)){
        add(shot.id,'MATERIAL_RESEARCH_PLAN_INVALID','每条资料须提供合法kind、具体query和reason');continue;
      }
      const binding=(row.bindings||[]).find(b=>b.kind===research.kind&&b.query===research.query);
      const targetId=binding?.displayShotId||research.displayShotId||shot.id;
      const target=shots.find(s=>s.id===targetId),targetCard=catalog.cards.find(c=>c.cardId===target?.shotCard);
      const fields=editorialSourceDisplayFields(targetCard);
      const boundFields=binding?.localPath?fields.filter(k=>typeof target?.templateParams?.cardProps?.[k]==='string'&&
        target.templateParams.cardProps[k].split('\n').some(v=>v.replace(/^remotion\/public\//u,'')===binding.localPath)):[];
      const field=binding?.field||research.displayField||boundFields[0]||(fields.length===1?fields[0]:null);
      if(binding?.field&&research.displayField&&binding.field!==research.displayField)
        add(shot.id,'MATERIAL_DISPLAY_FIELD_CONFLICT','资料规划与已绑定真实槽位不一致，不能自动改绑',{kind:research.kind,field:binding.field,plannedField:research.displayField});
      if(binding?.field&&binding.localPath&&!boundFields.includes(binding.field))
        add(shot.id,'MATERIAL_BOUND_FIELD_MISMATCH','资料记录指向的槽位没有实际绑定该文件',{kind:research.kind,field:binding.field});
      const display=row.personDisplays?.find(d=>d.bindingQuery===research.query||research.entityName&&d.entityName===research.entityName);
      if(targetId!==shot.id&&(!nonempty(binding?.displayReason||research.displayReason)||
        !concentratedDisplayAllowed(projectRoot,shot.id)||research.entityType==='person'&&display?.role!=='mention'))
        add(shot.id,'MATERIAL_DEFERRED_DISPLAY_NOT_APPROVED','跨镜资料展示缺少当前输入的批准，核心人物须在介绍本镜展示',{kind:research.kind});
      if(!target||!fields.length)add(shot.id,'MATERIAL_DISPLAY_SLOT_UNAVAILABLE',`资料要求与${target?.shotCard||targetId}矛盾：原卡没有非人物的真实媒体槽，须重选卡或使用已批准的集中展示`,{kind:research.kind,displayShotId:targetId});
      else if(!field||!fields.includes(field))add(shot.id,'MATERIAL_DISPLAY_FIELD_REQUIRED','资料须逐条对应原卡真实媒体槽，文字、背景和数字人不能代替',{kind:research.kind,displayShotId:targetId,allowedFields:fields});
      checks.push({shotId:shot.id,kind:research.kind,query:research.query,displayShotId:targetId,field,allowedFields:fields});
      if(!binding)pending.push({shotId:shot.id,kind:research.kind,code:'MATERIAL_SOURCE_VERIFICATION_PENDING'});
    }
  }
  return {schema:EDITORIAL_MATERIAL_CONTRACT_VERSION,passed:issues.length===0,issues,pending,checks,
    materialsVerified:false,productionAdmitted:false,userAcceptance:false};
}
