import {assertShortShot} from './short-card-admission.mjs';

export const OPENING_POLICY = 'short-opening-v1';

// Visual windows use overlapping original sentence context, not guessed word
// timestamps. The original narration and caption clock remain untouched.
export function openingVisualTiming(timing) {
  const end = Math.min(150, timing.totalFrames);
  const cuts = [...new Set([0,30,90,end,...timing.segments.map(s=>s.fromFrame).filter(f=>f>=end),timing.totalFrames])]
    .filter(f=>f>=0 && f<=timing.totalFrames).sort((a,b)=>a-b);
  const segments = cuts.slice(0,-1).map((fromFrame,i)=>{
    const toFrame = cuts[i+1];
    const sourceSegments = timing.segments.flatMap((s,j)=>
      s.fromFrame < toFrame && s.fromFrame+s.durationInFrames > fromFrame ? [j] : []);
    const text = sourceSegments.map(j=>{
      const source=timing.segments[j];
      const chars=[...source.text];
      const begin=Math.floor(Math.max(0,fromFrame-source.fromFrame)/source.durationInFrames*chars.length);
      const finish=Math.floor(Math.min(source.durationInFrames,toFrame-source.fromFrame)/source.durationInFrames*chars.length);
      return chars.slice(begin,finish).join('');
    }).join('');
    return {fromFrame,durationInFrames:toFrame-fromFrame,sourceSegments,text,
      contextText:sourceSegments.map(j=>timing.segments[j].text).join('')};
  });
  return {...timing,segments,openingPolicy:OPENING_POLICY};
}

export function validateOpeningShots(shots, report, fps=30, startFrame=0) {
  if (fps !== 30) throw new Error('开场验收只适用于30fps');
  let from = startFrame;
  for (const shot of shots) {
    const frames = shot.durationInFrames;
    if (!Number.isInteger(frames) || frames<1) throw new Error('视觉镜头帧数无效');
    if (from < 150) {
      if (frames > 60 || from + frames > 150) throw new Error('前5秒单镜不能超过2秒或跨越5秒边界');
      assertShortShot(shot, frames, report);
    }
    from += frames;
  }
  return shots;
}

export function restoreCaptionHighlights(original, visual, values) {
  return original.segments.map((source,j)=> {
    const candidates = visual.segments.flatMap((segment,i)=>segment.sourceSegments.includes(j) ? [values[i]] : []);
    return candidates.find(value=>typeof value==='string' && value && source.text.includes(value)) || '';
  });
}
