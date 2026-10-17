export const BACKGROUND_PRESENTATION_RULES='真实背景视频必须登记materialRole=background、materialSrc、原始素材身份与匹配理由，并声明已核对的backgroundPresentation，通过原卡公开透明底色参数露出；禁止视频在实色卡片下面被完全遮住。当前theme-wash-v1仅对应chapter-progress-list公开bg=#ffffff00能力；其他外置背景须先核对原卡能力，不能默默套底。真实视频背景统一用72%黑色遮罩压暗，前景正文和独立字幕用浅色保证可读，不用白色主题色洗亮背景。该呈现保留原卡构图，背景只承接语境，不能冒充事实证据。编号必须有文案或明确章节/步骤依据，禁止沿用模板演示编号；并列条目可使用原卡DSL空编号，结语使用有意义的标题。';
export function backgroundPresentation(shot,theme={}){
 const p=shot.templateParams||{};
 if(p.backgroundPresentation!=='theme-wash-v1')return {overlay:'rgba(0,0,0,.42)'};
 if(p.materialRole!=='background'||!p.materialSrc)throw Error(`${shot.id} 缺少真实背景绑定`);
 if(shot.shotCard!=='chapter-progress-list'||p.cardProps?.bg!=='#ffffff00')throw Error(`${shot.id} 背景会被原卡底板遮挡，须选用公开透明底色参数或重新选卡`);
 if(!/^#[\da-f]{6}$/iu.test(theme.background||''))throw Error('背景主题颜色无效');
 return {overlay:'#000000b8'};
}
export function checkPresentationSemantics(shots){
 const issues=[];
 for(const shot of shots){
  const p=shot.templateParams||{},props=p.cardProps||{};
  if(p.materialRole==='background'){
   if(!p.materialSrc||!p.materialSourceId||!p.materialMatchReason)issues.push({shotId:shot.id,code:'BACKGROUND_BINDING_INCOMPLETE'});
   if(p.backgroundPresentation!=='theme-wash-v1')issues.push({shotId:shot.id,code:'BACKGROUND_PRESENTATION_REQUIRED',message:'尚未核对原卡与外置背景的可见绑定，不能只填素材路径就放行'});
   if(p.backgroundPresentation==='theme-wash-v1')try{backgroundPresentation(shot,{background:'#f7f5f0'});}catch(error){issues.push({shotId:shot.id,code:'BACKGROUND_OCCLUDED',message:error.message});}
  }
  const explicit=[...(shot.shotCard==='chapter-title-card'?[props.num]:[]),...(shot.shotCard==='chapter-progress-list'?String(props.rows||'').split('\n').filter(r=>r.includes('|')).map(r=>r.split('|')[0]):[])].filter(v=>/^\s*\d{1,3}\s*$/u.test(String(v??'')));
  if(explicit.length&&!String(p.numberingReason||'').trim())issues.push({shotId:shot.id,code:'NUMBERING_REASON_REQUIRED',message:'编号必须说明对应的真实章节或步骤，不得使用装饰性演示序号'});
 }
 return {passed:issues.length===0,issues};
}

export function backgroundCaptionTheme(shot,theme){
 const p=shot?.templateParams||{};
 return p.materialRole==='background'&&p.backgroundPresentation==='theme-wash-v1'
  ? {...theme,text:'#ffffff'} : theme;
}
