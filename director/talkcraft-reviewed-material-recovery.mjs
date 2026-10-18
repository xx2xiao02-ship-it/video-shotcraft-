import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';

const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const registry='qa/reviewed-material-recovery.json';
function snapshotFile(project,relative){
  if(typeof relative!=='string'||!/^qa\/storyboard-revisions\/[^/]+\/material-binding-plan\.json$/u.test(relative))
    throw Error('只接受当前任务明确指定的素材计划快照，不搜索历史或其他运行');
  const file=fs.realpathSync(path.join(project,relative)),base=fs.realpathSync(project);
  if(path.relative(base,file).replaceAll('\\','/')!==relative)throw Error('素材快照路径越界或经过链接');
  return file;
}
function context(shot,card){
  const result=structuredClone(shot);
  for(const field of Object.keys(card.policy?.media||{}))delete result.templateParams?.cardProps?.[field];
  return result;
}
// Only facts from an explicitly selected, hash-bound same-run acquisition are
// reusable. A previous creative plan or a successful video is never a fallback.
export function loadReviewedMaterialRecovery(project,catalog,shots,research,record,{allowChangedDesign=false}={}){
  if(!record){const file=path.join(project,registry);if(!fs.existsSync(file))return null;record=read(file);}
  const source=read(path.join(project,'source-run.json'));
  if(record.schema!=='talkcraft-reviewed-material-recovery-v1'||!source.runId||record.runId!==source.runId||
    record.inputSha256!==hash(path.join(project,'input.txt')))throw Error('素材恢复记录与当前任务或原稿不一致');
  const file=snapshotFile(project,record.snapshot);
  if(hash(file)!==record.planSha256)throw Error('素材快照哈希已变化');
  const plan=read(file),snapshot=path.dirname(file);
  if(plan.schema!=='talkcraft-material-binding-plan-v1'||plan.inputSha256!==record.inputSha256||!Array.isArray(plan.bindings))
    throw Error('素材快照未绑定当前原稿');
  const oldShots=read(path.join(snapshot,'remotion/shots.json')),oldResearch=read(path.join(snapshot,'material-research-plan.json'));
  const restored=[],eligible=[],skipped=[];
  for(const entry of plan.bindings){
    const shot=shots.find(s=>s.id===entry.shotId),oldShot=oldShots.find(s=>s.id===entry.shotId);
    const card=catalog.cards.find(c=>c.cardId===shot?.shotCard),row=research.shots.find(r=>r.shotId===entry.shotId);
    const oldRow=oldResearch.shots.find(r=>r.shotId===entry.shotId);
    if(!shot||!oldShot||!row||!oldRow||!card?.policy?.media?.[entry.field]||
      !isDeepStrictEqual(context(shot,card),context(oldShot,card))){
        if(allowChangedDesign){skipped.push({shotId:entry.shotId,field:entry.field,reason:'本镜设计改变，旧绑定未复用，须由当前槽位及来源校验重新绑定'});continue;}
        throw Error(`${entry.shotId}镜头设计或槽位已改变，不能恢复旧绑定`);
      }
    const oldPath=oldShot.templateParams?.cardProps?.[entry.field]?.replace(/^remotion\/public\//u,'');
    const currentPath=shot.templateParams?.cardProps?.[entry.field]?.replace(/^remotion\/public\//u,'');
    if(oldPath!==entry.localPath||currentPath&&currentPath!==entry.localPath)throw Error(`${entry.shotId}.${entry.field}文件与已核验快照冲突`);
    if(entry.kind){
      const need=row.research?.filter(r=>r.kind===entry.kind&&r.query===entry.query);
      const oldNeed=oldRow.research?.filter(r=>r.kind===entry.kind&&r.query===entry.query);
      if(need?.length!==1||oldNeed?.length!==1||!isDeepStrictEqual(need,oldNeed))throw Error(`${entry.shotId}资料需求已改变，不能挪用来源`);
    }else{
      const declaration=oldRow.materialBindings?.find(b=>b.field===entry.field&&b.localPath===entry.localPath&&b.sha256===entry.sha256);
      if(!declaration)throw Error(`${entry.shotId}.${entry.field}缺少快照明确槽位声明`);
      const existing=row.materialBindings?.find(b=>b.field===entry.field);
      if(existing&&(existing.localPath!==declaration.localPath||existing.sha256!==declaration.sha256||
        (existing.sourceUrl||existing.url)!==(declaration.sourceUrl||declaration.url)))throw Error(`${entry.shotId}.${entry.field}当前声明与快照冲突`);
      if(!existing){row.materialBindings??=[];row.materialBindings.push(structuredClone(declaration));restored.push({shotId:entry.shotId,field:entry.field});}
    }
    eligible.push(entry);
  }
  return {plan:{...plan,bindings:eligible},restored,skipped,snapshot:record.snapshot,planSha256:record.planSha256};
}
export function registerReviewedMaterialRecovery(project,catalog,{snapshot,planSha256}){
  const source=read(path.join(project,'source-run.json'));
  const record={schema:'talkcraft-reviewed-material-recovery-v1',runId:source.runId,
    inputSha256:hash(path.join(project,'input.txt')),snapshot,planSha256,paidCalls:0};
  loadReviewedMaterialRecovery(project,catalog,read(path.join(project,'remotion/shots.json')),
    read(path.join(project,'material-research-plan.json')),record);
  const file=path.join(project,registry);
  if(fs.existsSync(file)&&!isDeepStrictEqual(read(file),record))throw Error('已有不同的明确素材恢复记录，拒绝覆盖');
  if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  return record;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {loadTalkcraftGovernedCatalog}=await import('./talkcraft-governed-contract.mjs');
  const {resolveTalkcraftSkillRoot}=await import('./talkcraft-skill-root.mjs');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const [project,snapshot,planSha256]=process.argv.slice(2);
  const catalog=loadTalkcraftGovernedCatalog(read(path.join(resolveTalkcraftSkillRoot(root),'references/cards-index.json')));
  console.log(JSON.stringify(registerReviewedMaterialRecovery(project,catalog,{snapshot,planSha256})));
}
