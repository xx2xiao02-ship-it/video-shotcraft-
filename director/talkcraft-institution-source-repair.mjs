import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {withMaterialBindingTransaction} from './talkcraft-material-binding-transaction.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const safeFile=(root,name)=>{
 if(typeof name!=='string'||path.isAbsolute(name)||/^(?:[a-z]+:|[/\\])/iu.test(name))throw Error('来源路径必须是工程内相对路径');
 const file=fs.realpathSync(path.resolve(root,name)),rel=path.relative(fs.realpathSync(root),file);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('来源路径越界');return file;
};
function officialDocument(root,binding,entityName){
 try{
  const u=new URL(binding.sourceUrl);
  if(u.protocol!=='https:'||!u.hostname.endsWith('.gov.cn')||binding.sourceVerified!==true||binding.licenseVerified!==true||
   !binding.license||!binding.licenseUrl||!binding.identityReason||binding.contentLanguage!=='zh-CN')return null;
  const image=safeFile(root,binding.localPath),meta=safeFile(root,binding.sourceCoordinates),data=read(meta);
  if(hash(fs.readFileSync(image))!==binding.sha256||data.url!==binding.sourceUrl)return null;
  const publisher=String(data.text||'').match(/网站主办单位[：:]\s*([^\s　\n]+)/u)?.[1];
  if(!publisher||![entityName,entityName+'办公厅',entityName+'办公室'].includes(publisher))return null;
  return {publisher,metadataSha256:hash(fs.readFileSync(meta))};
 }catch{return null;}
}
// Reuse an already reviewed DOCUMENT for the SAME institution's identity.
// This does not license its emblem, create a portrait, or prove a data claim.
export function proposeInstitutionSourceRepair(project){
 try{
  const research=read(path.join(project,'material-research-plan.json')),shots=read(path.join(project,'remotion/shots.json'));
  const root=path.join(project,'remotion/public'),alternatives=[];
  for(const row of research.shots||[])for(const need of row.research||[]){
   if(need.kind!=='identity'||need.entityType!=='other'||!need.entityName||
    row.bindings?.some(b=>b.kind===need.kind&&b.query===need.query))continue;
   const candidates=(row.bindings||[]).flatMap(b=>{
    const original=row.research?.find(r=>r.kind===b.kind&&r.query===b.query);
    const targetId=need.displayShotId||row.shotId,field=need.displayField||b.field;
    if(b.kind!=='identity'||original?.entityType!=='other'||targetId!==row.shotId||
      (b.displayShotId||row.shotId)!==row.shotId||field!==b.field||/host/iu.test(field||'')||
      shots.find(s=>s.id===row.shotId)?.templateParams?.cardProps?.[field]?.replace(/^remotion\/public\//u,'')!==b.localPath)return [];
    const proof=officialDocument(root,b,need.entityName);
    return proof?[{sourceQuery:b.query,field,localPath:b.localPath,sha256:b.sha256,sourceUrl:b.sourceUrl,...proof}]:[];
   });
   // Never pick among multiple plausible sources, or merge unrelated evidence.
   if(candidates.length===1)alternatives.push({shotId:row.shotId,kind:need.kind,query:need.query,
    entityName:need.entityName,presentation:'official-institution-document',...candidates[0]});
  }
  if(!alternatives.length)return null;
  return {schema:'talkcraft-institution-source-repair-v1',inputs:Object.fromEntries(
    ['input.txt','aligned-sentences.json','audio/full.mp3','material-research-plan.json','remotion/shots.json'].map(n=>[n,hash(fs.readFileSync(path.join(project,n)))])),
    alternatives,paidCalls:0,grantsLogoRights:false,productionAdmitted:false};
 }catch{return null;}
}
export async function executeInstitutionSourceRepair(project,{fetchImpl=fetch}={}){
 const center=read(path.join(project,'qa/correction-center.json')),plan=center.sourcePlan;
 if(center.approved!==true||center.action!=='institution-source-reuse'||plan?.schema!=='talkcraft-institution-source-repair-v1')
  throw Error('缺少治理中心批准的本次机构资料替代方案');
 const current=proposeInstitutionSourceRepair(project);
 if(JSON.stringify(current)!==JSON.stringify(plan))throw Error('机构资料替代方案或来源发生变化，停止执行');
 for(const source of plan.alternatives){
  const response=await fetchImpl(source.sourceUrl,{signal:AbortSignal.timeout(12000)});
  const finalUrl=new URL(response.url||source.sourceUrl);
  if(!response.ok||finalUrl.protocol!=='https:'||finalUrl.hostname!==new URL(source.sourceUrl).hostname)
   throw Error('机构原件当前不可访问或跳转到其他站点，不应用替代');
  const text=await response.text();
  if(!text.includes(source.entityName))throw Error('当前官方页面无法核对机构身份');
 }
 return withMaterialBindingTransaction(project,tx=>{
  if(JSON.stringify(proposeInstitutionSourceRepair(project))!==JSON.stringify(plan))throw Error('执行期间输入变化');
  const research=read(path.join(project,'material-research-plan.json'));
  for(const alt of plan.alternatives){
   const row=research.shots.find(r=>r.shotId===alt.shotId),source=row.bindings.find(b=>b.query===alt.sourceQuery&&b.kind==='identity');
   row.bindings.push({...structuredClone(source),query:alt.query,
    sourceAlternative:{schema:plan.schema,entityName:alt.entityName,presentation:alt.presentation,
     sourceQuery:alt.sourceQuery,sourceSha256:alt.sha256,metadataSha256:alt.metadataSha256,
     publisher:alt.publisher,grantsLogoRights:false}});
  }
  tx.commit({'material-research-plan.json':research});
  const report={schema:plan.schema,applied:plan.alternatives,paidCalls:0,productionAdmitted:false};
  fs.writeFileSync(path.join(project,'qa/institution-source-repair.json'),JSON.stringify(report,null,2));return report;
 });
}
