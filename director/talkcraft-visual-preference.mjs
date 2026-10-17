// Preference uses the upstream taxonomy, not a new whitelist. Feasibility,
// semantics, real media and source duration remain owned by the upstream matcher.
export const VISUAL_PREFERENCE_RULES='编导默认先用能够准确表达本句含义的图形模板组织解释段，纯文字用于短钩子、过渡、结论或没有可行图形的情况；不能把纯文字作为全片默认布局。先比较数据信息图、关系/流程结构和真实素材呈现模板；图形必须表达当前因果、对比、流程或已核实数量，不编造数据。全部108张已审卡仍可比较；同等语义、时长、素材可行性时图形优先。前三镜不强制视频背景，先保持统一开场风格。纯文字适合短钩子、过渡和结论强调，但要记录具体图形候选和不适配原因；加视频背景不能替代这一步比较。连续纯文或长文字驻留须说明选择理由并比较真实背景/素材方案。这只是编导偏好，不是图形白名单：全部108张已审模板保留，候选外仍按原版写明语义偏离理由；不得为提高图形占比机械选卡或补画。';
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
