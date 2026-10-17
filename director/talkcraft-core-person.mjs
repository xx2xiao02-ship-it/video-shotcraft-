export const CORE_PERSON_RULES='身份研究中的人物默认按核心人物处理，须逐人提供personDisplays:[{entityName,role:"core|mention",reason,presentation:"portrait|official-profile|research-source",bindingQuery,labelField,labelText}]。仅顺带提及可声明mention并给出理由；核心人物首次正式介绍须在本镜展示本人授权头像或可核验的官方人物/研究资料，逐人对应姓名。数字人不充当名人肖像；无头像许可时使用真实机构资料。核心介绍不得用后续集中来源代替；仅有搜索词/未绑定文件/名称文字均不通过。标签必须来自原卡公开文字字段，资料须实际进入原卡媒体槽；保持原构图、真实字级时钟。';
export function checkCorePersonDisplays(rows,shots){
 const issues=[];
 for(const row of rows||[])for(const person of row.research||[]){
  if(person.entityType!=='person')continue;
  const display=(row.personDisplays||[]).find(d=>d.entityName===person.entityName);
  const fail=message=>issues.push({shotId:row.shotId,code:'CORE_PERSON_DISPLAY_REQUIRED',entityName:person.entityName,message});
  if(!display||!['core','mention'].includes(display.role)||!String(display.reason||'').trim()){fail('人物须明确核心/顺带职责及展示依据');continue;}
  if(display.role==='mention')continue;
  if(!['portrait','official-profile','research-source'].includes(display.presentation)){fail('核心人物须选择本人头像或真实资料展示');continue;}
  if(!shots)continue;
  const shot=shots.find(s=>s.id===row.shotId),p=shot?.templateParams?.cardProps||{};
  const binding=(row.bindings||[]).find(b=>b.kind==='identity'&&b.query===person.query&&b.query===display.bindingQuery);
  const path=binding?.localPath;
  const bound=path&&Object.values(p).some(v=>typeof v==='string'&&v.split('\n').some(x=>x.replace(/^remotion\/public\//u,'')===path));
  if(!binding||binding.displayShotId&&binding.displayShotId!==row.shotId||!bound){fail('核心人物资料必须在介绍本镜的原卡媒体槽实际展示');continue;}
  if(!display.labelField||!String(display.labelText||'').trim()||!String(p[display.labelField]||'').split('\n').includes(display.labelText))fail('每位核心人物必须对应原卡实际姓名标签');
  if(!Number.isFinite(shot.end-shot.start)||shot.end-shot.start<2)fail('核心人物资料镜头不足2秒，须重排而非冻结');
 }
 return issues;
}
