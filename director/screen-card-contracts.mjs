const screenField='真实本地PNG截图：{src:card-media/...png,kind:image,width,height,sha256}；尺寸和SHA来自实际素材，禁止编造';
const targetField='同会话DOM实测{x,y,width,height}，须在1920x1080素材内';
export const SCREEN_CARD_FIELDS=Object.freeze({
  'effects/fui-hud-moves/reticle-lock-on':{screen:screenField,targetRect:targetField},
  'effects/brand-frame-snap':{screens:'两张不同SHA的真实横向模式截图，按模式A、模式B顺序；每项'+screenField,
    portraitScreens:'对应两张真实竖向页面截图，模式顺序相同；每项'+screenField},
  'effects/spotlight-sweep-moves/glow-wake-sleep-panel':{screen:screenField},
  'effects/spotlight-sweep-moves/slide-spotlight-pan':{screen:screenField},
  'effects/spotlight-sweep-moves/corner-spotlight-reveal':{screen:screenField},
  'effects/radial-ripple-phone-chips':{screen:screenField+'；等比缩至132px宽后的高度至少414px'},
  'outro/edit-hook-moves/logo-sting-button':{screens:'前镜和此前未展示的真实彩蛋详情截图；每项'+screenField,targetRect:targetField},
});
export const SCREEN_CARD_IDS=new Set(Object.keys(SCREEN_CARD_FIELDS));
const screenKeys=['src','kind','width','height','sha256'];
const source=value=>value && Object.keys(value).length===screenKeys.length &&
  Object.keys(value).every(key=>screenKeys.includes(key)) && value.kind==='image' &&
  typeof value.src==='string' && /^card-media\/[a-zA-Z0-9][a-zA-Z0-9._/-]*\.png$/.test(value.src) &&
  !value.src.includes('..') && !value.src.includes('//') && /^[0-9a-f]{64}$/.test(value.sha256) &&
  Number.isInteger(value.width) && Number.isInteger(value.height) && value.width>=32 &&
  value.height>=32 && value.width<=8192 && value.height<=16384;

export function validateScreenCardParams(id,params){
  if(!SCREEN_CARD_IDS.has(id)) return undefined;
  const fields=SCREEN_CARD_FIELDS[id];
  if(!params || Object.keys(params).length!==Object.keys(fields).length ||
    Object.keys(params).some(key=>!Object.hasOwn(fields,key))) throw new Error('媒体卡必须完整提供本卡声明的真实素材字段');
  const screens=params.screens || [params.screen];
  if(!Array.isArray(screens) || screens.length!==(fields.screens ? 2 : 1) || screens.some(value=>!source(value)))
    throw new Error('媒体卡需要真实本地PNG、实际尺寸和SHA；未验证视频类型不开放');
  if(fields.screens && (screens[0].src===screens[1].src || screens[0].sha256===screens[1].sha256))
    throw new Error('两模式或彩蛋不得复用同一张截图');
  if(fields.portraitScreens && (!Array.isArray(params.portraitScreens) || params.portraitScreens.length!==2 ||
    params.portraitScreens.some(value=>!source(value) || value.height<=value.width) ||
    params.portraitScreens[0].src===params.portraitScreens[1].src ||
    params.portraitScreens[0].sha256===params.portraitScreens[1].sha256))
    throw new Error('画框需要两个不同状态的真实竖向页面素材');
  if(fields.targetRect){
    const rect=params.targetRect,keys=['x','y','width','height'];
    if(!rect || typeof rect!=='object' || Object.keys(rect).length!==4 || Object.keys(rect).some(key=>!keys.includes(key)) ||
      !Object.values(rect).every(Number.isFinite) || rect.x<0 || rect.y<0 || rect.width<40 || rect.height<40 ||
      rect.x+rect.width>1920 || rect.y+rect.height>1080 || screens.some(value=>value.width!==1920 || value.height!==1080))
      throw new Error('媒体目标框必须是1920x1080原图内的实测区域');
  }
  if(id==='effects/radial-ripple-phone-chips' && screens[0].height*132/screens[0].width<414)
    throw new Error('手机长图不足264像素屏高加150像素滚动，禁止重复图片补足');
  return fields.screens ? {screens:screens.map(value=>({...value})),
    ...(params.portraitScreens ? {portraitScreens:params.portraitScreens.map(value=>({...value}))} : {}),
    ...(params.targetRect ? {targetRect:{...params.targetRect}} : {})} :
    {screen:{...params.screen},...(params.targetRect ? {targetRect:{...params.targetRect}} : {})};
}
