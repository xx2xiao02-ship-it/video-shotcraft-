// Durations are seconds at the boundary, frames only on the render timeline.
export function fitVideoPlayback(durationSeconds, durationInFrames, fps = 30) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 ||
      !Number.isInteger(durationInFrames) || durationInFrames < 1 || !Number.isFinite(fps) || fps <= 0)
    throw new Error('视频素材或镜头时长无效，不能计算变速');
  const sourceFrames = Math.floor(durationSeconds * fps);
  if (sourceFrames < 2) throw new Error('视频素材不足两帧，不能变速补足镜头');
  return {durationSeconds, playbackRate:Math.min(1, (sourceFrames - 1) / durationInFrames)};
}

function materialIdentity(value) {
  return String(value).replace(/\\/g, '/').toLowerCase();
}

export function assertNoAdjacentVideoReuse(shots) {
  let previous = new Set();
  shots.forEach((shot, index) => {
    const current = new Set([shot.material, shot.media].filter(Boolean).map(materialIdentity));
    if ([...current].some(value => previous.has(value)))
      throw new Error(`第 ${index}、${index + 1} 镜连续使用同一视频素材；背景与模板内元素均须换用语义匹配素材，不得随机替换`);
    previous = current;
  });
}

export function applyVideoPlayback(shots, materials, fps = 30) {
  const byPath = new Map(materials.map(item => [materialIdentity(item.path), item]));
  return shots.map(shot => {
    const result = {...shot};
    for (const field of ['material', 'media']) {
      if (!shot[field]) continue;
      const source = byPath.get(materialIdentity(shot[field]));
      if (!source) throw new Error(`视频素材时长未核实：${shot[field]}`);
      result[`${field}Playback`] = fitVideoPlayback(source.duration_sec, shot.durationInFrames, fps);
    }
    return result;
  });
}
