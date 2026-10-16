import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadTalkcraftGovernedCatalog,validateTalkcraftDesignProps} from './talkcraft-governed-contract.mjs';
import {assertTalkcraftRuntimeFidelity} from './talkcraft-runtime-fidelity.mjs';
import {readTalkcraftStatus} from './talkcraft-status.mjs';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function assertNativeRenderAdmission(approval,status) {
  if(!status.storyboardApproved)throw Error('正式模板绑定与当前已审核分镜不一致');
  if(!status.preflightPassed)throw Error('正式模板必须通过当前分镜全量预检');
  if(approval.approvalScope==='storyboard-planning'){
    if(!status.digitalHumanGenerationPlanned||approval.planningPassed!==true||!status.planningPassed)
      throw Error('数字人分镜规划审批或当前规划校验未通过');
  }else if(approval.preflightPassed!==true)throw Error('正式模板缺少有效分镜审批');
}

// The 108-card scaffold and the older 3-card editor are distinct implementations.
// A native scaffold must prove its approved bindings and exact runtime source;
// the older card-call validator remains authoritative for existing old records.
export function assertNativeCardBinding(project,skillRoot,{requiredShotIds=[],requireCompleteCoverage=false}={}) {
  const registry=path.join(project,'remotion/src/scenes/scene-shared.tsx');
  if (!fs.existsSync(registry)) throw Error('缺少正式模板工程；请先搭建渲染工程');
  const approval=read(path.join(project,'qa/storyboard-approved.json'));
  for (const name of ['semantics.json','SHOTBOOK.md','remotion/shots.json'])
    if (approval.inputs?.[name]!==hash(path.join(project,name))) throw Error('正式模板绑定与已审核分镜不一致');
  // Planning approval precedes generated host footage. Read the current full
  // preflight gate rather than changing the historical approval record.
  const runId=path.basename(path.dirname(project)),root=path.resolve(project,'../../../..');
  const status=readTalkcraftStatus(root,runId);
  assertNativeRenderAdmission(approval,status);
  const shots=read(path.join(project,'remotion/shots.json'));
  const formal=read(path.join(project,'qa/formal-bindings.json'));
  if (formal.schema!=='talkcraft-formal-bindings-v1' || formal.bindings?.length!==shots.length) throw Error('正式主卡绑定未覆盖全部镜头');
  const ids=new Set();
  for (const shot of shots) {
    const rows=formal.bindings.filter(row=>row.shotId===shot.id);
    if (ids.has(shot.id) || rows.length!==1 || rows[0].shotCard!==shot.shotCard ||
        JSON.stringify(rows[0].templateParams)!==JSON.stringify(shot.templateParams)) throw Error('正式主卡或参数绑定不一致：'+shot.id);
    ids.add(shot.id);
  }
  if (requiredShotIds.some(id=>!ids.has(id))) throw Error('必需镜头没有正式主卡');
  const implemented = shots.filter(s=>fs.existsSync(path.join(project,'remotion/src/scenes',s.id+'.tsx')));
  if (requiredShotIds.some(id=>!implemented.some(s=>s.id===id)) || requireCompleteCoverage && implemented.length!==shots.length)
    throw Error('仍有镜头待按已审核样板实现');
  const catalog=loadTalkcraftGovernedCatalog(read(path.join(skillRoot,'references/cards-index.json')));
  const design=validateTalkcraftDesignProps(shots,{catalog,projectRoot:project});
  if (!design.passed) throw Error('正式模板参数校验失败：'+design.errors.map(e=>e.message).join('；'));
  const fidelity=assertTalkcraftRuntimeFidelity(project,{skillRoot});
  if (!fidelity.sourceIntegrityPassed) throw Error('正式模板运行源码未通过核验');
  const files=['remotion/shots.json','qa/formal-bindings.json','qa/storyboard-approved.json',
    'remotion/src/shots.ts','remotion/src/scenes/index.ts','remotion/src/talkcraft-template-adapter.tsx'];
  for(const name of ['qa/preflight-result.json','qa/preflight-passed.json','qa/planning-result.json',
    'qa/media-preflight-result.json','qa/generated-host-preflight-result.json'])
    if(fs.existsSync(path.join(project,name)))files.push(name);
  const evidence={schema:'talkcraft-native-card-binding-v1',inputs:Object.fromEntries(files.map(f=>[f,hash(path.join(project,f))])),
    calls:implemented.map(s=>({shotId:s.id,cardId:s.shotCard,props:s.templateParams.cardProps,
      sceneSha256:hash(path.join(project,'remotion/src/scenes',s.id+'.tsx'))})),
    fidelitySha256:createHash('sha256').update(JSON.stringify(fidelity)).digest('hex')};
  return {present:false,governed:true,complete:implemented.length===shots.length,project,evidence,
    sha256:createHash('sha256').update(JSON.stringify(evidence)).digest('hex')};
}
