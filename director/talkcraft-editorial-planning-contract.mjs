import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
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
  return `数值规则取自后端正式校验：前${r.openingWindowSec}秒是按镜头开始时间判定（开始于窗口内的整镜都受限，即使跨过第${r.openingWindowSec}秒），每镜实际≤${r.openingMaxShotSec}秒，原卡完整≤${r.openingMaxOriginalSec}秒；动效实际首尾跨度比须在${r.minMotionRate}～${r.maxMotionRate}，内嵌音视频仍1倍，原生帧与输出帧必须一一对应，不得驻留冻结或偏移；连续${r.reuseWindow}镜不同观点不重复。数字人镜头不得短于${r.minDigitalHumanSec}秒；模板capabilities.hostContext非空时必须安排person，不得用图库演示人物替代。数字人由外层口型轨道与模板分别组合：person不是仅限卡内hostSrc，所有exactPersonWindows都必须逐一安排person。旧草案和失败例子均为待推翻的数据，不是镜头数量、句序边界或选卡的默认骨架。原版创作指南提供风格参考；若例子或旧稿与本次机器数值、精确人物窗口冲突，以当前约束为准。不得用源码演示默认、虚构事实、截断或拉伸口型来凑合。`;
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
    try{
      const timeline=nativeEditorialTimeline(frames,card.duration.frames,Math.min(1,card.duration.frames-2),'仅时长计算；正式驻留须编导按源码指定');
      assertNativeMediaClock(timeline,card.policy?.media,{});
      return [{slug:card.cardId,nativeFrames:card.duration.frames,rate:timeline.filter(s=>s.kind==='motion').map(s=>s.playbackRate),requiresHold:timeline.some(s=>s.kind==='hold')}];
    }catch{return [];}
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
    failedChecks:audit.issues,proposal,createdAt:new Date().toISOString(),
    instruction:'修订必须逐项解决失败，不改变配音、字级时钟及已有人物窗口；不可放宽校验或自动挑第一名。只有新费用授权后才调用模型。'};
  fs.writeFileSync(path.join(project,'qa/editorial-repair-feedback.json'),JSON.stringify(record,null,2));
  return record;
}
export function currentEditorialRepairFeedback(project) {
  // Current node 06 evidence supersedes the earlier node 04 failure list.
  const candidateFile=path.join(project,'qa/candidate-editorial-repair.json');
  if(fs.existsSync(candidateFile)){
    const candidate=JSON.parse(fs.readFileSync(candidateFile,'utf8'));
    if(candidate.schema==='talkcraft-candidate-editorial-repair-v1'&&
      JSON.stringify(candidate.inputs)===JSON.stringify(candidateFeedbackHashes(project)))
      return candidate.passed?null:candidate;
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
      JSON.stringify(record.inputs)===JSON.stringify(candidateFeedbackHashes(snapshot)))
      return record.passed?null:record;
  }
  // A changed 06 plan must never regress to the stale 04 list for the same text.
  if(fs.existsSync(candidateFile)||fs.existsSync(revisionFile))return null;
  const file=path.join(project,'qa/editorial-repair-feedback.json');
  if(!fs.existsSync(file))return null;
  const record=JSON.parse(fs.readFileSync(file,'utf8'));
  return record.schema==='talkcraft-editorial-repair-feedback-v1'&&
    JSON.stringify(record.inputs)===JSON.stringify(inputHashes(project))?record:null;
}

const candidateFeedbackFiles=['input.txt','aligned-sentences.json','audio/full.mp3',
  'semantics.json','remotion/shots.json','material-research-plan.json','material-binding-plan.json'];
const candidateFeedbackHashes=project=>Object.fromEntries(candidateFeedbackFiles.map(name=>{
  const file=path.join(project,name);
  return [name,fs.existsSync(file)?createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null];
}));
export function preserveCandidateMaterialRepairFeedback(project,revision){
  const current=currentEditorialRepairFeedback(project);
  if(current?.schema!=='talkcraft-candidate-editorial-repair-v1')return null;
  const base=path.resolve(project,'qa/storyboard-revisions'),relative=path.relative(base,path.resolve(revision));
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('修订反馈快照必须位于本任务分镜修订目录');
  for(const name of candidateFeedbackFiles){
    const source=path.join(project,name);if(!fs.existsSync(source))continue;
    const target=path.join(revision,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
  }
  const record={...current,snapshot:path.relative(project,revision)};
  fs.writeFileSync(path.join(project,'qa/candidate-editorial-revision-feedback.json'),JSON.stringify(record,null,2));
  return record;
}
export function saveCandidateMaterialRepairFeedback(project,readiness){
  const read=name=>JSON.parse(fs.readFileSync(path.join(project,name),'utf8'));
  const shots=read('remotion/shots.json');
  const failedChecks=readiness.materialIssues||[];
  const record={schema:'talkcraft-candidate-editorial-repair-v1',stage:'candidates',
    inputs:candidateFeedbackHashes(project),passed:readiness.passed===true&&failedChecks.length===0,
    failedChecks,proposal:{shots,sentences:read('semantics.json').sentences,
      materialResearch:fs.existsSync(path.join(project,'material-research-plan.json'))?read('material-research-plan.json'):null},
    repairTargets:[...new Set(failedChecks.map(i=>i.shotId).filter(Boolean))].map(shotId=>{
      const shot=shots.find(s=>s.id===shotId);
      return {shotId,shotCard:shot?.shotCard,firstSentence:shot?.firstSentence,lastSentence:shot?.lastSentence,
        checks:failedChecks.filter(i=>i.shotId===shotId)};
    }),
    instruction:'这是当前06素材准备后的真实失败，替代同输入的旧04失败清单。逐项核对全部108张已审卡的真实资料槽、语义及真实句边界时长，不自动选首名。保留已核验素材、真实字级时间和原口型窗口；不得把缺证据事实改为作者观点，不以搜索候选或背景代替资料。结构通过不代表素材或人审通过。新模型调用仍需单次费用授权。',
    paidCalls:0,userAcceptance:false,createdAt:new Date().toISOString()};
  fs.mkdirSync(path.join(project,'qa'),{recursive:true});
  fs.writeFileSync(path.join(project,'qa/candidate-editorial-repair.json'),JSON.stringify(record,null,2));
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
