import {TEXT_VIDEO_VERSION,TEXT_VIDEO_CARDS,checkTextVideoCycle,darkBackgroundContrast} from './talkcraft-text-video.mjs';
export const MATERIAL_POLICY_VERSION='zh-background-v2';
export const MATERIAL_POLICY_RULES='素材检索与下载优先中文内容：先给queryZh中文检索词，再以原名/外文检索补充。优先同一机构中文版；中文不豁免身份、真实性、授权和本地绑定核验。没有合适中文资料时可保留外文原始资料，在binding记录contentLanguage和languageReason，不改写原始截图冒充中文原件。中文检索结果不代表链接正文也是中文，下载/抓取后须核对实际内容语言。无文字背景视频语言记zxx，不因英文检索词淘汰。纯文字或低变化镜头优先实际绑定语境匹配的视频背景；backgroundDecision最终须use或omit，omit须pureTextReason解释短钩子、专注资料阅读、语义过渡或素材/原卡限制。compare仅为候选准备，不能当完成。优先比较能准确表达当前观点的图形、关系、流程或真实资料模板，保留纯文必须记录graphicAlternatives=[{cardId,reason}]说明已比较的图形卡为何不适配；不得编造数据。前三镜不强制视频背景，以统一开场风格为先，不为满足背景比例给短钩子硬铺素材。第四镜起连续三个纯文字镜头至少一个实际使用真实视频背景，按重叠滑动窗口检查，omit理由不能豁免。背景沿用已审原卡透明底能力和72%黑压；前景用浅色并检查公开文字颜色参数，独立字幕保持浅色。允许text-video-v1受控背景改造，目前soft-blur-in、type-contrast-emphasis、per-character-rise、quote-bracket-pull和line-by-line-slide仅透明化已核对的最外底板，原源码、布局、标题、图形及动效不变；通过公开textColor或ink/accent填写浅色，不能自动覆盖业务参数。不支持的模板先核对能力或在全108卡比较重选，不缩卡、不改几何。新规划按zh-background-v2核验，历史规划保留且报告待迁移，不能自动标记已符合新规则。';
export {darkBackgroundContrast} from './talkcraft-text-video.mjs';
export function checkMaterialPolicy(plan,demands,shots){
 const active=plan?.editorialPolicy===MATERIAL_POLICY_VERSION,issues=[],rows=[];
 for(const d of demands){const row=plan?.shots?.find(r=>r.shotId===d.shotId);if(!row)continue;
  const shot=shots.find(s=>s.id===d.shotId),p=shot?.templateParams||{};
  const language=(row.bindings||[]).map(b=>({query:b.query,language:b.contentLanguage||'und',reason:b.languageReason||'',resolved:/^(zh(?:-[a-z]+)*|zxx)$/iu.test(b.contentLanguage||'')||!!String(b.languageReason||'').trim()}));
  const background={requiredDecision:!!d.considerBackground,decision:row.backgroundDecision||'unresolved',reason:row.pureTextReason||row.backgroundReason||''};
  if(active){
   if(d.considerBackground&&!(row.graphicAlternatives||[]).some(a=>typeof a.cardId==='string'&&(!d.graphicCardIds||d.graphicCardIds.includes(a.cardId))&&String(a.reason||'').trim().length>=4))issues.push({shotId:d.shotId,code:'GRAPHIC_COMPARISON_REQUIRED',message:'纯文字选卡须记录实际比较的图形模板及不适配原因，视频背景不能替代图形选卡比较'});
   if(p.backgroundPresentation===TEXT_VIDEO_VERSION){for(const [field,fallback]of Object.entries(TEXT_VIDEO_CARDS[shot.shotCard]?.colors||{})){const color=p.cardProps?.[field]??fallback,ratio=darkBackgroundContrast(color);if(ratio===null||ratio<4.5)issues.push({shotId:d.shotId,code:'BACKGROUND_TEXT_COLOR_CONTRACT',field,color,ratio});}}
   for(const l of language)if(!l.language||l.language==='und'||!l.resolved)issues.push({shotId:d.shotId,code:'SOURCE_LANGUAGE_REVIEW_REQUIRED',query:l.query,message:'核对实际素材语言；非中文来源须记录保留理由'});
   if(d.considerBackground&&row.backgroundDecision!=='use'&&!(row.backgroundDecision==='omit'&&!!String(row.pureTextReason||'').trim()))issues.push({shotId:d.shotId,code:'BACKGROUND_FINAL_DECISION_REQUIRED',message:'纯文镜须实际用背景或写明保留纯文的具体原因；搜索候选不算完成'});
   if(p.materialRole==='background'&&p.backgroundPresentation==='theme-wash-v1'&&shot.shotCard==='chapter-progress-list')for(const [field,color]of Object.entries({dim:p.cardProps?.dim??'#a1a1a6',accent:p.cardProps?.accent??'#e65a3b'})){
    const ratio=darkBackgroundContrast(color);if(ratio===null||ratio<4.5)issues.push({shotId:d.shotId,code:'BACKGROUND_TEXT_COLOR_CONTRACT',field,color,ratio,message:'黑压背景上的公开文字颜色参数须采用对比度足够的浅色，实际观感仍须人审'});
   }
  }
  rows.push({shotId:d.shotId,language,background});
 }
 const cycle=checkTextVideoCycle(shots,demands);issues.push(...cycle.issues);
 return {cycle,policy:MATERIAL_POLICY_VERSION,status:active?'checked':'legacy-plan-needs-review',issues,rows,visualReviewRequired:true};
}
