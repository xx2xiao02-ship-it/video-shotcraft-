export function preflightShotbook(shotbook) {
  const findings = [];
  const shots = shotbook?.shots || [];
  if (!shots.length) findings.push({level:'FAIL',code:'SHOTBOOK_EMPTY',message:'SHOTBOOK 没有镜头'});
  shots.forEach((shot, index) => {
    if (!shot.primaryVisualJob) findings.push({level:'FAIL',code:'PRIMARY_JOB_MISSING',scene:index + 1,message:'缺少主视觉任务'});
    if (!shot.layoutVariant) findings.push({level:'FAIL',code:'LAYOUT_MISSING',scene:index + 1,message:'缺少版式'});
    if (shot.subject !== 'material' && !shot.selectedCard) findings.push({level:'FAIL',code:'CARD_MISSING',scene:index + 1,message:'非素材镜头没有卡片'});
    if (shot.subject === 'material' && !shot.material) findings.push({level:'FAIL',code:'MATERIAL_MISSING',scene:index + 1,message:'素材镜头没有视频'});
    if (index > 0 && shot.material && shot.material === shots[index - 1].material) findings.push({level:'FAIL',code:'ADJACENT_MATERIAL_DUPLICATE',scene:index + 1,message:'相邻镜头复用同一视频'});
    if (index > 0 && shot.selectedCard && shot.selectedCard === shots[index - 1].selectedCard) findings.push({level:'WARN',code:'ADJACENT_CARD_REPEAT',scene:index + 1,message:'相邻镜头重复卡片'});
  });
  for (let i = 2; i < shots.length; i += 1) {
    if (shots[i].layoutVariant === shots[i - 1].layoutVariant && shots[i].layoutVariant === shots[i - 2].layoutVariant) {
      findings.push({level:'FAIL',code:'LAYOUT_REPEAT_THREE',scene:i + 1,message:'同一版式连续使用三镜'});
    }
  }
  const fail = findings.some(finding => finding.level === 'FAIL');
  return {ok:!fail, findings, summary:{shots:shots.length, cards:shotbook.cardsUnique?.length || 0, fails:findings.filter(f=>f.level==='FAIL').length, warnings:findings.filter(f=>f.level==='WARN').length}};
}
