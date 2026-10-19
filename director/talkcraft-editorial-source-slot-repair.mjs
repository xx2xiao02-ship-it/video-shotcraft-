import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {editorialMaterialRefs} from './talkcraft-editorial-constraints.mjs';

// A retained, explicitly selected immutable inlet may canonicalize stale
// aliases of that same physical document. Changed slots are not candidates.
export function repairEditorialRetainedSourceAliases(result,request,{catalog,projectRoot,bindingSelections=[]}){
 const repairs=[];if(!projectRoot)return repairs;
 for(const targetId of request.editableShotIds){
  const target=result.shots.find(s=>s.id===targetId),base=request.baseProposal.shots.find(s=>s.id===targetId);
  if(!target||target.shotCard===base?.shotCard)continue;
  const fields=Object.entries(catalog.cards.find(c=>c.cardId===target.shotCard)?.policy?.media||{})
   .filter(([f,k])=>!['hostSrc','handSrc'].includes(f)&&['image','image-or-video'].includes(k)).map(([f])=>f);
  const retained=[];
  for(const selected of bindingSelections){
   const old=editorialMaterialRefs(request,selected.shotId,'bindings').find(r=>r.ref===selected.bindingRef)?.item;
   const oldRow=request.baseProposal.materialResearch?.shots?.find(r=>r.shotId===selected.shotId);
   const oldNeed=oldRow?.research?.find(n=>n.kind===old?.kind&&n.query===old?.query);
   const binding=result.materialResearch?.shots?.find(r=>r.shotId===selected.shotId)?.bindings?.find(b=>b.kind===old?.kind&&b.query===old?.query);
   if(!old||!binding||old.field!==selected.field||binding.field!==old.field||!fields.includes(old.field)||
    (old.displayShotId||oldNeed?.displayShotId||selected.shotId)!==targetId||
    (binding.displayShotId||oldNeed?.displayShotId||selected.shotId)!==targetId||
    old.kind!=='identity'||old.sourceVerified!==true||old.licenseVerified!==true||!old.license||!old.licenseUrl||
    old.localPath!==binding.localPath||old.sha256!==binding.sha256)continue;
   retained.push({old,field:old.field});
  }
  for(const row of result.materialResearch?.shots||[])for(const need of row.research||[]){
   const oldRow=request.baseProposal.materialResearch?.shots?.find(r=>r.shotId===row.shotId);
   const oldNeed=oldRow?.research?.find(n=>n.kind===need.kind&&n.query===need.query);
   const old=oldRow?.bindings?.find(b=>b.kind===need.kind&&b.query===need.query);
   const binding=row.bindings?.find(b=>b.kind===need.kind&&b.query===need.query);
   if(!old||!oldNeed||!binding||fields.includes(need.displayField)||need.displayField!==oldNeed.displayField||binding.field!==old.field||
    (need.displayShotId||row.shotId)!==targetId||(old.displayShotId||oldNeed.displayShotId||row.shotId)!==targetId||
    (binding.displayShotId||need.displayShotId||row.shotId)!==targetId||old.kind!=='identity'||
    old.sourceVerified!==true||old.licenseVerified!==true||!old.license||!old.licenseUrl||
    old.localPath!==binding.localPath||old.sha256!==binding.sha256)continue;
   const options=retained.filter(r=>r.old.localPath===old.localPath&&r.old.sha256===old.sha256&&r.old.sourceUrl===old.sourceUrl);
   const unique=[...new Set(options.map(r=>r.field))];if(unique.length!==1)continue;
   const field=unique[0],prop=target.templateParams.cardProps[field];
   if(prop&&prop.replace(/^remotion\/public\//u,'')!==old.localPath)continue;
   try{
    const root=fs.realpathSync(path.join(projectRoot,'remotion/public'));
    if(typeof old.localPath!=='string'||path.isAbsolute(old.localPath)||/^(?:[a-z]+:|[/\\])/iu.test(old.localPath))continue;
    const file=fs.realpathSync(path.resolve(root,old.localPath)),rel=path.relative(root,file);
    if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||!fs.statSync(file).isFile()||
     createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==old.sha256)continue;
   }catch{continue;}
   repairs.push({requestId:request.requestId,shotId:row.shotId,displayShotId:targetId,kind:need.kind,query:need.query,
    field,previousBindingField:binding.field,previousDisplayField:need.displayField,localPath:old.localPath,sha256:old.sha256,
    operation:'same-document-explicit-retained-slot-alias'});
   need.displayField=field;binding.field=field;
  }
 }
 return repairs;
}

// Canonicalize only aliases of ONE verified physical document at a changed
// card's sole image inlet. Never merge different files or choose a source.
export function repairEditorialSourceSlotAliases(result,request,{catalog,projectRoot}){
 const repairs=[];
 if(!projectRoot)return repairs;
 for(const targetId of request.editableShotIds){
  const target=result.shots.find(s=>s.id===targetId),base=request.baseProposal.shots.find(s=>s.id===targetId);
  if(!target||target.shotCard===base?.shotCard)continue;
  const fields=Object.entries(catalog.cards.find(c=>c.cardId===target.shotCard)?.policy?.media||{})
   .filter(([f,k])=>!['hostSrc','handSrc'].includes(f)&&['image','image-or-video'].includes(k)).map(([f])=>f);
  if(fields.length!==1)continue;
  const field=fields[0],entries=[];
  for(const row of result.materialResearch?.shots||[])for(const need of row.research||[]){
   const oldRow=request.baseProposal.materialResearch?.shots?.find(r=>r.shotId===row.shotId);
   const oldNeed=oldRow?.research?.find(r=>r.kind===need.kind&&r.query===need.query);
   const old=oldRow?.bindings?.find(b=>b.kind===need.kind&&b.query===need.query);
   const binding=row.bindings?.find(b=>b.kind===need.kind&&b.query===need.query);
   if((binding?.displayShotId||need.displayShotId||row.shotId)!==targetId)continue;
   entries.push({row,need,oldNeed,old,binding});
  }
  if(!entries.length||entries.some(e=>e.need.displayShotId&&e.need.displayShotId!==targetId)||!entries.some(e=>e.need.displayField===field)||entries.some(e=>!e.old||!e.binding||
    e.old.kind!=='identity'||e.old.sourceVerified!==true||e.old.licenseVerified!==true||!e.old.license||!e.old.licenseUrl||
    e.binding.localPath!==e.old.localPath||e.binding.sha256!==e.old.sha256||
    (e.old.displayShotId||e.oldNeed?.displayShotId||e.row.shotId)!==targetId||
    ![field,e.oldNeed?.displayField].includes(e.need.displayField)||
    ![field,e.old.field].includes(e.binding.field)))continue;
  const files=new Set(entries.map(e=>e.old.localPath+'#'+e.old.sha256));
  if(files.size!==1)continue;
  const source=entries[0].old;
  try{
   const root=fs.realpathSync(path.join(projectRoot,'remotion/public'));
   if(typeof source.localPath!=='string'||path.isAbsolute(source.localPath)||/^(?:[a-z]+:|[/\\])/iu.test(source.localPath))continue;
   const file=fs.realpathSync(path.resolve(root,source.localPath)),rel=path.relative(root,file);
   if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||!fs.statSync(file).isFile()||
    createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==source.sha256)continue;
  }catch{continue;}
  const props=target.templateParams.cardProps;
  if(props[field]&&props[field].replace(/^remotion\/public\//u,'')!==source.localPath)continue;
  for(const e of entries){
   if(e.binding.field===field&&e.need.displayField===field)continue;
   repairs.push({requestId:request.requestId,shotId:e.row.shotId,displayShotId:targetId,kind:e.need.kind,query:e.need.query,
    field,previousBindingField:e.binding.field,previousDisplayField:e.need.displayField,localPath:source.localPath,sha256:source.sha256,
    operation:'same-document-sole-slot-alias'});
   e.binding.field=field;e.need.displayField=field;
  }
 }
 return repairs;
}
