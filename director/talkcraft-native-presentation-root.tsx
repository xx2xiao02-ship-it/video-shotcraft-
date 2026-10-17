import React from 'react';
import {Freeze,Sequence,useCurrentFrame} from 'remotion';
import presentation from '../native-presentation.json';
import {nativeFrameAtWithBridge,assertNativeMediaClock} from './native-time-map.mjs';
import plannedShots from '../shots.json';
import {SHOTS,FPS} from './shots';
import {WordRevealRoot} from './WordRevealRoot';

// The outer word gate uses narration time. Only the original card uses its
// declared native frame at bounded speed; host/audio stay outside this wrapper.
export const NativePresentationRoot:React.FC<{shotId:string;cardProps?:Record<string,unknown>;children:React.ReactNode}>=({shotId,cardProps={},children})=>{
  const frame=useCurrentFrame(),row=presentation.shots.find(s=>s.shotId===shotId);
  if(!row)throw Error('镜头缺少正式展示计划：'+shotId);
  assertNativeMediaClock(row.timeline,{},cardProps);
  const index=plannedShots.findIndex(s=>s.id===shotId),planned=plannedShots[index],visual=SHOTS.find(s=>s.id===shotId);
  if(!planned||!visual||row.startFrame!==Math.round(planned.start*FPS)||row.endFrame!==Math.round(planned.end*FPS))
    throw Error('原生展示与正式分镜边界不一致：'+shotId);
  const nativeFrame=nativeFrameAtWithBridge(row.timeline,frame,{
    plannedStartFrame:row.startFrame,plannedEndFrame:row.endFrame,
    visualStartFrame:Math.round(visual.startSec*FPS),visualEndFrame:Math.round((visual.startSec+visual.durationSec)*FPS),
    nextStartFrame:index+1<plannedShots.length?Math.round(plannedShots[index+1].start*FPS):null,
  });
  const hiddenTexts=row.textFields.filter(f=>f.visibility==='hidden').flatMap(f=>String(cardProps[f.key]||'').split('\n')).filter(Boolean);
  const retimed=row.timeline.some(s=>s.kind==='motion'&&s.toFrame-s.fromFrame!==s.nativeToFrame-s.nativeFromFrame);
  // Remove demo-only silhouettes when the pipeline supplies real host footage.
  // No font, geometry, animation or layout overrides are permitted here.
  return <><style>{'.wb-host-silhouette{display:none!important;}'}</style><WordRevealRoot beatId={shotId} hiddenTexts={hiddenTexts} mobileMinTextPx={row.mobileMinTextPx} cardId={row.cardId}>
    {/* Freeze at a valid outer frame, then offset only the card clock. A direct
        Freeze(nativeFrame) clamps native tail frames in a shorter composition. */}
    {retimed?<Freeze frame={0}><Sequence from={-nativeFrame} durationInFrames={row.nativeFrames} layout="none">{children}</Sequence></Freeze>
      :<Freeze frame={nativeFrame}>{children}</Freeze>}
  </WordRevealRoot></>;
};
