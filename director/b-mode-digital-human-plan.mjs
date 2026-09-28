const normalize = value => String(value || '').replace(/\s+/gu, '');

export function planDigitalHumanUnits(text, draftScenes, timing) {
  if (!String(text || '').trim()) throw new Error('数字人计划缺少完整文案');
  if (!Array.isArray(draftScenes) || !draftScenes.length) throw new Error('数字人计划缺少已确认分镜');
  if (!Array.isArray(timing?.segments) || !timing.segments.length) throw new Error('数字人计划缺少 TTS 时间段');
  if (normalize(draftScenes.map(scene => scene?.text).join('')) !== normalize(text)) {
    throw new Error('分镜原文与输入文案不一致，请重建并确认分镜');
  }

  const mapped = [];
  let timingIndex = 0;
  let nextFrame = 0;
  for (let sceneIndex = 0; sceneIndex < draftScenes.length; sceneIndex += 1) {
    const scene = draftScenes[sceneIndex];
    const target = normalize(scene?.text);
    if (!target || !['person', 'graphics', 'material'].includes(scene?.subject)) {
      throw new Error(`第 ${sceneIndex + 1} 句尚未选择有效镜头主体`);
    }
    let actual = '';
    let fromFrame = null;
    let durationInFrames = 0;
    while (actual.length < target.length && timingIndex < timing.segments.length) {
      const part = timing.segments[timingIndex++];
      if (fromFrame === null) fromFrame = Number(part.fromFrame);
      actual += normalize(part.text);
      durationInFrames += Number(part.durationInFrames);
    }
    if (actual !== target || !Number.isInteger(fromFrame) || fromFrame !== nextFrame ||
        !Number.isInteger(durationInFrames) || durationInFrames <= 0) {
      throw new Error(`第 ${sceneIndex + 1} 句无法与 TTS 时间段闭合`);
    }
    mapped.push({sceneIndex, text: scene.text, subject: scene.subject, fromFrame, durationInFrames});
    nextFrame += durationInFrames;
  }
  if (timingIndex !== timing.segments.length) throw new Error('TTS 仍有未映射到分镜的口播内容');
  const totalFrames = mapped.reduce((sum, scene) => sum + scene.durationInFrames, 0);
  if (totalFrames !== Number(timing.totalFrames)) throw new Error('分镜总帧数与 TTS 不一致');

  const units = [];
  let current = null;
  for (const scene of mapped) {
    if (scene.subject !== 'person') {
      current = null;
      continue;
    }
    if (!current) {
      current = {index: units.length, sceneIndexes: [], scenes: [], fromFrame: scene.fromFrame, durationInFrames: 0};
      units.push(current);
    }
    current.sceneIndexes.push(scene.sceneIndex);
    current.scenes.push(scene);
    current.durationInFrames += scene.durationInFrames;
  }
  if (!units.length) throw new Error('至少需要一个数字人口播片段');
  return {mappedScenes: mapped, units};
}

