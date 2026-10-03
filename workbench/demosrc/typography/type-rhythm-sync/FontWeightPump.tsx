// 字重脉冲（font-weight-pump）——标题笔画随节拍变粗又弹回，像文字跟着低音鼓蹦迪。
// 节拍每 20f 一拍：帧 30/50/70/90/110 命中。命中瞬间 -webkit-text-stroke 0→10px
// 跳满，随后 10f 幂衰减 (1-t/10)^0.8 弹回 0；fontWeight 在命中窗口 400→900 离散跳变
// （env>0.15），配合 stroke 连续衰减读作"连续变粗"。第 3、5 拍（帧 70/110）为重音，
// 额外 scaleX 1→1.08 同衰减（transform 缩放不改排版）。底部 5 个节拍点作节拍参照。
// 结构：0–29f 静止 hold；30–119f 五拍脉冲；120–139f 真静止收尾（20f，110+10=120 无残留）。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { G } from '../../_fixtures/Fixtures';
import {BusinessTextStage} from '../../_fixtures/BusinessTextStage';
import {type TemplateSkin} from '../../_fixtures/TemplateSkin';

const BEATS = [30, 50, 70, 90, 110];
const ACCENTS = new Set([2, 4]); // 第 3、5 拍重音
const DECAY = 10; // 衰减帧数
const DEFAULT_TEXT = 'PUMP IT UP';

// 命中后 10f 幂衰减包络：t=0 → 1，t>=10 → 精确 0（保证结尾真静止）
const envAt = (frame: number, beat: number) => {
  const t = frame - beat;
  if (t < 0 || t >= DECAY) return 0;
  return Math.pow(1 - t / DECAY, 0.8);
};

export const FontWeightPump: React.FC<{ text?: string;skin?:TemplateSkin;durationInFrames?:number }> = ({ text,skin }) => {
  if(skin && (!text?.trim() || /[\r\n]/.test(text) || [...text].length>8)) throw new Error('FontWeightPump requires one business title of at most eight characters');
  const frame = useCurrentFrame();
  const TEXT = text || DEFAULT_TEXT;

  // 只可能有一个活跃拍（拍距 20f > 衰减 10f），取最大包络及其拍序号
  let env = 0;
  let activeBeat = -1;
  BEATS.forEach((b, i) => {
    const e = envAt(frame, b);
    if (e > env) {
      env = e;
      activeBeat = i;
    }
  });

  const strokeW = (skin ? 3 : 10) * env; // 中文内腔保留可读性，默认演示沿用10px。
  const weight = env > 0.15 ? 900 : 400; // 命中窗口离散跳字重
  const accent = activeBeat >= 0 && ACCENTS.has(activeBeat);
  const scaleX = accent ? 1 + 0.08 * env : 1; // 重音拍变宽一挡

  const scene = (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: skin?.bg || G.bg,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: skin?.fontFamily || 'Helvetica, Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      {/* 定宽居中容器，transform 缩放不改排版 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: 150,
            fontWeight: weight,
            color: skin?.text || G.ink,
            letterSpacing: skin ? 0 : 6,
            whiteSpace: 'nowrap',
            WebkitTextStroke: `${strokeW}px ${skin?.text || G.ink}`,
            transform: `scaleX(${scaleX})`,
            transformOrigin: 'center center',
          }}
        >
          {TEXT}
        </div>
      </div>

      {/* 底部节拍点：5 个，命中哪拍哪个点闪 ink 并放大 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: skin ? 260 : 130,
          width: 1920,
          display: 'flex',
          justifyContent: 'center',
          gap: 56,
        }}
      >
        {BEATS.map((b, i) => {
          const e = envAt(frame, b);
          const dotOpacity = e > 0.02 ? Math.min(1, 0.3 + e * 1.2) : 0;
          const dotScale = 1 + 0.8 * e;
          return (
            <div
              key={i}
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                background: skin?.muted || G.line,
                position: 'relative',
                transform: `scale(${dotScale})`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 13,
                  background: skin?.accent || G.ink,
                  opacity: dotOpacity,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
  return skin ? <BusinessTextStage skin={skin}>{scene}</BusinessTextStage> : scene;
};
