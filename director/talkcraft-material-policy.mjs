export const MATERIAL_POLICY_VERSION='zh-background-v1';
export const MATERIAL_POLICY_RULES='素材检索与下载优先中文内容：先给queryZh中文检索词，再以原名/外文检索补充。优先同一机构中文版；中文不豁免身份、真实性、授权和本地绑定核验。没有合适中文资料时可保留外文原始资料，在binding记录contentLanguage和languageReason，不改写原始截图冒充中文原件。中文检索结果不代表链接正文也是中文，下载/抓取后须核对实际内容语言。无文字背景视频语言记zxx，不因英文检索词淘汰。纯文字或低变化镜头优先实际绑定语境匹配的视频背景；backgroundDecision最终须use或omit，omit须pureTextReason解释短钩子、专注资料阅读、语义过渡或素材/原卡限制。compare仅为候选准备，不能当完成。连续纯文要逐镜说明，不以固定占比机械铺视频。背景沿用已审原卡透明底能力和72%黑压；前景用浅色并检查公开文字颜色参数，独立字幕保持浅色。不能缩卡或CSS抹掉原底板；不支持背景的卡须在全108卡比较重选。新规划按zh-background-v1核验，历史规划保留且报告待迁移，不能自动标记已符合新规则。';
const luminance=hex=>{if(!/^#[\da-f]{6}$/iu.test(hex||''))return null;const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
export function darkBackgroundContrast(color){const a=luminance(color),b=luminance('#474747');return a===null?null:(Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
export function checkMaterialPolicy(plan,demands,shots){
 const active=plan?.editorialPolicy===MATERIAL_POLICY_VERSION,issues=[],rows=[];
 for(const d of demands){const row=plan?.shots?.find(r=>r.shotId===d.shotId);if(!row)continue;
  const shot=shots.find(s=>s.id===d.shotId),p=shot?.templateParams||{};
  const language=(row.bindings||[]).map(b=>({query:b.query,language:b.contentLanguage||'und',reason:b.languageReason||'',resolved:/^(zh(?:-[a-z]+)*|zxx)$/iu.test(b.contentLanguage||'')||!!String(b.languageReason||'').trim()}));
  const background={requiredDecision:!!d.considerBackground,decision:row.backgroundDecision||'unresolved',reason:row.pureTextReason||row.backgroundReason||''};
  if(active){
   for(const l of language)if(!l.language||l.language==='und'||!l.resolved)issues.push({shotId:d.shotId,code:'SOURCE_LANGUAGE_REVIEW_REQUIRED',query:l.query,message:'核对实际素材语言；非中文来源须记录保留理由'});
   if(d.considerBackground&&row.backgroundDecision!=='use'&&!(row.backgroundDecision==='omit'&&!!String(row.pureTextReason||'').trim()))issues.push({shotId:d.shotId,code:'BACKGROUND_FINAL_DECISION_REQUIRED',message:'纯文镜须实际用背景或写明保留纯文的具体原因；搜索候选不算完成'});
   if(p.materialRole==='background'&&p.backgroundPresentation==='theme-wash-v1'&&shot.shotCard==='chapter-progress-list')for(const [field,color]of Object.entries({dim:p.cardProps?.dim??'#a1a1a6',accent:p.cardProps?.accent??'#e65a3b'})){
    const ratio=darkBackgroundContrast(color);if(ratio===null||ratio<4.5)issues.push({shotId:d.shotId,code:'BACKGROUND_TEXT_COLOR_CONTRACT',field,color,ratio,message:'黑压背景上的公开文字颜色参数须采用对比度足够的浅色，实际观感仍须人审'});
   }
  }
  rows.push({shotId:d.shotId,language,background});
 }
 return {policy:MATERIAL_POLICY_VERSION,status:active?'checked':'legacy-plan-needs-review',issues,rows,visualReviewRequired:true};
}
