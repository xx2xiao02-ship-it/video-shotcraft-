import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {proposeTimingRows} from './talkcraft-timing-completion.mjs';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
// This is an execution schedule, never a rewrite of the provider's creative
// blueprint. The existing full-native 1x handler owns all feasibility rules.
export function proposeEditorialTimingCorrection(shots,presentation,reveals){
 return {schema:'talkcraft-editorial-timing-correction-v1',inputsSha256:digest({shots,presentation,reveals}),
  ...proposeTimingRows(shots,presentation,reveals),paidCalls:0,productionAdmitted:false};
}
export function approveEditorialTimingCorrection(plan,shots,presentation,reveals){
 const expected=proposeEditorialTimingCorrection(shots,presentation,reveals);
 return {approved:isDeepStrictEqual(plan,expected),planSha256:digest(plan),paidCalls:0,productionAdmitted:false};
}
export function executeEditorialTimingCorrection(plan,approval,shots,presentation,reveals){
 const current=approveEditorialTimingCorrection(plan,shots,presentation,reveals);
 if(!approval?.approved||!isDeepStrictEqual(current,approval))throw Error('生成接纳前时序修正缺少当前方案审批');
 const next=structuredClone(presentation);
 for(const op of plan.operations){
  const index=next.shots.findIndex(r=>r.shotId===op.shotId);
  if(index<0||digest(next.shots[index])!==op.before)throw Error('生成接纳前时序修正方案已变化');
  next.shots[index]=structuredClone(op.after);
 }
 return next;
}
