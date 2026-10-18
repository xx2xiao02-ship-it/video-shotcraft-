import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {editorialMaterialRefs} from './talkcraft-editorial-constraints.mjs';

const local=v=>typeof v==='string'?v.replace(/^remotion\/public\//u,''):v;
// Only source facts bound to this exact request may materialize an empty slot.
// Card choice, target, labels, reasons and word clocks remain model-authored.
export function restoreEditorialBoundSlots(result,request,{catalog,projectRoot,slotRetargets=[],bindingSelections=[]}){
  const repairs=[],rejected=[];
  if(!projectRoot)return {repairs,rejected};
  for(const row of result.materialResearch?.shots||[])for(const binding of row.bindings||[]){
    const original=request.baseProposal.materialResearch?.shots?.find(r=>r.shotId===row.shotId);
    const old=original?.bindings?.filter(b=>b.kind===binding.kind&&b.query===binding.query);
    if(old?.length!==1)continue;
    const source=old[0],need=row.research?.find(r=>r.kind===binding.kind&&r.query===binding.query);
    if(!need)continue;
    const targetId=binding.displayShotId||need.displayShotId||row.shotId;
    if(!request.editableShotIds.includes(targetId))continue;
    const target=result.shots.find(s=>s.id===targetId),field=binding.field||need.displayField;
    const props=target?.templateParams?.cardProps;
    if(!props||!field||props[field]!==undefined&&props[field]!==null&&props[field]!=='')continue;
    try{
      const oldNeed=original.research?.find(r=>r.kind===binding.kind&&r.query===binding.query);
      const oldTarget=source.displayShotId||oldNeed?.displayShotId||row.shotId;
      const explicitRetarget=slotRetargets.some(r=>r.shotId===row.shotId&&r.kind===binding.kind&&r.query===binding.query&&r.field===field)&&
        binding.field===field&&need.displayField===field;
      if(targetId!==oldTarget||need.displayField&&need.displayField!==field||source.field!==field&&!explicitRetarget)
        throw Error('来源记录与本次明确目标不一致，不能自动选槽');
      const media=catalog.cards.find(c=>c.cardId===target.shotCard)?.policy?.media||{};
      if(field==='hostSrc'||!['image','image-or-video'].includes(media[field]))throw Error('目标不是原卡公开图片槽');
      const query=target.templateParams.templateMaterialQueries?.[field];
      const selectedRef=bindingSelections.find(r=>r.shotId===row.shotId&&r.field===field&&
        editorialMaterialRefs(request,row.shotId,'bindings').some(ref=>ref.ref===r.bindingRef&&
          JSON.stringify(ref.item)===JSON.stringify(source)));
      // A verified explicit source reference identifies the file. A discovery
      // query alone never proves identity and cannot authorize this recovery.
      if(query&&query!==source.query&&!selectedRef)throw Error('本次槽位检索身份与已核验文件不一致');
      if(source.localPath!==binding.localPath||source.sha256!==binding.sha256)throw Error('本次来源文件记录被改写');
      if(!source.localPath||path.isAbsolute(source.localPath)||/^(?:[a-z]+:|[/\\])/iu.test(source.localPath))throw Error('来源不是相对本地路径');
      const publicRoot=fs.realpathSync(path.join(projectRoot,'remotion/public'));
      const file=fs.realpathSync(path.resolve(publicRoot,source.localPath)),relative=path.relative(publicRoot,file);
      if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||!fs.statSync(file).isFile()||
        !/\.(png|jpe?g|webp)$/iu.test(file)||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==source.sha256)
        throw Error('来源路径越界、文件缺失或哈希变化');
      if(source.sourceVerified!==true||source.licenseVerified!==true||!/^https:\/\//u.test(source.sourceUrl||'')||
        !source.license||!source.licenseUrl||!source.identityReason||!source.contentLanguage||source.contentLanguage==='und'||
        !/^(zh(?:-[a-z]+)*|zxx)$/iu.test(source.contentLanguage)&&!source.languageReason)throw Error('来源、授权或语言核验不完整');
      if(need.entityType==='person'){
        if(oldNeed?.entityType!=='person'||oldNeed.entityName!==need.entityName)throw Error('人物身份变化');
        const display=row.personDisplays?.find(d=>d.entityName===need.entityName&&d.bindingQuery===need.query);
        if(!display||props[display.labelField]!==display.labelText||!display.labelText)throw Error('人物标签与资料身份不一致');
      }
      props[field]='remotion/public/'+source.localPath;
      repairs.push({shotId:row.shotId,displayShotId:targetId,field,localPath:source.localPath,sha256:source.sha256,
        ...(selectedRef?{bindingRef:selectedRef.bindingRef,discoveryQuery:query,sourceQuery:source.query}: {})});
    }catch(error){rejected.push({shotId:row.shotId,displayShotId:targetId,field,message:error.message});}
  }
  return {repairs,rejected};
}
