// Prove that offered options participate in a whole-scope, non-repeating
// assignment. This is feasibility evidence, never an authored card selection.
export function constrainJointSelection(windows,shots,{maxVisits=200000}={}){
  const position=new Map(shots.map((s,i)=>[s.id,i]));
  const editable=new Set(windows.map(w=>w.shotId));
  let visits=0;
  const near=(a,b)=>Math.abs(position.get(a)-position.get(b))<30;
  const domains=windows.map(w=>({shotId:w.shotId,choices:w.choices.filter(c=>
    !shots.some(s=>!editable.has(s.id)&&near(w.shotId,s.id)&&s.shotCard===c.slug))}));
  if(domains.some(w=>!position.has(w.shotId)||!w.choices.length))throw Error('联合选卡缺少镜头位置或可行候选，未调用模型');
  const canComplete=(assigned)=>{
    if(++visits>maxVisits)throw Error('联合选卡可行性计算超出预算，未调用模型；不能将未证明方案当作可行');
    if(assigned.size===domains.length)return true;
    let next=null,options=null;
    for(const w of domains){
      if(assigned.has(w.shotId))continue;
      const available=w.choices.filter(c=>![...assigned].some(([id,slug])=>near(w.shotId,id)&&c.slug===slug));
      if(!available.length)return false;
      if(!options||available.length<options.length){next=w;options=available;}
    }
    for(const c of options){
      assigned.set(next.shotId,c.slug);
      const found=canComplete(assigned);assigned.delete(next.shotId);
      if(found)return true;
    }
    return false;
  };
  if(!canComplete(new Map()))throw Error('完整失败范围没有联合去重解，未调用模型；须先治理范围和时长合同');
  return windows.map((w,i)=>({...w,choices:domains[i].choices.filter(c=>canComplete(new Map([[w.shotId,c.slug]])))}));
}
