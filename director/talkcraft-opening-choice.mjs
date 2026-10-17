import fs from 'node:fs';
import path from 'node:path';
// Upstream metadata is evidence for a director, never an eight-card whitelist.
export const OPENING_CHOICE_RULES = `首镜任务是抓注意力，必须比较完整已审目录中的用途、位置、语义、能量与原构图，不只比较时长和字面关键词。钩子/开场标签是优先线索而非白名单；没有该标签也允许按原项目格式说明具体适配理由。字幕强调卡不能仅因有“强调”标签就替代开场主视觉；若采用，必须说明人物、真实素材或原卡本身如何承担钩子。flying-words 等背景层不能单独当主体。先看原用途再看参数；同时遵守前8秒短模板、素材与30镜唯一性。统一字幕样式独立于镜头选卡，不得为了字幕样式反复选择同一张卡。`;

export function openingChoiceEvidence(card,{skillRoot}={}){
 const file=skillRoot&&/^[a-z0-9-]+$/.test(card.slug)?path.join(skillRoot,'references/cards',card.slug+'.md'):null;
 const reference=file&&fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
 const usage=/^适用:\s*(.+)$/m.exec(reference)?.[1]||null;
 return {position:card.position||'任意',energy:card.energy||null,
  usage,
  openingClues:{hookSemantic:(card.semantics||[]).includes('钩子'),openingPosition:card.position==='开场',
   restriction:'标签只作比较线索；候选外仍按原项目写语义偏离理由，不额外禁止已审卡'}};
}
