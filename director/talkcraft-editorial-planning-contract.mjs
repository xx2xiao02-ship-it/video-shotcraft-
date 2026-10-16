import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nativeEditorialTimeline} from './talkcraft-editorial-native-plan.mjs';
import {assertNativeMediaClock} from './talkcraft-native-time-map.mjs';

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
  const file=path.join(project,'qa/editorial-repair-feedback.json');
  if(!fs.existsSync(file))return null;
  const record=JSON.parse(fs.readFileSync(file,'utf8'));
  return record.schema==='talkcraft-editorial-repair-feedback-v1'&&
    JSON.stringify(record.inputs)===JSON.stringify(inputHashes(project))?record:null;
}

// Feasibility is physics only. It neither ranks semantics nor chooses a card.
export function buildEditorialPlanningContract({aligned,catalog,personWindows=[]}) {
  const ranges=[];
  for(let first=0;first<aligned.length&&aligned[first].start<8;first++){
    for(let last=first;last<aligned.length;last++){
      if(aligned[last].end-aligned[first].start>3.4+1e-9)break;
      ranges.push({firstSentence:first,lastSentence:last,kind:'opening'});
    }
  }
  ranges.push(...personWindows.map(w=>({firstSentence:w.firstSentence,lastSentence:w.lastSentence,kind:'reused-person'})));
  const windows=ranges.map(r=>{
    const start=aligned[r.firstSentence].start,end=aligned[r.lastSentence].end;
    const frames=Math.round(end*30)-Math.round(start*30);
    const cards=catalog.cards.flatMap(card=>{
      if(r.kind==='opening'&&card.duration.originalFrames/card.duration.fps>3)return [];
      if(r.kind==='opening'&&personWindows.some(w=>r.firstSentence<=w.lastSentence&&r.lastSentence>=w.firstSentence))return [];
      try{
        // Hold position is only a mathematical witness here, not a visual approval.
        const timeline=nativeEditorialTimeline(frames,card.duration.frames,Math.min(1,card.duration.frames-2),'仅时长计算；正式驻留须编导按源码指定');
        assertNativeMediaClock(timeline,card.policy?.media,{});
        return [{slug:card.cardId,nativeFrames:card.duration.frames,rate:timeline.filter(s=>s.kind==='motion').map(s=>s.playbackRate),requiresHold:timeline.some(s=>s.kind==='hold')}];
      }catch{return [];}
    });
    return {...r,start,end,frames,cards};
  });
  return {schema:'talkcraft-editorial-planning-contract-v1',fps:30,reviewedCount:catalog.cards.length,
    exactPersonWindows:personWindows,windows,
    rules:'全部已审目录均可比较。cards仅说明真实句边界下的时长可行性，不是语义推荐、不是选卡白名单，不自动选第一名。开场从这些连续自然句范围规划覆盖前8秒；完整原卡≤3秒、镜头≤3.4秒。没有可行卡的范围可在真实句边界合并或拆分，不能编造时间。人物只能且必须逐一使用exactPersonWindows，不能跨入前后句。各30镜窗口自行检查已用卡，不同观点必须换卡；同观点承接仍须具体证据。requiresHold不证明主体可见，正式驻留必须依据源码。',
    productionAdmitted:false,userAcceptance:false};
}
