import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {recoverBoundEditorialSelectionResponse,inspectBoundEditorialResponse} from './talkcraft-editorial-response.mjs';
import {VISUAL_CONTENT_RULES} from './talkcraft-visual-content-contract.mjs';
import {nativeEditorialTimeline} from './talkcraft-editorial-native-plan.mjs';
import {assertNativeMediaClock} from './talkcraft-native-time-map.mjs';
import {NATIVE_MIN_RATE,NATIVE_MAX_RATE} from './talkcraft-native-time-map.mjs';
import {MIN_DIGITAL_HUMAN_SEC,hostContextForCard} from './talkcraft-host-context.mjs';
import {OPENING_WINDOW_SEC,OPENING_MAX_SHOT_SEC,OPENING_MAX_TEMPLATE_SEC,TEMPLATE_REUSE_WINDOW_SIZE} from './talkcraft-template-governance.mjs';

export const editorialPlanningLimits=()=>({fps:30,openingWindowSec:OPENING_WINDOW_SEC,
  openingMaxShotSec:OPENING_MAX_SHOT_SEC,openingMaxOriginalSec:OPENING_MAX_TEMPLATE_SEC,
  minMotionRate:NATIVE_MIN_RATE,maxMotionRate:NATIVE_MAX_RATE,reuseWindow:TEMPLATE_REUSE_WINDOW_SIZE,minDigitalHumanSec:MIN_DIGITAL_HUMAN_SEC});

export function editorialRuleInstructions(){
  const r=editorialPlanningLimits();
  return VISUAL_CONTENT_RULES+`数值规则取自后端正式校验：前${r.openingWindowSec}秒是按镜头开始时间判定（开始于窗口内的整镜都受限，即使跨过第${r.openingWindowSec}秒），每镜实际≤${r.openingMaxShotSec}秒，原卡完整≤${r.openingMaxOriginalSec}秒；动效实际首尾跨度比须在${r.minMotionRate}～${r.maxMotionRate}，内嵌音视频仍1倍，原生帧与输出帧必须一一对应，不得驻留冻结或偏移；连续${r.reuseWindow}镜不同观点不重复。数字人镜头不得短于${r.minDigitalHumanSec}秒；模板capabilities.hostContext非空时必须安排person，不得用图库演示人物替代。数字人由外层口型轨道与模板分别组合：person不是仅限卡内hostSrc，所有exactPersonWindows都必须逐一安排person。旧草案和失败例子均为待推翻的数据，不是镜头数量、句序边界或选卡的默认骨架。原版创作指南提供风格参考；若例子或旧稿与本次机器数值、精确人物窗口冲突，以当前约束为准。不得用源码演示默认、虚构事实、截断或拉伸口型来凑合。`;
}

// Use the very same compiler as proposal validation, including integer-frame rounding.
export function editorialRangeFeasibility({firstSentence,lastSentence,aligned,catalog,personWindows=[]}){
  const start=aligned[firstSentence].start,end=aligned[lastSentence].end,frames=Math.round(end*30)-Math.round(start*30);
  const overlaps=personWindows.filter(w=>firstSentence<=w.lastSentence&&lastSentence>=w.firstSentence);
  const person=overlaps.length===1&&overlaps[0].firstSentence===firstSentence&&overlaps[0].lastSentence===lastSentence;
  if(overlaps.length&&!person)return {firstSentence,lastSentence,start,end,frames,cards:[],reason:'跨越已生成口型边界'};
  if(person&&end-start<MIN_DIGITAL_HUMAN_SEC-1e-9)return {firstSentence,lastSentence,start,end,frames,cards:[],reason:`人物镜头短于${MIN_DIGITAL_HUMAN_SEC}秒`};
  const opening=start<OPENING_WINDOW_SEC;
  const cards=catalog.cards.flatMap(card=>{
    if(opening&&(end-start>OPENING_MAX_SHOT_SEC+1e-9||card.duration.originalFrames/card.duration.fps>OPENING_MAX_TEMPLATE_SEC||person&&end-start<MIN_DIGITAL_HUMAN_SEC))return [];
    if(!person&&hostContextForCard(card.cardId))return [];
    // Try the default first, then the already-approved slowest motion rate.
    // These are feasibility examples, never changes to the proposed shot.
    for(const requestedPlaybackRate of [undefined,NATIVE_MIN_RATE])try{
      const timeline=nativeEditorialTimeline(frames,card.duration.frames,Math.min(1,card.duration.frames-2),'仅时长计算；正式驻留须编导按源码指定',requestedPlaybackRate);
      assertNativeMediaClock(timeline,card.policy?.media,{});
      return [{slug:card.cardId,nativeFrames:card.duration.frames,rate:timeline.filter(s=>s.kind==='motion').map(s=>s.playbackRate),
        ...(requestedPlaybackRate===undefined?{}:{requestedPlaybackRate}),requiresHold:timeline.some(s=>s.kind==='hold')}];
    }catch{}
    return [];
  });
  return {firstSentence,lastSentence,start,end,frames,requiredSubject:person?'person':'other',cards};
}

export function editorialInputReadiness({aligned,catalog,personWindows=[]}){
  const reachable=new Set([0]);
  const invalidWindows=personWindows.some(w=>!Number.isInteger(w.firstSentence)||!Number.isInteger(w.lastSentence)||
    w.firstSentence<0||w.lastSentence<w.firstSentence||w.lastSentence>=aligned.length||
    Math.abs(aligned[w.firstSentence].start-w.start)>1e-6||Math.abs(aligned[w.lastSentence].end-w.end)>1e-6)||
    personWindows.some((w,i)=>personWindows.slice(i+1).some(v=>w.firstSentence<=v.lastSentence&&w.lastSentence>=v.firstSentence));
  const timingValid=aligned.length>0&&aligned[0].start===0&&aligned.every((s,i)=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start&&(!i||s.start>=aligned[i-1].end));
  if(!invalidWindows&&timingValid)for(let first=0;first<aligned.length;first++){
    if(!reachable.has(first))continue;
    for(let last=first;last<aligned.length;last++)if(editorialRangeFeasibility({firstSentence:first,lastSentence:last,aligned,catalog,personWindows}).cards.length)reachable.add(last+1);
  }
  return {passed:!invalidWindows&&timingValid&&reachable.has(aligned.length),invalidWindows,timingValid,
    furthestCoveredSentence:Math.max(...reachable)-1,
    scope:'仅证明真实句边界、开场时长、动效帧映射与复用人物窗口有可行路径；不选卡，不证明语义、30镜去重、参数、素材或视觉通过'};
}

// Existing successful footage is an input contract, never a request to generate again.
export function reusedEditorialWindows(project,aligned) {
  const file=path.join(project,'qa/rebuild-inputs.json');
  if(!fs.existsSync(file))return [];
  const input=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Array.isArray(input.personWindows))throw Error('复用输入缺少人物区间数组，不能猜测口型范围');
  return input.personWindows.map(w=>{
    const firstSentence=aligned.findIndex(s=>Math.abs(s.start-w.start)<1e-6);
    const lastSentence=aligned.findIndex(s=>Math.abs(s.end-w.end)<1e-6);
    if(!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.end<=w.start||firstSentence<0||lastSentence<firstSentence)
      throw Error('复用人物区间无法对应原配音的完整句序');
    return {...w,firstSentence,lastSentence};
  });
}

export function auditEditorialReuse(shots,aligned,windows) {
  const issues=[],people=(shots||[]).filter(s=>s.subject==='person');
  for(const s of people){
    if(!windows.some(w=>s.firstSentence===w.firstSentence&&s.lastSentence===w.lastSentence))
      issues.push({code:'REUSED_PERSON_RANGE',shotId:s.id,message:`${s.id} 人物句序 ${s.firstSentence}–${s.lastSentence} 不对应已生成口型的精确窗口，必须重排分镜，禁止挪用或拉伸口型`});
  }
  for(const w of windows){
    const matches=people.filter(s=>s.firstSentence===w.firstSentence&&s.lastSentence===w.lastSentence);
    if(matches.length!==1)issues.push({code:'REUSED_PERSON_WINDOW_COVERAGE',message:`已有人物窗口 ${w.start}–${w.end} 秒必须恰好安排一镜 person，当前 ${matches.length} 镜`,firstSentence:w.firstSentence,lastSentence:w.lastSentence});
  }
  return issues;
}

const inputHashes=project=>Object.fromEntries(['input.txt','aligned-sentences.json'].map(name=>
  [name,createHash('sha256').update(fs.readFileSync(path.join(project,name))).digest('hex')]));
export function saveEditorialRepairFeedback(project,proposal,audit) {
  const record={schema:'talkcraft-editorial-repair-feedback-v1',inputs:inputHashes(project),
    proposalInputs:proposalInputHashes(project),responseSha256:fileHash(project,'qa/ark-editorial-response.json'),
    failedChecks:audit.issues,proposal,createdAt:new Date().toISOString(),
    instruction:'修订必须逐项解决失败，不改变配音、字级时钟及已有人物窗口；不可放宽校验或自动挑第一名。只有新费用授权后才调用模型。'};
  fs.writeFileSync(path.join(project,'qa/editorial-repair-feedback.json'),JSON.stringify(record,null,2));
  return record;
}
const fileHash=(project,name)=>fs.existsSync(path.join(project,name))?
  createHash('sha256').update(fs.readFileSync(path.join(project,name))).digest('hex'):null;
const proposalInputHashes=project=>Object.fromEntries(['input.txt','aligned-sentences.json','audio/full.mp3','semantics.json'].map(n=>[n,fileHash(project,n)]));
export function currentRejectedEditorialFeedback(project){
  if(fs.existsSync(path.join(project,'remotion/shots.json'))||fs.existsSync(path.join(project,'SHOTBOOK.md')))return null;
  return verifiedEditorialFeedback(project);
}
function verifiedEditorialFeedback(project){
  try{
    const record=JSON.parse(fs.readFileSync(path.join(project,'qa/editorial-repair-feedback.json'),'utf8'));
    return record.schema==='talkcraft-editorial-repair-feedback-v1'&&record.failedChecks?.length&&record.responseSha256&&
      record.responseSha256===fileHash(project,'qa/ark-editorial-response.json')&&
      JSON.stringify(record.proposalInputs)===JSON.stringify(proposalInputHashes(project))&&
      JSON.stringify(record.proposal)===JSON.stringify(JSON.parse(fs.readFileSync(path.join(project,'qa/ark-editorial-response.json'),'utf8')))?record:null;
  }catch{return null;}
}
export function preserveRejectedEditorialFeedback(project,revision){
  // A failed recheck of an installed storyboard is still the latest 04
  // failure. Preserve it before preparation removes the installed artifacts.
  const record=verifiedEditorialFeedback(project);if(!record)return null;
  const base=path.resolve(project,'qa/storyboard-revisions'),relative=path.relative(base,path.resolve(revision));
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('修订反馈快照必须位于本任务分镜修订目录');
  for(const name of Object.keys(record.proposalInputs)){
    const source=path.join(project,name);if(!fs.existsSync(source))continue;
    const target=path.join(revision,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
  }
  const saved={...record,snapshot:path.relative(project,revision)};
  fs.writeFileSync(path.join(project,'qa/editorial-revision-feedback.json'),JSON.stringify(saved,null,2));return saved;
}
export const editorialRepairScopeSha256=feedback=>createHash('sha256')
  .update(JSON.stringify({proposal:feedback?.proposal,failedChecks:feedback?.failedChecks})).digest('hex');
function archivedRejectedFeedback(project){
  try{
    const record=JSON.parse(fs.readFileSync(path.join(project,'qa/editorial-revision-feedback.json'),'utf8'));
    const base=path.resolve(project,'qa/storyboard-revisions'),snapshot=path.resolve(project,record.snapshot||'.'),rel=path.relative(base,snapshot);
    if(!rel||rel.startsWith('..')||path.isAbsolute(rel)||record.schema!=='talkcraft-editorial-repair-feedback-v1'||!record.failedChecks?.length)return null;
    if(['input.txt','aligned-sentences.json','audio/full.mp3'].some(n=>record.proposalInputs?.[n]!==fileHash(project,n)))return null;
    if(JSON.stringify(record.proposalInputs)!==JSON.stringify(proposalInputHashes(snapshot))||
      record.responseSha256!==fileHash(snapshot,'qa/ark-editorial-response.json'))return null;
    return record;
  }catch{return null;}
}
// Prefer the latest rejected transaction, not the older installed storyboard.
// This selects evidence only; it does not publish the retained proposal.
function retainedRejectedNodeFeedback(project,work,j,a){
  if(a.schema!=='talkcraft-editorial-selection-audit-v1'||a.compiled!==false||a.passed!==false||a.productionAdmitted!==false)return null;
  const read=n=>JSON.parse(fs.readFileSync(path.join(work,n),'utf8'));
  const request=read('qa/editorial-selection-request.json'),cache=read('qa/ark-editorial-response.json');
  const {editorialSelectionRejection,...base}=cache,verified=verifiedEditorialFeedback(work);
  const expected='分镜提案预检未通过：'+(a.issues||[]).map(i=>`[${i.code}] ${i.message}`).join('；');
  if(!verified||a.requestId!==request.requestId||!isDeepStrictEqual(editorialSelectionRejection,a)||
    !isDeepStrictEqual(base,request.baseProposal)||!isDeepStrictEqual(verified.failedChecks,a.issues)||j.error!==expected||
    !a.issues?.length||a.issues.some(i=>!i.shotId||!base.shots?.some(s=>s.id===i.shotId)))
    throw Error('本次未编译补全失败证据与请求不一致');
  for(const n of ['input.txt','aligned-sentences.json','audio/full.mp3','semantics.json','remotion/shots.json','material-research-plan.json','material-binding-plan.json','qa/ark-editorial-response.json'])
    if(fileHash(project,n)!==(j.initial?.[n]??null))throw Error('正式输入变化，不能沿用当前拒绝结果：'+n);
  if(fileHash(project,'qa/editorial-single-submission.json')!==fileHash(work,'qa/editorial-single-submission.json'))throw Error('拒绝结果不是当前提交');
  const relative=String(a.rawResponse||'').replaceAll('\\','/');
  if(!/^qa\/editorial-provider-responses\/[\dTZ-]+\.json$/u.test(relative))throw Error('本次拒绝原始结果路径不合法');
  const raw=path.join(work,relative);
  if(fs.lstatSync(raw).isSymbolicLink()||!isDeepStrictEqual(recoverBoundEditorialSelectionResponse(work,{runId:j.runId,request}),read(relative)))
    throw Error('本次拒绝原始结果与回执不一致');
  return {schema:'talkcraft-candidate-editorial-repair-v1',stage:'planning-check',sourceGate:'selection-compile',passed:false,
    inputs:candidateFeedbackHashes(project,'planning-check'),proposal:base,failedChecks:structuredClone(a.issues),
    retainedTransaction:j.directory,requestId:request.requestId,paidCalls:0,userAcceptance:false};
}
// A transport timeout has no new design to recover. Preserve only the exact
// verified base and failure scope that were authorized for THIS submission.
// This never invents a provider result, publishes data or renews authorization.
function retainedTransportBaseFeedback(project,work,j){
 const read=n=>JSON.parse(fs.readFileSync(path.join(work,n),'utf8'));
 const required=['qa/editorial-selection-request.json','qa/editorial-single-submission.json','qa/editorial-revision-authorization.json','qa/planning-editorial-repair.json'];
 if(required.some(n=>!fs.existsSync(path.join(work,n)))||fs.existsSync(path.join(work,'qa/ark-editorial-response.json')))return null;
 if(fs.realpathSync(work)!==work)throw Error('超时事务工作区不能是链接');
 const submission=read(required[1]);
 const hasReceipt=fs.existsSync(path.join(work,'qa/editorial-provider-receipt.json'));
 if(submission.outcome!==(hasReceipt?'provider-response-invalid':'provider-outcome-unconfirmed')||!submission.submittedAt||!submission.finishedAt)return null;
 const request=read(required[0]),authorization=read(required[2]),feedback=read(required[3]);
 const {requestId,...contract}=request;
 if(contract.schema!=='talkcraft-editorial-selection-request-v2'||requestId!==createHash('sha256').update(JSON.stringify(contract)).digest('hex')||
   authorization.schema!=='talkcraft-editorial-revision-authorization-v1'||authorization.runId!==j.runId||authorization.node!==j.node||
   !authorization.startedAt||authorization.completedAt||authorization.providerBinding?.provider!=='acctoken'||
   ['input.txt','aligned-sentences.json','audio/full.mp3','semantics.json','remotion/shots.json','material-research-plan.json','material-binding-plan.json','qa/ark-editorial-response.json'].some(n=>!Object.hasOwn(authorization.inputs||{},n))||
   submission.attempts?.length!==1||submission.attempts[0].targetFingerprint!==authorization.providerBinding.targetFingerprint||
   !isDeepStrictEqual(submission.targetFingerprints,[authorization.providerBinding.targetFingerprint])||
   feedback.schema!=='talkcraft-candidate-editorial-repair-v1'||feedback.stage!=='planning-check'||feedback.passed!==false||
   !feedback.failedChecks?.length||!isDeepStrictEqual(feedback.proposal,request.baseProposal)||
   !isDeepStrictEqual(feedback.failedChecks,request.failedChecks)||authorization.repairScopeSha256!==editorialRepairScopeSha256(feedback)||
   feedback.failedChecks.some(i=>!i.shotId||!(request.batch?.pendingShotIds||request.editableShotIds)?.includes(i.shotId)||!feedback.proposal.shots?.some(s=>s.id===i.shotId)))
  throw Error('当前超时提交的基稿、失败范围或授权不一致');
 if(hasReceipt){
  const evidence=inspectBoundEditorialResponse(work,{runId:j.runId,request});
  if(evidence.httpStatus!==200||evidence.provider!=='acctoken'||evidence.status!=='incomplete'||evidence.reason!=='max_output_tokens')
   return null;
 }
 if(fileHash(project,'qa/editorial-single-submission.json')!==fileHash(work,'qa/editorial-single-submission.json'))throw Error('超时记录不是当前正式提交');
 const authName='qa/editorial-revision-authorization.json',oldAuthHash=fileHash(work,authName);
 if(oldAuthHash!==j.initial?.[authName])throw Error('超时授权记录已变化');
 if(fileHash(project,authName)!==oldAuthHash){
  // authorizeEditorialRevision archives the consumed authorization BEFORE the
  // worker starts. Accept only that exact archive plus an unused same-scope
  // authorization; otherwise renewal itself would invalidate its own base.
  const archive='qa/editorial-revision-authorization-history/'+oldAuthHash+'.json';
  const current=JSON.parse(fs.readFileSync(path.join(project,authName),'utf8'));
  if(fileHash(project,archive)!==oldAuthHash||fs.lstatSync(path.join(project,archive)).isSymbolicLink()||
    current.schema!==authorization.schema||current.runId!==j.runId||current.node!==j.node||current.maxTasks!==1||current.startedAt||current.completedAt||
    current.repairScopeSha256!==authorization.repairScopeSha256||!isDeepStrictEqual(current.providerBinding,authorization.providerBinding)||
    !current.inputs||Object.keys(current.inputs).length!==Object.keys(authorization.inputs).length||
    Object.entries(current.inputs).some(([n,expected])=>!Object.hasOwn(authorization.inputs,n)||fileHash(project,n)!==expected))
   throw Error('新的未提交授权与本次超时基稿或原授权归档不一致');
 }
 for(const [n,expected]of Object.entries(authorization.inputs)){
  if(n==='qa/editorial-single-submission.json')continue; // exact current reservation checked above
  if(fileHash(project,n)!==expected||(j.initial?.[n]??null)!==expected)throw Error('超时后正式输入变化，不能恢复基稿：'+n);
 }
 if(!isDeepStrictEqual(submission.inputs,inputHashes(project)))throw Error('超时提交的稿件或时间轴变化');
 return {schema:'talkcraft-candidate-editorial-repair-v1',stage:'planning-check',sourceGate:'provider-transport',passed:false,
  inputs:candidateFeedbackHashes(project,'planning-check'),proposal:structuredClone(request.baseProposal),failedChecks:structuredClone(feedback.failedChecks),
  retainedTransaction:j.directory,requestId,providerOutcomeUnknown:!hasReceipt,
  ...(hasReceipt?{responseIncomplete:true,incompleteReason:'max_output_tokens'}:{}),paidCalls:0,userAcceptance:false};
}
function retainedNodeEditorialFeedback(project){
  const journalFile=path.join(project,'qa/node-repair.json');
  if(!fs.existsSync(journalFile))return null;
  const read=n=>JSON.parse(fs.readFileSync(n,'utf8')),j=read(journalFile);
  if(j.schema!=='talkcraft-node-repair-v1'||j.status!=='blocked'||j.node!=='storyboard-review'||!j.providerSubmitted)return null;
  const directory=path.resolve(project,j.directory),base=path.resolve(project,'qa/node-repairs'),rel=path.relative(base,directory);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('当前补全事务目录越界');
  const work=path.join(directory,'work'),reportFile=path.join(work,'qa/editorial-free-selection-replay.json');
  const auditFile=path.join(work,'qa/editorial-selection-audit.json');
  if(!fs.existsSync(auditFile))return retainedTransportBaseFeedback(project,work,j);
  const a=read(auditFile);
  if(a.compiled===false)return retainedRejectedNodeFeedback(project,work,j,a);
  // A paid response already has the same hash-bound successful compiler audit.
  // It need not run a second, nominally free replay just to retain its design.
  // This is a read-only evidence projection, not a fabricated replay artifact.
  const directCompiled=!fs.existsSync(reportFile)&&a.passed===true&&a.compiled===true&&typeof a.rawResponse==='string';
  if(!fs.existsSync(reportFile)&&!directCompiled)return null;
  const r=directCompiled?{runId:j.runId,requestId:a.requestId,passed:true,externalRequests:0,
    productionAdmitted:false,rawResponse:a.rawResponse.replaceAll('\\','/')}:read(reportFile);
  if(a.compiled!==true)return null;
  // A free compile may succeed while the subsequent candidate/native gates
  // fail. Keep that exact compiled proposal and its hash-bound full feedback.
  let checks=r.issues;
  let feedbackStage='planning-check',expectedError;
  if(r.passed===true){
    // Candidates may stop before planning-check runs. Select only the report
    // matching both current files and the exact current journal error.
    let selected;
    for(const [stage,name]of [['planning-check','planning-editorial-repair'],['candidates','candidate-editorial-repair']]){
      const file=path.join(work,'qa/'+name+'.json');if(!fs.existsSync(file))continue;
      const record=read(file);
      if(record.schema!=='talkcraft-candidate-editorial-repair-v1'||record.stage!==stage||record.passed!==false||
        !Array.isArray(record.failedChecks)||!isDeepStrictEqual(record.inputs,candidateFeedbackHashes(work,stage)))continue;
      const message=stage==='candidates'?'选卡前真实素材规划未完成：'+record.failedChecks.map(i=>`${i.shotId||'全片'} ${i.code}${i.message?'：'+i.message:''}`).join('；'):
        record.failedChecks.map(i=>i.message).join('；');
      const wrapper=stage==='planning-check'&&[
        '当前节点文字和素材补全复检未通过；已保留结果，不自动追加模型调用',
        '恢复结果未通过本节点规划复检，不发布'].includes(j.error);
      if(j.error===message||wrapper){selected={record,stage,message:j.error};break;}
    }
    if(!selected)throw Error('本次候选复检反馈已过期或被篡改');
    checks=selected.record.failedChecks;feedbackStage=selected.stage;expectedError=selected.message;
  }else if(r.passed!==false)return null;
  const hash=f=>fs.existsSync(f)?createHash('sha256').update(fs.readFileSync(f)).digest('hex'):null;
  for(const n of ['input.txt','aligned-sentences.json','audio/full.mp3','semantics.json','remotion/shots.json','material-research-plan.json','material-binding-plan.json','qa/ark-editorial-response.json'])
    if(hash(path.join(project,n))!==(j.initial?.[n]??null))throw Error('正式输入变化，不能沿用当前补全结果：'+n);
  if(hash(path.join(project,'qa/editorial-single-submission.json'))!==hash(path.join(work,'qa/editorial-single-submission.json')))
    throw Error('补全结果不是当前提交');
  const request=read(path.join(work,'qa/editorial-selection-request.json')),proposal=read(path.join(work,'qa/ark-editorial-response.json'));
  if(fs.realpathSync(work)!==work||r.runId!==j.runId||r.requestId!==request.requestId||a.requestId!==request.requestId||
    r.externalRequests!==0||r.productionAdmitted!==false||a.productionAdmitted!==false||
    a.compiledSha256!==createHash('sha256').update(JSON.stringify(proposal)).digest('hex')||
    !Array.isArray(checks)||!checks.length||j.error!==(expectedError??checks.map(i=>i.message).join('；'))||
    checks.some(i=>!i.shotId||!proposal.shots?.some(s=>s.id===i.shotId)))throw Error('当前补全失败证据与编译基稿不一致');
  if(!/^qa\/editorial-provider-responses\/[\dTZ-]+\.json$/u.test(r.rawResponse||''))throw Error('补全原始结果路径不合法');
  const raw=path.join(work,r.rawResponse);
  if(fs.lstatSync(raw).isSymbolicLink()||!isDeepStrictEqual(recoverBoundEditorialSelectionResponse(work,{runId:j.runId,request}),read(raw)))
    throw Error('补全原始结果与当前回执不一致');
  return {schema:'talkcraft-candidate-editorial-repair-v1',stage:'planning-check',sourceGate:feedbackStage,passed:false,
    inputs:candidateFeedbackHashes(project,'planning-check'),proposal,failedChecks:checks,
    retainedTransaction:j.directory,requestId:request.requestId,paidCalls:0,userAcceptance:false};
}
export function currentEditorialRepairFeedback(project,{candidateSnapshotOnly=false}={}) {
  const retained=retainedNodeEditorialFeedback(project);if(retained)return retained;
  if(!candidateSnapshotOnly){
    try{
      const completion=JSON.parse(fs.readFileSync(path.join(project,'qa/editorial-completion.json'),'utf8'));
      const file=path.join(project,'qa/editorial-repair-feedback.json');
      if(completion.schema==='talkcraft-editorial-completion-v1'&&completion.passed===false&&fs.existsSync(file)){
        const record=JSON.parse(fs.readFileSync(file,'utf8'));
        if(record.schema==='talkcraft-editorial-repair-feedback-v1'&&record.failedChecks?.length&&
          JSON.stringify(record.inputs)===JSON.stringify(inputHashes(project)))return verifiedEditorialFeedback(project);
      }
    }catch{}
  }
  // After preparation, the explicit active authorization identifies which
  // archive owns this revision. A current 04 rejection must not pick an older
  // 06 snapshot; a current 07 repair must not pick an older 04 archive either.
  if(!candidateSnapshotOnly&&!fs.existsSync(path.join(project,'remotion/shots.json'))&&
    !fs.existsSync(path.join(project,'qa/ark-editorial-response.json'))){
    try{
      const authorization=JSON.parse(fs.readFileSync(path.join(project,'qa/editorial-revision-authorization.json'),'utf8'));
      if(authorization.schema==='talkcraft-editorial-revision-authorization-v1'&&authorization.node==='editorial'&&authorization.startedAt&&
        (authorization.feedbackStage==='editorial'||!authorization.feedbackStage&&fs.existsSync(path.join(project,'qa/editorial-revision-feedback.json')))){
        const archived=archivedRejectedFeedback(project);
        return archived&&editorialRepairScopeSha256(archived)===authorization.repairScopeSha256?archived:null;
      }
    }catch{}
  }
  // Current node 06 evidence supersedes the earlier node 04 failure list.
  const preflightFile=path.join(project,'qa/preflight-editorial-repair.json');
  if(fs.existsSync(preflightFile)){
    const latest=JSON.parse(fs.readFileSync(preflightFile,'utf8'));
    if(latest.schema==='talkcraft-candidate-editorial-repair-v1'&&latest.stage==='preflight'&&
      JSON.stringify(latest.inputs)===JSON.stringify(candidateFeedbackHashes(project,'preflight')))
      return latest.passed?null:latest;
  }
  const planningFile=path.join(project,'qa/planning-editorial-repair.json');
  if(fs.existsSync(planningFile)){
    const planning=JSON.parse(fs.readFileSync(planningFile,'utf8'));
    if(planning.schema==='talkcraft-candidate-editorial-repair-v1'&&planning.stage==='planning-check'&&
      JSON.stringify(planning.inputs)===JSON.stringify(candidateFeedbackHashes(project,'planning-check')))
      return planning.passed?null:planning;
  }
  const candidateFile=path.join(project,'qa/candidate-editorial-repair.json');
  if(fs.existsSync(candidateFile)){
    const candidate=JSON.parse(fs.readFileSync(candidateFile,'utf8'));
    if(candidate.schema==='talkcraft-candidate-editorial-repair-v1'&&
      JSON.stringify(candidate.inputs)===JSON.stringify(candidateFeedbackHashes(project)))
      return candidate.passed?null:candidate;
  }
  if(!candidateSnapshotOnly&&!fs.existsSync(path.join(project,'remotion/shots.json'))){
    // A new rejected result must supersede the archived 06 list; stale or
    // edited response evidence must not silently fall back to older failures.
    if(fs.existsSync(path.join(project,'qa/ark-editorial-response.json')))return currentRejectedEditorialFeedback(project);
  }
  // The existing revision preparation archives shot-dependent inputs. Accept
  // its verified snapshot only before a new storyboard has been installed.
  const revisionFile=path.join(project,'qa/candidate-editorial-revision-feedback.json');
  if(!fs.existsSync(path.join(project,'remotion/shots.json'))&&fs.existsSync(revisionFile)){
    const record=JSON.parse(fs.readFileSync(revisionFile,'utf8'));
    const base=path.resolve(project,'qa/storyboard-revisions');
    const snapshot=path.resolve(project,record.snapshot||'.'),relative=path.relative(base,snapshot);
    if(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&
      record.schema==='talkcraft-candidate-editorial-repair-v1'&&
      ['input.txt','aligned-sentences.json','audio/full.mp3'].every(name=>record.inputs?.[name]===candidateFeedbackHashes(project)[name])&&
      JSON.stringify(record.inputs)===JSON.stringify(candidateFeedbackHashes(snapshot,record.stage)))
      return record.passed?null:record;
  }
  if(candidateSnapshotOnly)return null;
  // A changed 06 plan must never regress to the stale 04 list for the same text.
  if(fs.existsSync(preflightFile)||fs.existsSync(planningFile)||fs.existsSync(candidateFile)||fs.existsSync(revisionFile))return null;
  if(!fs.existsSync(path.join(project,'remotion/shots.json'))&&
    fs.existsSync(path.join(project,'qa/editorial-revision-feedback.json')))return archivedRejectedFeedback(project);
  const file=path.join(project,'qa/editorial-repair-feedback.json');
  if(!fs.existsSync(file))return null;
  const record=JSON.parse(fs.readFileSync(file,'utf8'));
  return record.schema==='talkcraft-editorial-repair-feedback-v1'&&
    JSON.stringify(record.inputs)===JSON.stringify(inputHashes(project))?record:null;
}

const candidateFeedbackFiles=['input.txt','aligned-sentences.json','audio/full.mp3',
  'semantics.json','remotion/shots.json','material-research-plan.json','material-binding-plan.json'];
const planningFeedbackFiles=['remotion/native-presentation.json','remotion/word-reveal-plan.json','qa/ark-editorial-response.json'];
const candidateFeedbackHashes=(project,stage)=>Object.fromEntries([...candidateFeedbackFiles,...(['planning-check','preflight'].includes(stage)?planningFeedbackFiles:[])].map(name=>{
  const file=path.join(project,name);
  return [name,fs.existsSync(file)?createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null];
}));
export function preserveCandidateMaterialRepairFeedback(project,revision){
  const current=currentEditorialRepairFeedback(project,{candidateSnapshotOnly:true});
  if(current?.schema!=='talkcraft-candidate-editorial-repair-v1')return null;
  if(current.snapshot)return current; // Keep the original complete verified snapshot.
  const base=path.resolve(project,'qa/storyboard-revisions'),relative=path.relative(base,path.resolve(revision));
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('修订反馈快照必须位于本任务分镜修订目录');
  for(const name of Object.keys(current.inputs)){
    const source=path.join(project,name);if(!fs.existsSync(source))continue;
    const target=path.join(revision,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
  }
  const record={...current,snapshot:path.relative(project,revision)};
  fs.writeFileSync(path.join(project,'qa/candidate-editorial-revision-feedback.json'),JSON.stringify(record,null,2));
  return record;
}
export function saveCandidateMaterialRepairFeedback(project,readiness){return saveStageRepairFeedback(project,readiness,'candidates');}
export function savePlanningEditorialRepairFeedback(project,{passed,issues,stage='planning-check'}){
  if(!['planning-check','preflight'].includes(stage))throw Error('非法节点复检反馈');
  return saveStageRepairFeedback(project,{passed,materialIssues:issues},stage);
}
function saveStageRepairFeedback(project,readiness,stage){
  const read=name=>JSON.parse(fs.readFileSync(path.join(project,name),'utf8'));
  const shots=read('remotion/shots.json');
  const responseFile=path.join(project,'qa/ark-editorial-response.json');
  const response=fs.existsSync(responseFile)?read('qa/ark-editorial-response.json'):null;
  if(response)for(const shot of shots){
    const native=response.shots?.find(s=>s.id===shot.id&&s.shotCard===shot.shotCard&&s.firstSentence===shot.firstSentence&&s.lastSentence===shot.lastSentence)?.nativePresentation;
    if(native)shot.nativePresentation=structuredClone(native);
  }
  const failedChecks=readiness.materialIssues||[];
  const record={schema:'talkcraft-candidate-editorial-repair-v1',stage,
    inputs:candidateFeedbackHashes(project,stage),passed:readiness.passed===true&&failedChecks.length===0,
    failedChecks,proposal:{shots,sentences:read('semantics.json').sentences,
      ...(response?.captionEmphasis?{captionEmphasis:response.captionEmphasis}:{}),
      materialResearch:fs.existsSync(path.join(project,'material-research-plan.json'))?read('material-research-plan.json'):null},
    repairTargets:[...new Set(failedChecks.map(i=>i.shotId).filter(Boolean))].map(shotId=>{
      const shot=shots.find(s=>s.id===shotId);
      return {shotId,shotCard:shot?.shotCard,firstSentence:shot?.firstSentence,lastSentence:shot?.lastSentence,
        checks:failedChecks.filter(i=>i.shotId===shotId)};
    }),
    instruction:`这是当前${stage==='preflight'?'09全量复检':stage==='planning-check'?'07分镜规划':'06素材准备'}后的真实失败，替代同输入的旧阶段失败清单。逐项核对全部108张已审卡的真实资料槽、语义及真实句边界时长，不自动选首名。保留已核验素材、真实字级时间和原口型窗口；不得把缺证据事实改为作者观点，不以搜索候选或背景代替资料。结构通过不代表素材或人审通过。新模型调用仍需单次费用授权。`,
    paidCalls:0,userAcceptance:false,createdAt:new Date().toISOString()};
  fs.mkdirSync(path.join(project,'qa'),{recursive:true});
  fs.writeFileSync(path.join(project,stage==='preflight'?'qa/preflight-editorial-repair.json':stage==='planning-check'?'qa/planning-editorial-repair.json':'qa/candidate-editorial-repair.json'),JSON.stringify(record,null,2));
  return record;
}

// Feasibility is physics only. It neither ranks semantics nor chooses a card.
export function buildEditorialPlanningContract({aligned,catalog,personWindows=[],previousShots=[]}) {
  const ranges=[];
  for(let first=0;first<aligned.length&&aligned[first].start<OPENING_WINDOW_SEC;first++){
    for(let last=first;last<aligned.length;last++){
      if(aligned[last].end-aligned[first].start>OPENING_MAX_SHOT_SEC+1e-9)break;
      ranges.push({firstSentence:first,lastSentence:last,kind:'opening'});
    }
  }
  ranges.push(...personWindows.map(w=>({firstSentence:w.firstSentence,lastSentence:w.lastSentence,kind:'reused-person'})));
  ranges.push(...previousShots.filter(s=>Number.isInteger(s.firstSentence)&&Number.isInteger(s.lastSentence)&&s.firstSentence>=0&&s.lastSentence>=s.firstSentence&&s.lastSentence<aligned.length)
    .map(s=>({firstSentence:s.firstSentence,lastSentence:s.lastSentence,kind:'rejected-draft-comparison',shotId:s.id})));
  const windows=ranges.map(r=>{
    const start=aligned[r.firstSentence].start,end=aligned[r.lastSentence].end;
    const frames=Math.round(end*30)-Math.round(start*30);
    const feasible=editorialRangeFeasibility({...r,aligned,catalog,personWindows});
    return {...r,...feasible,start,end,frames};
  });
  return {schema:'talkcraft-editorial-planning-contract-v1',fps:30,reviewedCount:catalog.cards.length,
    limits:editorialPlanningLimits(),readiness:editorialInputReadiness({aligned,catalog,personWindows}),
    exactPersonWindows:personWindows,windows,
    timingDomains:catalog.cards.map(c=>{
      const embeddedMediaRateLocked=Object.values(c.policy?.media||{}).some(v=>/audio|video/iu.test(String(v)));
      return {slug:c.cardId,nativeFrames:c.duration.frames,
        maxHoldAtNativeFrame:c.duration.frames-2,maxExtraHoldFrames:embeddedMediaRateLocked?0:60,maxExtraHoldFraction:embeddedMediaRateLocked?0:0.5,
        minimumOutputFrames:embeddedMediaRateLocked?c.duration.frames:Math.ceil((c.duration.frames-1)/NATIVE_MAX_RATE-1e-10)+1,
        ...(embeddedMediaRateLocked?{requiredOutputFrames:c.duration.frames}:{}),embeddedMediaRateLocked};}),
    rules:'全部已审目录均可比较。cards仅说明真实句边界下的时长可行性，不是语义推荐、不是选卡白名单，不自动选第一名。开场从这些连续自然句范围规划覆盖前8秒；完整原卡≤3秒、镜头≤3.4秒。没有可行卡的范围可在真实句边界合并或拆分，不能编造时间。人物只能且必须逐一使用exactPersonWindows，不能跨入前后句。各30镜窗口自行检查已用卡，不同观点必须换卡；同观点承接仍须具体证据。requiresHold不证明主体可见，正式驻留必须依据源码。',
    productionAdmitted:false,userAcceptance:false};
}
