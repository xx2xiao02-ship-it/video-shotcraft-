import {buildEditorialJointRepairContract} from './talkcraft-editorial-joint-repair.mjs';

const reasons={TIMING_OR_SUBJECT_INCOMPATIBLE:'真实时长、开场完整动作或人物窗口不兼容',
  SOURCE_DISPLAY_SLOT_REQUIRED:'缺少本镜所需真实资料展示槽',AUTHORED_CONTENT_SLOT_UNAVAILABLE:'只有固定演示，没有业务内容入口',
  QUANTITATIVE_INPUT_REQUIRED:'需要本镜未提供的真实量化数据',FIXED_SHOT_REUSE_CONFLICT:'与锁定镜头重复且没有同观点承接授权'};
export function prepareTechnicalGraphicComparisons({shots,research,sentences,aligned,catalog,graphicCardIds,eligibleShotIds,personWindows=[],projectRoot}){
  const records=[];
  for(const row of research.shots||[]){
    if(!eligibleShotIds?.includes(row.shotId))continue;
    if(row.graphicAlternatives?.some(a=>graphicCardIds.includes(a.cardId)&&String(a.reason||'').trim().length>=4))continue;
    const shot=shots.find(s=>s.id===row.shotId);if(!shot)continue;
    const joint=buildEditorialJointRepairContract({proposal:{shots,sentences,materialResearch:research},
      failedChecks:[{shotId:shot.id,code:'GRAPHIC_COMPARISON_REQUIRED'}],aligned,catalog,personWindows,projectRoot});
    const window=joint.windows[0];
    // A creative choice is still required if any graphic is physically viable.
    // No made-up editorial rationale and no automatic card replacement.
    if(!graphicCardIds.length||window.candidates.some(c=>graphicCardIds.includes(c.slug)))continue;
    const comparisons=graphicCardIds.map(cardId=>({cardId,codes:Object.entries(window.rejected)
      .filter(([,ids])=>ids.includes(cardId)).map(([code])=>code)}));
    if(comparisons.some(c=>!c.codes.length||c.codes.some(code=>!reasons[code])))continue;
    const alternatives=comparisons.map(c=>({cardId:c.cardId,reason:'正式硬约束实际比较：'+c.codes.map(code=>reasons[code]).join('；'),
      comparison:'hard-constraints-v1',rejectCodes:c.codes}));
    row.graphicAlternatives=[...(row.graphicAlternatives||[]),...alternatives];
    records.push({shotId:shot.id,frames:window.frames,compared:comparisons,changedCard:false});
  }
  return records;
}
