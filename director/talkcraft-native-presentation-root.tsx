import React from 'react';
import {Freeze,useCurrentFrame} from 'remotion';
import presentation from '../native-presentation.json';
import {nativeFrameAtWithBridge} from './native-time-map.mjs';
import plannedShots from '../shots.json';
import {SHOTS,FPS} from './shots';
import {WordRevealRoot} from './WordRevealRoot';
import reveals from '../word-reveals.json';
import {nativeCardSkin} from './talkcraft-presentation-skin.mjs';

// The outer word gate uses narration time. Only the original card uses its
// declared native frame; a hold never speeds up, skips or rewrites card motion.
export const NativePresentationRoot:React.FC<{shotId:string;cardProps?:Record<string,unknown>;children:React.ReactNode}>=({shotId,cardProps={},children})=>{
  const frame=useCurrentFrame(),row=presentation.shots.find(s=>s.shotId===shotId);
  if(!row)throw Error('镜头缺少正式展示计划：'+shotId);
  const index=plannedShots.findIndex(s=>s.id===shotId),planned=plannedShots[index],visual=SHOTS.find(s=>s.id===shotId);
  if(!planned||!visual||row.startFrame!==Math.round(planned.start*FPS)||row.endFrame!==Math.round(planned.end*FPS))
    throw Error('原生展示与正式分镜边界不一致：'+shotId);
  const nativeFrame=nativeFrameAtWithBridge(row.timeline,frame,{
    plannedStartFrame:row.startFrame,plannedEndFrame:row.endFrame,
    visualStartFrame:Math.round(visual.startSec*FPS),visualEndFrame:Math.round((visual.startSec+visual.durationSec)*FPS),
    nextStartFrame:index+1<plannedShots.length?Math.round(plannedShots[index+1].start*FPS):null,
  });
  const hiddenTexts=row.textFields.filter(f=>f.visibility==='hidden').flatMap(f=>String(cardProps[f.key]||'').split('\n')).filter(Boolean);
  const css=nativeCardSkin({shotId,cardId:row.cardId,humanLayout:row.humanLayout,cardProps,
    keywordEventId:reveals.events.find(e=>e.beatId===shotId&&e.field==='keyword')?.id});
  return <><style>{css}</style><WordRevealRoot beatId={shotId} hiddenTexts={hiddenTexts} mobileMinTextPx={row.mobileMinTextPx} cardId={row.cardId}>
    <Freeze frame={nativeFrame}>{children}</Freeze>
  </WordRevealRoot></>;
};
