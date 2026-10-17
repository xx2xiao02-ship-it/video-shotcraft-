// Local production requirements, not upstream semantic recommendations.
// These source layouts reserve a host region or are overlays on a presenter.
export const MIN_DIGITAL_HUMAN_SEC = 2.2;
export const HOST_CONTEXT = Object.freeze({
  ...Object.fromEntries(['alt-block-lines','hand-drawn-ellipse','outline-box-title','quote-hold-arrow','slab-punch-title','speed-slab-title'].map(id=>[id,{placement:'right',reason:'原卡右侧是独立人物列，去掉人物后不能保留空列'}])),
  ...Object.fromEntries(['gooey-morph','info-term-card','ink-underline','media-pop-in','motion-blur-slam-in','number-counter','numbered-step-stack','pip-zoom-box','strike-and-replace','typewriter-reveal'].map(id=>[id,{placement:'left',reason:'原卡左侧是独立人物列，去掉人物后不能保留空列'}])),
  ...Object.fromEntries(['color-slam-beat-card','danmu-bubble-praise','shape-wipe-transition','subscribe-cta'].map(id=>[id,{placement:'center',reason:'原卡以人物场景为底层，文字或转场是叠加层'}])),
  'keyword-pop-highlight': {placement:'center',reason:'底部花字依附人物主体，移除人物会留下整屏空白'},
  'type-contrast-emphasis': {placement:'left',reason:'原卡左47%是人物区，右侧文字不能替代人物主体'},
  'converging-arrows': {placement:'right',reason:'原卡右47%为人物区'},
  'lower-third-nameplate': {placement:'center',reason:'姓名下三分之一是人物叠加层'},
  'chevron-lower-third': {placement:'center',reason:'姓名条依附人物画面'},
  'corner-bracket-frame': {placement:'right',reason:'原卡右侧448像素预留人物主体'},
});
export const hostContextForCard = cardId => HOST_CONTEXT[cardId] || null;
export function auditHostContext(shots,{requireAssets=false,assetExists=()=>false}={}) {
  const issues=[];
  for(const shot of shots||[]) {
    if(shot.subject==='person'&&Number.isFinite(shot.start)&&Number.isFinite(shot.end)&&shot.end-shot.start<MIN_DIGITAL_HUMAN_SEC-1e-9)
      issues.push({shotId:shot.id,code:'HOST_SHOT_TOO_SHORT',message:`${shot.id} 人物镜头短于${MIN_DIGITAL_HUMAN_SEC}秒，须重新规划`});
    const context=hostContextForCard(shot.shotCard);
    if(!context)continue;
    if(shot.subject!=='person')issues.push({shotId:shot.id,code:'HOST_CONTEXT_REQUIRED',message:`${shot.id} / ${shot.shotCard}：${context.reason}。须规划真实人物或重新选卡，图库演示人物不算素材。`});
    else if(requireAssets&&!assetExists(shot))issues.push({shotId:shot.id,code:'HOST_ASSET_REQUIRED',message:`${shot.id} 缺少正式人物素材，不能生成正式预览或样片`});
  }
  return issues;
}
// Independent real host track only; never alter the original card geometry.
export function hostStageStyle(cardId) {
  const placement=hostContextForCard(cardId)?.placement;
  return {position:'absolute',...(placement==='left'?{left:'6%',bottom:'18%',width:'40%',height:'72%'}:
    placement==='center'?{left:'29%',bottom:'27%',width:'42%',height:'65%'}:
    {right:'2%',bottom:'8%',width:'38%',height:'84%'}),overflow:'hidden',borderRadius:6};
}
