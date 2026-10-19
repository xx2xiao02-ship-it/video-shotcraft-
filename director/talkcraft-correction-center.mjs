export {approvePresentationCorrection} from './talkcraft-presentation-approval.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {repeatedPaidRepairScope} from './talkcraft-paid-scope-history.mjs';
import {workflowNodeForTask} from './talkcraft-workflow-contract.mjs';
import {currentEditorialRepairFeedback} from './talkcraft-editorial-planning-contract.mjs';
import {editorialProviderBinding} from './talkcraft-editorial-provider.mjs';
import {proposeInstitutionSourceRepair} from './talkcraft-institution-source-repair.mjs';
import {buildGovernanceMap,buildGovernanceCase,GOVERNANCE_HANDLERS} from './talkcraft-governance-map.mjs';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {materialCompletionPlan} from './talkcraft-material-completion.mjs';
export {approveEditorialPunctuationCorrection} from './talkcraft-editorial-punctuation-correction.mjs';
export {approveEditorialReuseCorrection} from './talkcraft-editorial-reuse-correction.mjs';

const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sha=f=>fs.existsSync(f)?createHash('sha256').update(fs.readFileSync(f)).digest('hex'):null;
const read=f=>{try{return JSON.parse(fs.readFileSync(f));}catch{return null;}};
const identity=p=>Object.fromEntries(['input.txt','aligned-sentences.json','audio/full.mp3'].map(n=>[n,sha(path.join(p,n))]));
const save=(p,n,r)=>{fs.mkdirSync(path.dirname(path.join(p,n)),{recursive:true});fs.writeFileSync(path.join(p,n)+'.tmp',JSON.stringify(r,null,2));fs.renameSync(path.join(p,n)+'.tmp',path.join(p,n));return r;};
const RULE_FILES=['talkcraft-visual-preference.mjs','talkcraft-reviewed-templates.mjs','talkcraft-graphic-relation.mjs','talkcraft-text-video.mjs','talkcraft-material-policy.mjs','talkcraft-material-research.mjs','talkcraft-editorial-material-contract.mjs','talkcraft-background-presentation.mjs','talkcraft-keyword-caption.tsx','talkcraft-title-presentation.mjs','talkcraft-presentation-integrity.mjs','talkcraft-presentation-upgrade-source.mjs','talkcraft-presentation-runtime.tsx','talkcraft-presentation-correction.mjs','talkcraft-presentation-approval.mjs','talkcraft-host-context.mjs','talkcraft-runtime-fidelity.mjs','talkcraft-paid-scope-history.mjs','talkcraft-template-material-resolver.mjs','talkcraft-node-repair.mjs','talkcraft-editorial-planning-contract.mjs','talkcraft-native-governance.mjs','talkcraft-text-effect-dependencies.mjs','talkcraft-text-effect-sources.json','talkcraft-stages.mjs','talkcraft-auto-advance.mjs','talkcraft-native-preparation.mjs','talkcraft-editorial-selection-replay.mjs','talkcraft-editorial-source-slot-repair.mjs','talkcraft-editorial-bound-slots.mjs','talkcraft-editorial-revision.mjs','talkcraft-visual-content-contract.mjs','talkcraft-governed-contract.mjs','talkcraft-editorial-selection.mjs',
 'talkcraft-control-state.mjs','talkcraft-editorial-structure-repair.mjs','talkcraft-editorial-punctuation-correction.mjs','talkcraft-editorial-reuse-correction.mjs','talkcraft-editorial-anchor-scope.mjs','talkcraft-editorial-constraints.mjs','talkcraft-editorial-joint-repair.mjs','talkcraft-editorial-material-contract.mjs',
 'talkcraft-research-binding.mjs','talkcraft-template-material-resolver.mjs','talkcraft-correction-center.mjs',
 'talkcraft-node-correction-plan.mjs','talkcraft-editorial-joint-selection.mjs','talkcraft-ark-editorial.mjs','talkcraft-institution-source-repair.mjs',
 'talkcraft-governance-map.mjs','talkcraft-material-completion.mjs','../console-server.mjs'];
const ruleSnapshot=()=>Object.fromEntries(RULE_FILES.map(n=>[n,sha(new URL(n,import.meta.url))]));
const loadedRules=ruleSnapshot();
// A centre approves actions, never creative values or an invalid artifact.
// Model authorization is scoped to this run, provider, voice and expiry.
export function authorizeCorrectionCenter(project,runId,{approval,expiresAt,now=Date.now()}={}){
  const expiry=Date.parse(expiresAt),provider=editorialProviderBinding(runId);
  if(typeof approval!=='string'||approval.trim().length<8||!Number.isFinite(expiry)||expiry<=now||expiry-now>86400000)
    throw Error('治理中心须有明确用户授权及不超过24小时的有效期');
  if(provider?.provider!=='acctoken'||provider.model!=='deepseek-v4.1-flash')throw Error('治理授权只允许已配置的DeepSeek，不自动换模型');
  const inputs=identity(project);if(Object.values(inputs).some(v=>!v))throw Error('治理授权缺少本次原稿、字级时间或原配音');
  return save(project,'qa/correction-authorization.json',{schema:'talkcraft-correction-authorization-v1',runId,approval,
    approvedAt:new Date(now).toISOString(),expiresAt:new Date(expiry).toISOString(),inputs,provider,
    scope:['editorial','candidates','storyboard-review','preflight'],maxModelTasks:1,allowTts:false,allowRunningHub:false,stopAt:'review'});
}
export function correctionCenterSnapshot(project){return read(path.join(project,'qa/correction-center.json'));}

export function currentApprovedEditorialCorrection(project,runId,approval,now=Date.now()){
  const r=correctionCenterSnapshot(project),a=read(path.join(project,'qa/correction-authorization.json'));
  if(!r?.approved||r.runId!==runId||r.action!=='editorial-repair'||!r.proposal||
    r.approval?.planSha256!==digest(r.proposal)||r.proposal.fingerprint!==r.fingerprint||
    r.proposal.action!=='editorial-repair'||r.proposal.node!==r.node||digest(r.body)!==digest(r.proposal.body)||r.proposal.body?.authorizationNote!==approval||!r.revisionPlan?.requestId||
    digest(r.revisionPlan)!==digest(r.proposal.revisionPlan))return null;
  const feedback=currentEditorialRepairFeedback(project),inputs=identity(project),rules=ruleSnapshot();
  const fingerprint=digest({inputs,rules,node:r.node,feedback:feedback?{proposal:feedback.proposal,failedChecks:feedback.failedChecks}:null,
    shots:sha(path.join(project,'remotion/shots.json')),research:sha(path.join(project,'material-research-plan.json'))});
  if(a?.schema!=='talkcraft-correction-authorization-v1'||a.provider?.provider!=='acctoken'||a.provider?.model!=='deepseek-v4.1-flash'||fingerprint!==r.fingerprint||digest(rules)!==digest(loadedRules)||a?.runId!==runId||
    a.approval!==approval||Date.parse(a.expiresAt)<=now||!a.scope?.includes(r.node)||
    digest(a.inputs)!==digest(inputs)||digest(a.provider)!==digest(editorialProviderBinding(runId)))return null;
  return r;
}

export {CORRECTION_NODE_POLICIES} from './talkcraft-node-correction-plan.mjs';
import {proposeNodeCorrection,CORRECTION_NODE_POLICIES,correctionNode,creativeCode} from './talkcraft-node-correction-plan.mjs';

// Approval binds the node's concrete plan, all current issues and its input
// fingerprint. It never changes business content or marks a gate as passed.
export function approveNodeCorrection(plan,context){
  const {run,fingerprint}=context;
  const policy=CORRECTION_NODE_POLICIES.find(p=>p.node===plan.node);
  const deny=reason=>({...plan,approved:false,action:null,state:'needs-repair',reason});
  if(plan.runId!==run.runId||plan.fingerprint!==fingerprint)return deny('方案不属于本次任务和输入，拒绝跨任务执行');
  if(!plan.action)return {...plan,approved:false};
  if(digest(plan)!==digest(proposeNodeCorrection(context)))return deny('方案与节点当前问题或费用授权不一致，拒绝执行');
  if(!policy||run.activeTask||!run.provenance?.verified)return deny('节点或运行身份不匹配，不能批准执行');
  if(['review','deliver'].includes(plan.node)||['approve-final','deliver'].includes(run.nextStage))return deny('14人工审核不能自动批准');
  const body=plan.body||{};
  const handler=GOVERNANCE_HANDLERS[plan.action];
  if(!handler?.nodes.includes(plan.node)||handler.stage&&handler.stage!==body.stage)
    return deny('方案没有对应正式修正处理器，不执行未知动作');
  const legal=plan.action==='local-recheck'?body.stage===policy.freeStage&&Object.keys(body).every(k=>k==='stage'):
    plan.action==='material-completion'?body.stage==='material-completion'&&Object.keys(body).every(k=>k==='stage')&&
      !!plan.materialCompletionPlan?.needs?.length&&plan.governance?.caseSha256===context.governance?.caseSha256:
    plan.action==='rebuild-sample'?plan.node==='render-all'&&run.nextStage==='sample'&&body.stage==='sample'&&Object.keys(body).every(k=>k==='stage'):
    plan.action==='institution-source-reuse'?plan.node==='candidates'&&body.stage==='institution-source-repair'&&Object.keys(body).every(k=>k==='stage'):
    plan.action==='source-discovery'?plan.node==='candidates'&&body.stage==='material-research'&&Object.keys(body).every(k=>k==='stage'):
    plan.action==='candidate-recheck'?plan.node==='storyboard-review'&&body.stage==='candidates'&&Object.keys(body).every(k=>k==='stage'):
    plan.action==='source-recheck'?plan.node==='candidates'&&body.stage==='candidates'&&Object.keys(body).every(k=>k==='stage'):
    plan.action==='restore-unsubmitted'?body.stage==='editorial-recover'&&body.restoreUnsubmitted===true&&Object.keys(body).every(k=>['stage','restoreUnsubmitted'].includes(k)):
    plan.action==='recover-editorial-response'?plan.node==='editorial'&&body.stage==='editorial-recover'&&Object.keys(body).every(k=>k==='stage'):
    plan.action==='recover-response'?body.stage==='planning-repair'&&body.recoverProviderResponse===true&&Object.keys(body).every(k=>['stage','recoverProviderResponse'].includes(k)):
    plan.action==='editorial-repair'?body.stage==='editorial-revision'&&body.approveModelCost===true&&Object.keys(body).every(k=>['stage','approveModelCost','authorizationNote'].includes(k)):false;
  if(!legal)return deny('方案超出节点修正执行合同，拒绝修改业务值或绕过门禁');
  return {...plan,approved:true,approval:{planSha256:digest(plan),fingerprint,scope:plan.node,stopAt:'review'}};
}
export function planNodeCorrection(context){
  const proposal=proposeNodeCorrection(context);
  return {...approveNodeCorrection(proposal,context),proposal};
}

export function correctionProgressKey({inputs,rules,node,checks=[]}){
  const scope=[...new Set(checks.map(i=>JSON.stringify({code:i.code,shotId:i.shotId,field:i.field,shotIds:i.shotIds})))].sort();
  return digest({inputs,rules,node,checks:scope});
}

export async function dispatchNodeCorrection({project,run,queueStage,now=Date.now()}){
  const previous=correctionCenterSnapshot(project),attempts=previous?.runId===run.runId?previous.attempts||[]:[];
  const feedback=currentEditorialRepairFeedback(project);
  const inputs=identity(project);
  const rules=ruleSnapshot(),rulesVersionVerified=digest(rules)===digest(loadedRules);
  // Exclude timestamps/task IDs: re-reporting the same failure is not progress.
  const fingerprint=digest({inputs,rules,node:correctionNode(run),
    feedback:feedback?{proposal:feedback.proposal,failedChecks:feedback.failedChecks}:null,
    shots:sha(path.join(project,'remotion/shots.json')),research:sha(path.join(project,'material-research-plan.json'))});
  const authorization=read(path.join(project,'qa/correction-authorization.json'));
  const progressKey=correctionProgressKey({inputs,rules,node:correctionNode(run),checks:feedback?.failedChecks||[]});
  const pendingModel=attempts.some(a=>a.fingerprint===fingerprint&&a.action==='local-recheck')&&
    !attempts.some(a=>a.fingerprint===fingerprint&&a.action==='editorial-repair')&&feedback?.failedChecks?.some(i=>creativeCode(i.code)||i.code==='template_window_reuse');
  const provider=rulesVersionVerified&&pendingModel&&Date.parse(authorization?.expiresAt)>now?editorialProviderBinding(run.runId):null;
  const unsubmitted=read(path.join(project,'qa/editorial-revision-authorization.json'));
  const institutionRepair=rulesVersionVerified?proposeInstitutionSourceRepair(project):null;
  let revisionPlan=null,revisionPlanError=null;
  if(provider){
    try{
      const {checkEditorialSelectionInput}=await import('./talkcraft-ark-editorial.mjs');
      revisionPlan=checkEditorialSelectionInput(path.resolve(project,'../../../..'),run.runId);
    }catch(error){revisionPlanError=error.message;}
  }
  const repeatedPaidScope=repeatedPaidRepairScope(project,feedback,revisionPlan);
  let governance,sourcePlan;
  if(rulesVersionVerified&&fs.existsSync(path.join(project,'remotion/shots.json'))){
    const root=path.resolve(project,'../../../..'),index=read(path.join(resolveTalkcraftSkillRoot(root),'references/cards-index.json'));
    const catalog=loadTalkcraftGovernedCatalog(index),map=buildGovernanceMap(root,{index,catalog});
    const review=buildGovernanceCase(project,{run,feedback,rules,map,catalog});
    save(project,'qa/governance-template-map.json',map);save(project,'qa/governance-case.json',review);
    governance={mapSha256:digest(map),caseSha256:digest(review),shotIds:review.shotPlans.map(s=>s.shotId)};
    if(['candidates','storyboard-review','preflight'].includes(correctionNode(run))&&fs.existsSync(path.join(project,'material-research-plan.json')))
      sourcePlan=materialCompletionPlan(project,catalog);
  }
  const decision=planNodeCorrection({run,feedback,attempts,fingerprint,progressKey,inputs,provider,now,authorization,unsubmitted,rulesVersionVerified,institutionRepair,revisionPlan,revisionPlanError,repeatedPaidScope,governance,sourcePlan});
  const record={...decision,attempts,updatedAt:new Date(now).toISOString()};
  if(!decision.action){save(project,'qa/correction-center.json',record);return {handled:false,decision};}
  // Reserve before dispatch, including uncertainty: never duplicate a paid action
  // after process death or an unknown provider result.
  const attempt={action:decision.action,fingerprint,progressKey,...(decision.action==='editorial-repair'?{authorizationSha256:digest(authorization)}:{}),startedAt:new Date(now).toISOString(),status:'dispatching'};
  record.attempts=[...attempts,attempt];record.state='correcting';save(project,'qa/correction-center.json',record);
  try{const task=await queueStage({runId:run.runId,...decision.body});attempt.status='queued';attempt.taskId=task.id;
    save(project,'qa/correction-center.json',record);return {handled:true,decision,task};
  }catch(error){attempt.status='dispatch-failed';attempt.error=String(error.message||error);record.state='needs-repair';record.reason=attempt.error;
    save(project,'qa/correction-center.json',record);return {handled:true,decision:{...decision,state:record.state,reason:record.reason}};}
}
