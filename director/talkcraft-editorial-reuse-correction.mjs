import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {auditTemplateReuse} from './talkcraft-template-governance.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');

// Group the whole conflict graph, rather than proposing one paid repair per
// edge. Domains are technical possibilities, never authored replacement plans.
export function proposeEditorialReuseCorrection(response,request){
  const selected=new Map((response.repairs||[]).flatMap(row=>{
    const choice=request.windows.find(w=>w.shotId===row.shotId)?.choices.find(c=>c.choiceId===row.choiceId);
    return choice?[[row.shotId,{shotCard:choice.slug,templateParams:row.templateParams}]]:[];
  }));
  const shots=(request.baseProposal?.shots||[]).map(s=>selected.has(s.id)?{...s,...selected.get(s.id)}:s);
  const conflicts=auditTemplateReuse(shots).filter(i=>selected.has(i.shotId)||selected.has(i.previousShotId));
  const graph=new Map();
  for(const c of conflicts)for(const [a,b]of [[c.shotId,c.previousShotId],[c.previousShotId,c.shotId]]){
    if(!graph.has(a))graph.set(a,new Set());graph.get(a).add(b);
  }
  const seen=new Set(),groups=[];
  for(const id of graph.keys()){
    if(seen.has(id))continue;
    const pending=[id],ids=[];
    while(pending.length){const next=pending.pop();if(seen.has(next))continue;seen.add(next);ids.push(next);pending.push(...graph.get(next));}
    ids.sort((a,b)=>shots.findIndex(s=>s.id===a)-shots.findIndex(s=>s.id===b));
    groups.push({shotIds:ids,lockedShotIds:ids.filter(id=>!request.editableShotIds.includes(id)),
      conflicts:conflicts.filter(c=>ids.includes(c.shotId)&&ids.includes(c.previousShotId)),
      domains:ids.filter(id=>request.editableShotIds.includes(id)).map(shotId=>({shotId,
        choices:request.windows.find(w=>w.shotId===shotId).choices.map(c=>({choiceId:c.choiceId,cardId:c.slug}))}))});
  }
  return {schema:'talkcraft-editorial-reuse-correction-v1',requestId:request.requestId,
    rawSha256:hash(response),contractSha256:hash(request),groups,
    action:groups.length?'joint-reselection-required':'none',externalRequests:0,
    automaticReplacement:false,productionAdmitted:false,
    reason:groups.length?'本次返回仅有各镜已选设计，没有其它卡的完整参数、素材和锚点设计；候选域不能替代创作结果。保留当前结果，联合处理全部冲突，不自动选卡、编承接理由或调用模型。':'未发现重复选卡冲突'};
}

export function approveEditorialReuseCorrection(plan,response,request){
  return {approved:response?.requestId===request?.requestId&&isDeepStrictEqual(plan,proposeEditorialReuseCorrection(response,request)),
    planSha256:hash(plan),requestId:request.requestId,execution:'retain-and-recheck',allowProvider:false,
    allowAutomaticReplacement:false,productionAdmitted:false};
}
