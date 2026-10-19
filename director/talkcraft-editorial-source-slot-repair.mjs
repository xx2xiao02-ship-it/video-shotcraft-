import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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
