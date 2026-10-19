// Preference uses the upstream taxonomy, not a new whitelist. Feasibility,
// semantics, real media and source duration remain owned by the upstream matcher.
export const VISUAL_PREFERENCE_RULES='普通论述优先匹配语境的实景视频连续呈现，不默认文档截图或滑块对比；有明确结构、因果、对比、流程关系时用准确的图形表达，具体数据、人物身份和引用保留原始证据。前三镜保持原开场，之后所有文字含观点、金句、强调和过渡默认必须视频背景并叠72%黑色压暗；保留纯文需比较真实图形候选但不能编造关系。全部108张已审卡仍比较；同等语义、时长、素材可行性时图形优先于单纯文字，实景视频优先于普通论述的文档堆叠。背景不代替图形比较和事实证据，不以比例机械选卡、补画或改变原始配音/口型。';
export function visualPreference(cards,{semantics=[],mediaAvailable=false,videoAvailable=false}={}) {
  const relational=semantics.some(s=>['机制','对比','列举','结构','步骤','因果','数据'].includes(s));
  return cards.map((card,position)=>{
    const graphic=card.category==='数据信息图';
    const material=card.category==='素材呈现'||card.category==='运镜';
    const video=(card.inputs||[]).some(i=>i.type==='V');
    const tier=videoAvailable&&video?0:graphic&&relational?1:material&&mediaAvailable?1:2;
    return {cardId:card.slug,category:card.category,preferenceTier:tier,upstreamPosition:position,
      reason:tier===0?'优先比较原卡视频入口，真实匹配与许可仍须素材节点核验':'保留上游语义、素材和原生时长排序'};
  }).sort((a,b)=>a.preferenceTier-b.preferenceTier||a.upstreamPosition-b.upstreamPosition);
}
