import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {currentEditorialRepairFeedback} from './talkcraft-editorial-planning-contract.mjs';

const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const local=value=>typeof value==='string'?value.replace(/^remotion\/public\//u,''):value;
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sameShot=(a,b)=>a.firstSentence===b.firstSentence&&a.lastSentence===b.lastSentence&&
  a.shotCard===b.shotCard&&a.subject===b.subject;

// Restore verified data, never pick a card, invent a source or alter timing.
export function restoreEditorialReviewedBindings(project,proposal,catalog){
  const result=structuredClone(proposal),repairs=[],rejected=[];
  const feedback=currentEditorialRepairFeedback(project);
  if(!feedback?.snapshot)return {result,repairs,rejected};
  const snapshot=path.resolve(project,feedback.snapshot);
  if(!fs.existsSync(path.join(snapshot,'material-research-plan.json')))return {result,repairs,rejected};
  const oldShots=read(path.join(snapshot,'remotion/shots.json'));
  const oldResearch=read(path.join(snapshot,'material-research-plan.json'));
  const rows=result.materialResearch?.shots;
  if(!Array.isArray(rows)||!Array.isArray(result.shots))return {result,repairs,rejected};
  if(!fs.existsSync(path.join(project,'remotion/public')))return {result,repairs,rejected};
  const publicRoot=fs.realpathSync(path.join(project,'remotion/public'));
  for(const oldShot of oldShots){
    const matches=result.shots.filter(s=>sameShot(s,oldShot));
    if(matches.length!==1)continue;
    const shot=matches[0],row=rows.find(r=>r.shotId===shot.id);
    const oldRow=oldResearch.shots?.find(r=>r.shotId===oldShot.id);
    if(!row||!oldRow)continue;
    for(const binding of oldRow.bindings||[]){
      try{
        const oldNeed=oldRow.research?.find(r=>r.kind===binding.kind&&r.query===binding.query);
        if(!oldNeed)continue;
        // A person's exact identity survives wording changes; evidence/data
        // claims require the identical research query, never a fuzzy match.
        const needs=(row.research||[]).filter(r=>r.kind===oldNeed.kind&&
          (oldNeed.kind==='identity'&&oldNeed.entityType==='person'&&oldNeed.entityName?
            r.entityType==='person'&&r.entityName===oldNeed.entityName:r.query===oldNeed.query));
        if(needs.length!==1)continue;
        const need=needs[0],oldTarget=oldShots.find(s=>s.id===(binding.displayShotId||oldNeed.displayShotId||oldShot.id));
        const targets=oldTarget?result.shots.filter(s=>sameShot(s,oldTarget)):[];
        if(targets.length!==1)continue;
        const target=targets[0],props=target.templateParams?.cardProps;
        const media=catalog.cards.find(c=>c.cardId===target.shotCard)?.policy?.media||{};
        const field=binding.field;
        if(!props||!field||field==='hostSrc'||!['image','image-or-video'].includes(media[field])||
          local(oldTarget.templateParams?.cardProps?.[field])!==binding.localPath)continue;
        if(need.displayField&&need.displayField!==field||need.displayShotId&&need.displayShotId!==target.id)
          throw Error('新方案已明确选择不同展示位置，不能自动改绑');
        if(props[field]&&local(props[field])!==binding.localPath)throw Error('新方案素材槽已绑定不同文件');
        const oldDisplay=oldRow.personDisplays?.find(d=>d.entityName===oldNeed.entityName&&d.bindingQuery===oldNeed.query);
        const display=row.personDisplays?.find(d=>d.entityName===need.entityName);
        if(oldNeed.entityType==='person'&&(!oldDisplay||!display||
          display.labelField!==oldDisplay.labelField||display.labelText!==oldDisplay.labelText||
          props[display.labelField]!==oldDisplay.labelText))throw Error('人物标签或展示关系变化，不能恢复旧身份资料');
        if(!binding.localPath||path.isAbsolute(binding.localPath)||/^(?:[a-z]+:|[/\\])/iu.test(binding.localPath))
          throw Error('旧资料路径不合法');
        const file=fs.realpathSync(path.resolve(publicRoot,binding.localPath)),relative=path.relative(publicRoot,file);
        if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||
          !fs.statSync(file).isFile()||! /\.(png|jpe?g|webp)$/iu.test(file)||hash(file)!==binding.sha256)
          throw Error('旧资料文件或哈希已变化');
        if(binding.sourceVerified!==true||binding.licenseVerified!==true||!/^https:\/\//u.test(binding.sourceUrl||'')||
          !binding.license||!binding.licenseUrl||!binding.identityReason||!binding.contentLanguage||
          binding.contentLanguage==='und'||!/^(zh(?:-[a-z]+)*|zxx)$/iu.test(binding.contentLanguage)&&!binding.languageReason)
          throw Error('旧来源、授权或语言记录不完整');
        const previous=(row.bindings||[]).filter(b=>b.kind===need.kind&&b.query===need.query);
        if(previous.some(b=>b.localPath!==binding.localPath||b.sha256!==binding.sha256||b.field&&b.field!==field))
          throw Error('新方案已有冲突资料记录');
        const restored={...binding,query:need.query,field,
          ...(target.id!==shot.id?{displayShotId:target.id}:{})};
        const was=JSON.stringify({props:props[field],need,previous,display});
        props[field]='remotion/public/'+binding.localPath;
        need.displayField=field;
        if(target.id!==shot.id)need.displayShotId=target.id;
        row.bindings??=[];
        if(previous.length)previous.forEach(b=>Object.assign(b,restored));else row.bindings.push(restored);
        if(display){display.bindingQuery=need.query;display.presentation=oldDisplay.presentation;}
        if(was!==JSON.stringify({props:props[field],need,previous:(row.bindings||[]).filter(b=>b.kind===need.kind&&b.query===need.query),display}))
          repairs.push({shotId:shot.id,displayShotId:target.id,field,localPath:binding.localPath,
            sha256:binding.sha256,reason:'从当前输入指纹一致的修订快照恢复同句段、同原卡及同一身份的已核验资料；不改变选卡或时钟'});
      }catch(error){rejected.push({shotId:shot.id,field:binding.field,message:error.message});}
    }
  }
  return {result,repairs,rejected};
}
