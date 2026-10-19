import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
// The centre approves a recomputed, deterministic source plan. No arbitrary
// business values, render approval or billable work can enter this capability.
export function approvePresentationCorrection(plan,recomputed){
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(plan.runId||'')||!plan.inputs||Object.values(plan.inputs).some(v=>!v)||plan.schema!=='talkcraft-presentation-correction-v1'||hash(plan)!==hash(recomputed)||
  plan.externalRequests!==0||plan.userAcceptance!==false||plan.files.some(f=>!f.beforeSha256||!f.afterSha256||!f.relative.endsWith('.tsx')))
  throw Error('展示修正方案未通过治理中心核验');
 return {approved:true,planSha256:hash(plan),action:'deterministic-presentation-install',stopAt:'review',externalRequests:0,userAcceptance:false};
}
