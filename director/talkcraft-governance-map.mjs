import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {loadTalkcraftGovernedCatalog,talkcraftEditorialContract,canonicalCardId} from './talkcraft-governed-contract.mjs';
import {MANAGED_WORKFLOW_NODES} from './talkcraft-workflow-contract.mjs';
import {MATERIAL_POLICY_RULES} from './talkcraft-material-policy.mjs';
import {BACKGROUND_PRESENTATION_RULES} from './talkcraft-background-presentation.mjs';

const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
// The registry describes real production handlers. It never edits arbitrary
// code, invents template parameters, or bypasses a downstream gate.
export const GOVERNANCE_HANDLERS=Object.freeze({
 'material-completion':{stage:'material-completion',nodes:['candidates','storyboard-review','preflight'],paid:false},
 'editorial-repair':{stage:'editorial-revision',nodes:['editorial','candidates','storyboard-review','preflight'],paid:true},
 'local-recheck':{nodes:MANAGED_WORKFLOW_NODES.filter(n=>!['review','deliver'].includes(n.id)).map(n=>n.id),paid:false},
 'institution-source-reuse':{stage:'institution-source-repair',nodes:['candidates'],paid:false},
 'source-discovery':{stage:'material-research',nodes:['candidates'],paid:false},
 'source-recheck':{stage:'candidates',nodes:['candidates'],paid:false},
 'candidate-recheck':{stage:'candidates',nodes:['storyboard-review'],paid:false},
 'restore-unsubmitted':{stage:'editorial-recover',nodes:['editorial','candidates','storyboard-review'],paid:false},
 'recover-editorial-response':{stage:'editorial-recover',nodes:['editorial'],paid:false},
 'recover-response':{stage:'planning-repair',nodes:['editorial','candidates','storyboard-review','preflight'],paid:false},
 'rebuild-sample':{stage:'sample',nodes:['render-all'],paid:false},
});
export function buildGovernanceMap(root,{index,catalog}={}){
 index??=read(path.join(resolveTalkcraftSkillRoot(root),'references/cards-index.json'));
 catalog??=loadTalkcraftGovernedCatalog(index);
 const contract=talkcraftEditorialContract(catalog);
 return {schema:'talkcraft-governance-map-v1',contractVersion:contract.version,
  rules:{material:MATERIAL_POLICY_RULES,background:BACKGROUND_PRESENTATION_RULES,timing:contract.timingRules,
   global:['原稿、音频及真实字级时钟固定','前三镜锁定','全片30镜去重或有真实同观点承接依据','全片图形优先和文字比例','模板源码、实际参数、素材槽和时长同源核验','中心技术终审不替代14人工审核']},
  templates:contract.cards.map(c=>{const source=catalog.cards.find(x=>x.cardId===c.slug).implementation;return {...c,
   source:{layer:source.layer,file:source.file,export:source.export,sha256:source.sha256,dependencies:source.dependencies},
   handlers:['material-completion','editorial-repair','local-recheck']};}),
  handlers:GOVERNANCE_HANDLERS,nodes:MANAGED_WORKFLOW_NODES.map(n=>({node:n.id,
   handlers:Object.entries(GOVERNANCE_HANDLERS).filter(([,h])=>h.nodes.includes(n.id)).map(([id])=>id),
   humanOnly:['review','deliver'].includes(n.id)}))};
}
export function buildGovernanceCase(project,{run,feedback,rules,map,catalog}){
 const shots=read(path.join(project,'remotion/shots.json'));
 const issues=feedback?.failedChecks||[];
 const plans=shots.filter(s=>issues.some(i=>i.shotId===s.id||i.previousShotId===s.id||i.shotIds?.includes(s.id))).map(s=>{
  const cardId=canonicalCardId(s.shotCard,catalog),template=map.templates.find(t=>t.slug===cardId);
  if(!template)throw Error(s.id+' 缺少已治理模板合同');
  const checks=issues.filter(i=>i.shotId===s.id||i.previousShotId===s.id||i.shotIds?.includes(s.id));
  return {shotId:s.id,cardId,templateContractSha256:digest(template),currentParameters:s.templateParams?.cardProps||{},
   durationSeconds:Number(s.end)-Number(s.start),issues:checks,
   steps:[{handler:'material-completion',when:'缺少真实素材或绑定',effects:['采集、许可核验、恢复及真实槽绑定']},
    {handler:'editorial-repair',when:'已证实需新创作且免费恢复无解',requiresCurrentCostAuthorization:true},
    {handler:'local-recheck',when:'每次修正后',effects:['原节点门禁及全片联合校验']}],
   locked:['口播原文','配音','数字人素材','字级时钟','无关镜头']};
 });
 return {schema:'talkcraft-governance-case-v1',runId:run.runId,rulesSha256:digest(rules),mapSha256:digest(map),
  inputSha256:digest(shots),shotPlans:plans,unscopedIssues:issues.filter(i=>!i.shotId&&!i.previousShotId&&!i.shotIds?.length),
  globalReview:{checks:['完整失败范围覆盖','锁定镜头','30镜去重','全片文字比例','参数与素材槽一致','全片真实时钟','费用去重'],
   executionDoesNotPassGate:true,stopAt:'review'},productionAdmitted:false,userAcceptance:false};
}
