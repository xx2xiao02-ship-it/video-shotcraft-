// User-approved local adaptation: distinguish narration captions from visual
// titles and diagram labels. Category names such as 字幕花字 are not a mask.
export function templateCaptionRole(cardId){
  return cardId==='keyword-pop-highlight'?'spoken-caption':'visual-information';
}
export function assertCaptionScene(shot){
  if(templateCaptionRole(shot.shotCard)!=='spoken-caption')return;
  if(shot.subject!=='person'&&!shot.templateParams?.materialSrc)
    throw Error('镜头 '+shot.id+' 仅含口播字幕，屏蔽后缺少主画面，请重选卡或绑定真实主体素材');
}
export function templateCaptionMask(cardId){
  if(templateCaptionRole(cardId)!=='spoken-caption')return '';
  // Exact reviewed keyword card: outer fill > shaking fill > caption block.
  // Its host/media and background remain intact; no title/chart selectors.
  return '[data-native-card="keyword-pop-highlight"] > div > div > div:last-child{display:none!important;}';
}
