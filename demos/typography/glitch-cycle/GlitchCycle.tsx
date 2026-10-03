// glitch-cycle — Glitch Cycle 乱码轮播（motion-lab 定稿转原生 Remotion）
// 同一位置循环轮播状态短语，每条短语头尾乱码、中段偶发轻微抖动
// （glitch 概率关键帧 [1,0,0,0.1,0,0,1]，最后一条结尾收为 0 保证 t=1 画面干净），
// 切换瞬间伴随 RGB 分离与位移抖动；底部细进度条随 t 匀速填满。
// 设计坐标 480×270（DesignStage 等比放大），参数表数值以此坐标系标定。
import React from 'react';
import { DesignStage, lerp, rand, useT } from '../../_fixtures/Motion';
import {skinBackground, type TemplateSkin} from '../../_fixtures/TemplateSkin';

export const GLITCH_CYCLE_DURATION = 168; // 5600ms @30fps

const DEFAULT_PHRASES = ['INITIALIZING', 'LOADING ASSETS', 'COMPILING SHADERS', 'READY TO SHIP'];
const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&<>/\\';
// glitch 概率关键帧 [1,0,0,0.1,0,0,1]（最后一条结尾收为 0，保证 t=1 画面干净）
const KF = [1, 0, 0, 0.1, 0, 0, 1];
const KF_LAST = [1, 0, 0, 0.1, 0, 0, 0];

// 关键帧折线采样：p∈[0,1] 映射到 kf 段内线性插值
const glitchAt = (kf: number[], p: number) => {
  const segs = kf.length - 1;
  const x = Math.min(segs - 1e-6, Math.max(0, p * segs));
  const i = Math.floor(x);
  return lerp(x - i, kf[i], kf[i + 1]);
};

export const GlitchCycle: React.FC<{ words?: string[]; skin?: TemplateSkin }> = ({ words, skin }) => {
  const PHRASES = words && words.length > 0 ? words : DEFAULT_PHRASES;
  const MAXCH = Math.max(...PHRASES.map((p) => p.length));
  const t = useT();
  const N = PHRASES.length;
  const slot = Math.min(N - 1, Math.floor(t * N));
  const p = t * N - slot; // 短语内进度 0..1
  const text = PHRASES[slot];
  const g = glitchAt(slot === N - 1 ? KF_LAST : KF, p);
  const frame = Math.floor(t * 168);
  const bucket = Math.floor(frame / 2); // 乱码跳字节流：每 2 帧换一批随机字符
  // 整行抖动 + RGB 分离，强度跟随 glitch 概率
  const jx = (rand(bucket * 5 + slot) - 0.5) * g * 10;
  const jy = (rand(bucket * 9 + slot + 40) - 0.5) * g * 4;
  return (
    <DesignStage bg={skinBackground(skin, '#0a0b10')}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: skin ? 'transparent' : '#0a0b10',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: skin?.fontFamily || '"SF Mono",Menlo,monospace',
            fontSize: skin ? Math.min(36, 390 / MAXCH) : 26,
            letterSpacing: skin ? 0 : 3,
            color: skin?.text || '#dfe6f5',
            transform: `translate(${jx}px,${jy}px)`,
            textShadow:
              g > 0.04
                ? `${g * 3}px 0 rgba(255,60,90,${g * 0.8}), ${-g * 3}px 0 rgba(60,220,255,${g * 0.8})`
                : 'none',
          }}
        >
          {Array.from({ length: MAXCH }, (_, i) => {
            const ch = i < text.length ? text[i] : ' ';
            let content = ch;
            let color: string | undefined;
            if (ch !== ' ') {
              // 逐字符按种子掷 glitch：命中显示乱码 + 变色，未命中显示真字符
              const hit = rand(i * 31 + bucket * 17 + slot * 97) < g;
              if (hit) {
                content = POOL[Math.floor(rand(i * 131 + bucket * 7 + slot * 13) * POOL.length)];
                color = rand(i + bucket) > 0.5 ? (skin?.accent || '#6c8cff') : (skin?.muted || '#4a5270');
              } else {
                color = skin?.text || '#dfe6f5';
              }
            }
            return (
              <span key={i} style={{ minWidth: skin ? '1em' : '0.66em', textAlign: 'center', color }}>
                {content}
              </span>
            );
          })}
        </div>
      </div>
      {/* 底部细进度条：随 t 匀速填满 */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '63%',
          width: 120,
          height: 2,
          marginLeft: -60,
          background: skin?.surface || '#232840',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <div style={{ height: '100%', width: `${t * 100}%`, background: skin?.accent || '#6c8cff' }} />
      </div>
    </DesignStage>
  );
};
