// Endpoint-to-endpoint rate at 30fps. Holds are not motion and have no rate.
// Keep this browser-safe: this exact file is copied into the Remotion project.
export const NATIVE_MIN_RATE=0.85,NATIVE_MAX_RATE=1.15;
export const NATIVE_MAX_HOLD_FRAMES=90;
export const NATIVE_HOLD_RULES='额外冻结驻留单次及全镜累计不得超过90帧（30fps的3秒），累计不得超过本镜总帧数的50%；相邻分段冻结合并计数，不能用分段规避。超限返回编导重选卡或按真实自然句拆镜，不改配音、口型或字级时间；此为确定性帧计划校验，不代替人工运动观感审核。';
export function assertNativeHoldBudget(timeline,duration){
 if(!Array.isArray(timeline))throw Error('冻结校验缺少有效帧计划');
 duration??=timeline.at(-1)?.toFrame+1;
 if(!Array.isArray(timeline)||!Number.isInteger(duration)||duration<1)throw Error('冻结校验缺少有效帧计划');
 let total=0,run=0;
 for(const s of timeline){
  const frozen=s.kind==='hold'||s.kind==='motion'&&s.nativeToFrame===s.nativeFromFrame&&s.toFrame>s.fromFrame;
  if(frozen){const count=s.toFrame-s.fromFrame+1;if(!Number.isInteger(count)||count<1)throw Error('冻结帧范围无效');total+=count;run+=count;if(run>NATIVE_MAX_HOLD_FRAMES)throw Error('原卡额外连续冻结超过3秒，须重新选卡或拆镜');}else run=0;
 }
 if(total>NATIVE_MAX_HOLD_FRAMES||total>duration*.5)throw Error('原卡额外冻结累计超过3秒或镜头50%，须重新选卡或拆镜');
 return {holdFrames:total,durationFrames:duration,maxFrames:Math.min(NATIVE_MAX_HOLD_FRAMES,Math.floor(duration*.5))};
}
export function nativeMotionRate(segment){
  const outputSpan=segment.toFrame-segment.fromFrame,nativeSpan=segment.nativeToFrame-segment.nativeFromFrame;
  if(outputSpan===0&&nativeSpan===0)return 1;
  return outputSpan>0?nativeSpan/outputSpan:Infinity;
}
export function assertNativeMotionRate(segment){
  const rate=nativeMotionRate(segment);
  if(!Number.isFinite(rate)||rate<NATIVE_MIN_RATE-1e-10||rate>NATIVE_MAX_RATE+1e-10)
    throw Error('原卡动效速度必须在 0.85～1.15 倍以内，超限必须重新选卡');
  if(segment.playbackRate!==undefined&&(!Number.isFinite(segment.playbackRate)||Math.abs(segment.playbackRate-rate)>1e-10))
    throw Error('原卡动效声明速度与实际帧映射不一致');
  // Old equal-frame plans remain compatible; a changed rate must be explicit.
  if(rate!==1&&segment.playbackRate===undefined)throw Error('变速动作缺少实际 playbackRate 记录');
  return rate;
}
export function assertNativeMediaClock(timeline,media={},props={}){
  const changed=timeline.some(s=>s.kind==='motion'&&Math.abs(assertNativeMotionRate(s)-1)>1e-10);
  const embedded=Object.values(media).some(kind=>/video|audio/iu.test(String(kind)))||
    Object.entries(props).some(([key,value])=>/hostSrc/iu.test(key)&&value||
      (Array.isArray(value)?value:[value]).some(v=>typeof v==='string'&&/\.(mp4|mov|webm|mkv|mp3|wav|m4a)(?:[?#]|$)/iu.test(v)));
  const remapped=changed||timeline.some(s=>s.kind==='hold'||s.nativeFromFrame!==s.fromFrame||s.nativeToFrame!==s.toFrame);
  if(embedded&&remapped)throw Error('原卡内部含口型或音视频，不能随动效变速、驻留或错移时钟；须重新选卡，独立人物层保持1倍');
}
export function nativeFrameAt(timeline,frame) {
  assertNativeHoldBudget(timeline);
  const segment=timeline.find(s=>frame>=s.fromFrame&&frame<=s.toFrame);
  if(!segment)throw Error('原生展示时间计划未覆盖当前帧：'+frame);
  if(segment.kind==='hold')return segment.nativeFromFrame;
  if(segment.kind!=='motion')throw Error('未知原生动作片段');
  const rate=assertNativeMotionRate(segment);
  // Freeze requires integer frames. Sampling preserves both native endpoints;
  // narration/word events and host footage remain on the outer output clock.
  return Math.min(segment.nativeToFrame,segment.nativeFromFrame+Math.round((frame-segment.fromFrame)*rate));
}
// A verified gap between narration shots may hold the final native frame.
// It is bounded by the next planned shot; arbitrary out-of-range frames still fail.
export function nativeFrameAtWithBridge(timeline,frame,bounds) {
  const {plannedStartFrame,plannedEndFrame,visualStartFrame,visualEndFrame,nextStartFrame}=bounds;
  const duration=plannedEndFrame-plannedStartFrame;
  if(![plannedStartFrame,plannedEndFrame,visualStartFrame,visualEndFrame].every(Number.isInteger)||
    duration<=0||visualStartFrame!==plannedStartFrame||visualEndFrame<plannedEndFrame||
    timeline.at(-1)?.toFrame!==duration-1)
    throw Error('原生展示与视觉桥接边界不一致');
  if(visualEndFrame>plannedEndFrame&&(!Number.isInteger(nextStartFrame)||
    nextStartFrame<=plannedEndFrame||visualEndFrame!==nextStartFrame))
    throw Error('视觉桥接必须止于下一镜头，禁止任意延长');
  if(!Number.isInteger(frame)||frame<0||frame>=visualEndFrame-visualStartFrame)
    throw Error('原生展示时间计划未覆盖当前帧：'+frame);
  const {holdFrames}=assertNativeHoldBudget(timeline);
  const bridge=visualEndFrame-plannedEndFrame;
  if(bridge>0&&(holdFrames+bridge>NATIVE_MAX_HOLD_FRAMES||holdFrames+bridge>(visualEndFrame-visualStartFrame)*.5))throw Error('句间桥接与额外冻结累计超限，须重新规划');
  return nativeFrameAt(timeline,Math.min(frame,duration-1));
}
export function outputFrameForNativeFrame(timeline,nativeFrame){
  if(!Number.isInteger(nativeFrame)||nativeFrame<0)throw Error('原生音效帧无效');
  const segment=timeline.find(s=>s.kind==='motion'&&nativeFrame>=s.nativeFromFrame&&nativeFrame<=s.nativeToFrame);
  if(!segment)throw Error('音效落点未被原生动作计划覆盖：'+nativeFrame);
  const rate=assertNativeMotionRate(segment);
  // First output frame that samples this cue or crosses it (never play early).
  const offset=Math.max(0,Math.ceil((nativeFrame-segment.nativeFromFrame-0.5)/rate-1e-10));
  return Math.min(segment.toFrame,segment.fromFrame+offset);
}
