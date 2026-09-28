const normalize = (text) => text.replace(/\s+/gu, '');
const SUBJECTS = new Set(['person', 'graphics', 'material']);

export function mapPlaceholderScenes(text, draftScenes, timing) {
  if (!Array.isArray(draftScenes) || !draftScenes.length || !Array.isArray(timing.segments) || !timing.segments.length) {
    throw new Error('占位测试缺少已确认分镜或 TTS 时间段');
  }
  if (normalize(draftScenes.map(scene => scene.text).join('')) !== normalize(text)) {
    throw new Error('分镜原文与输入文案不一致，请重建并确认分镜');
  }

  let timingIndex = 0;
  const scenes = draftScenes.map((scene, index) => {
    if (!SUBJECTS.has(scene.subject)) throw new Error(`第 ${index + 1} 句尚未选择镜头主体`);
    const target = normalize(scene.text);
    let actual = '';
    const first = timing.segments[timingIndex];
    if (!first || !target) throw new Error(`第 ${index + 1} 句无法与 TTS 对齐`);
    let durationInFrames = 0;
    while (actual.length < target.length && timingIndex < timing.segments.length) {
      const part = timing.segments[timingIndex++];
      actual += normalize(part.text);
      durationInFrames += part.durationInFrames;
    }
    if (actual !== target) throw new Error(`第 ${index + 1} 句与 TTS 断句不一致`);
    if (scene.videoPath && index > 0 && scene.videoPath === draftScenes[index - 1]?.videoPath) {
      throw new Error(`第 ${index + 1} 个镜头不能与上一镜头使用同一视频素材`);
    }
    return {text: scene.text, subject: scene.subject, videoPath:scene.videoPath || null,
      subtitle:typeof scene.subtitle === 'string' ? scene.subtitle.trim() : '',
      visualText:typeof scene.visualText === 'string' ? scene.visualText.trim() : '',
      fromFrame: first.fromFrame, durationInFrames};
  });

  if (timingIndex !== timing.segments.length) throw new Error('TTS 仍有未映射到分镜的口播内容');
  let end = 0;
  for (const scene of scenes) {
    if (scene.fromFrame !== end || scene.durationInFrames <= 0) throw new Error('分镜帧段未连续闭合');
    end += scene.durationInFrames;
  }
  if (end !== timing.totalFrames) throw new Error('分镜总帧数与 TTS 不一致');
  return scenes;
}

export function countPersonUnits(scenes) {
  let units = 0;
  let active = false;
  for (const scene of scenes) {
    if (scene.subject === 'person') {
      if (!active) units++;
      active = true;
    } else active = false;
  }
  return units;
}
