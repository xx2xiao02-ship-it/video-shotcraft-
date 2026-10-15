export function nativeFrameAt(timeline,frame) {
  const segment=timeline.find(s=>frame>=s.fromFrame&&frame<=s.toFrame);
  if(!segment)throw Error('原生展示时间计划未覆盖当前帧：'+frame);
  return segment.kind==='hold'?segment.nativeFromFrame:segment.nativeFromFrame+frame-segment.fromFrame;
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
  return nativeFrameAt(timeline,Math.min(frame,duration-1));
}
export function outputFrameForNativeFrame(timeline,nativeFrame){
  if(!Number.isInteger(nativeFrame)||nativeFrame<0)throw Error('原生音效帧无效');
  const segment=timeline.find(s=>s.kind==='motion'&&nativeFrame>=s.nativeFromFrame&&nativeFrame<=s.nativeToFrame);
  if(!segment)throw Error('音效落点未被原生动作计划覆盖：'+nativeFrame);
  return segment.fromFrame+nativeFrame-segment.nativeFromFrame;
}
