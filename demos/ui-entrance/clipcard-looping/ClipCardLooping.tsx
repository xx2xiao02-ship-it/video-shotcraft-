// clipcard-looping —— ClipCard 交叉淡化循环回归卡
// 覆盖维护者 review 点名的三个边界场景：
//   1) 未静音(muted=false)的交叉淡化循环——出层/入层音量互补淡入,不在重叠区
//      叠加两条全量音轨;
//   2) startFrom>0 与 loop 组合——有效循环步长 = loopDurationInFrames - startFrom,
//      否则每层从 startFrom 起播、按全长步进,会在素材尾部冻结;
//   3) 短 Sequence 嵌在长 Composition 里——层数按 shot 时长(durationInFrames prop)
//      计算,而非 Composition 总时长,不会生成永远不会被看见的层。
//
// 素材：ClipCard 的 src 是 public/ 下的真实 mp4。渲染本 demo 前先把一段
// 短视频放到项目的 public/clips/clipcard-demo.mp4（建议 30fps、方形）。
// 三个场景共用同一段素材,但用不同参数驱动,方便对照回放。
import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { ClipCard } from '../../../assets/lib/ClipCard';

export const CLIPCARD_LOOPING_DURATION = 120; // 4s @30fps
const CLIP = 'clips/clipcard-demo.mp4';

// P3 组件媒体输入：外部素材单卡模式（src 传入用户素材 URL 时）——承载"素材进组件画面"
export const ClipCardLooping: React.FC<{
  src?: string;
  caption?: string;
  durationInFrames?: number;
}> = ({ src, caption, durationInFrames }) => {
  if (src) {
    const d = durationInFrames || 120;
    return (
      <AbsoluteFill style={{ background: '#0b0b0f', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <ClipCard
          src={src}
          muted
          loopDurationInFrames={Math.max(30, Math.min(60, Math.round(d * 0.5)))}
          loopCrossfadeInFrames={10}
          durationInFrames={d}
          size={Math.max(360, Math.min(640, Math.round(d * 4.2)))}
          caption={caption || ''}
          captionSize={Math.min(22, Math.max(14, Math.round(d / 8)))}
        />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill
      style={{
        background: '#0b0b0f',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 36,
      }}
    >
      {/* 场景 1：muted=false + loop —— 音量互补淡入,不出双音叠层 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <ClipCard
          src={CLIP}
          muted={false}
          loopDurationInFrames={60}
          loopCrossfadeInFrames={10}
          durationInFrames={120}
          size={200}
          caption="muted=false · loop"
          captionSize={11}
        />
        {/* 场景 2：startFrom=12 + loop —— 有效步长 60-12=48 */}
        <ClipCard
          src={CLIP}
          muted
          startFrom={12}
          loopDurationInFrames={60}
          loopCrossfadeInFrames={10}
          durationInFrames={120}
          size={200}
          caption="startFrom=12 · loop"
          captionSize={11}
        />
      </div>

      {/* 场景 3：短 Sequence(120f)嵌进长 Composition(未传 durationInFrames,
          层数从 useVideoConfig 的 composition 时长算 → 需显式传 durationInFrames;
          这里用 Sequence 包一层模拟"短 shot 长工程"的结构) */}
      <Sequence name="short-shot" from={0} durationInFrames={120} layout="none">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <ClipCard
            src={CLIP}
            muted
            loopDurationInFrames={45}
            loopCrossfadeInFrames={8}
            durationInFrames={120}
            size={200}
            caption="45f clip · 120f shot"
            captionSize={11}
          />
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
