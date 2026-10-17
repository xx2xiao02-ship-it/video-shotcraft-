// Preference uses the upstream taxonomy, not a new whitelist. Feasibility,
// semantics, real media and source duration remain owned by the upstream matcher.
export const VISUAL_PREFERENCE_RULES='同等语义和素材可行性下，优先比较数据信息图、关系/流程结构和真实素材呈现模板；图形必须表达当前因果、对比、流程或已核实数量，不编造数据。纯文字适合短钩子、过渡和结论强调，连续纯文或长文字驻留须说明选择理由并比较真实背景/素材方案。这只是编导偏好，不是图形白名单：全部108张已审模板保留，候选外仍按原版写明语义偏离理由；不得为提高图形占比机械选卡或补画。';
export function visualPreference(cards,{semantics=[],mediaAvailable=false}={}) {
  const relational=semantics.some(s=>['机制','对比','列举','结构','步骤','因果','数据'].includes(s));
  return cards.map((card,position)=>{
    const graphic=card.category==='数据信息图';
    const material=card.category==='素材呈现'||card.category==='运镜';
    const tier=graphic&&relational?0:material&&mediaAvailable?0:1;
    return {cardId:card.slug,category:card.category,preferenceTier:tier,upstreamPosition:position,
      reason:tier===0?(graphic?'原语义适合图形结构表达，数值仍须真实来源':'已有真实素材可用原卡承接'):'保留上游语义、素材和原生时长排序'};
  }).sort((a,b)=>a.preferenceTier-b.preferenceTier||a.upstreamPosition-b.upstreamPosition);
}
