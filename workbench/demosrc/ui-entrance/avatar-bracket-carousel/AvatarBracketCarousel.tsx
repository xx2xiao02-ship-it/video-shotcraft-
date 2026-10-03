// avatar-bracket-carousel — Bracket Carousel 对焦框头像轮换（motion-lab 定稿转原生 Remotion）
// "Your ___ teammates" 填空排版：四角对焦框锁定当前头像，头像队列垂直 spring 轮换，
// 入框放大清晰、出框缩小淡化，角色标签同步更换，两侧文字不动。
// 设计坐标 480×270（DesignStage 等比放大），参数表数值以此坐标系标定。
import React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { DesignStage, E, seg, useT } from '../../_fixtures/Motion';
import { skinBackground, type TemplateSkin } from '../../_fixtures/TemplateSkin';

export const AVATAR_BRACKET_CAROUSEL_DURATION = 156; // 5200ms @30fps

const ACCENT = '#3b82f6';

// 头像底色走中性灰阶梯度（仅用于区分队列项），强调色只留在对焦框上
type AvatarItem = {src?: string; role: string; c?: string; e?: string};
const DEFAULT_AV: AvatarItem[] = [
  { c: '#4a4d59', e: '🎨', role: 'Designer' },
  { c: '#5b6070', e: '💬', role: 'Support' },
  { c: '#6d7383', e: '📊', role: 'Analyst' },
  { c: '#828796', e: '✍️', role: 'Writer' },
];

// 四角对焦框的角路径（92×92 viewBox）
const CORNERS = ['M4,26 L4,4 L26,4', 'M66,4 L88,4 L88,26', 'M88,66 L88,88 L66,88', 'M26,88 L4,88 L4,66'];

const STEP = 76;
const SWITCHES = [0.24, 0.46, 0.68]; // 三次切换起点

export const AvatarBracketCarousel: React.FC<{avatars?: Array<{src: string; role: string}>; durationInFrames?: number; skin?: TemplateSkin}> = ({avatars, durationInFrames, skin}) => {
  const frame = useCurrentFrame();
  const normalizedT = useT();
  const t = durationInFrames ? Math.min(1, frame / Math.max(1, durationInFrames - 1)) : normalizedT;
  const AV: AvatarItem[] = avatars?.length
    ? avatars.map((avatar, index) => ({...avatar, c: DEFAULT_AV[index % DEFAULT_AV.length].c, e: DEFAULT_AV[index % DEFAULT_AV.length].e}))
    : DEFAULT_AV;
  const switchCount = Math.max(1, AV.length - 1);
  const SWITCHES = Array.from({length: switchCount}, (_, i) => 0.2 + i * (0.55 / Math.max(1, switchCount - 1)));

  // 三次切换：0.24 / 0.46 / 0.68，spring 手感
  let pos = 0;
  SWITCHES.forEach((s0) => {
    pos += seg(t, s0, s0 + 0.14, (k) => E.spring(k, 0.25));
  });

  // 切换瞬间 bracket 呼吸
  let breath = 0;
  SWITCHES.forEach((s0) => {
    breath += Math.sin(seg(t, s0, s0 + 0.1) * Math.PI);
  });

  return (
    <DesignStage bg={skinBackground(skin, '#0b0c12')}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: skinBackground(skin, '#0b0c12'),
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 22,
          fontFamily: '-apple-system,system-ui,"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        }}
      >
        <div style={{ color: '#eef1f8', fontWeight: 800, fontSize: 34, letterSpacing: -0.5 }}>Your</div>

        {/* 中央对焦框 + 头像列 */}
        <div style={{ position: 'relative', width: 92, height: 92, flex: 'none' }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
            {AV.map((a, k) => {
              const d = Math.abs(k - pos);
              const sc = Math.max(0.5, 1 - d * 0.38);
              const op = Math.max(0, 1 - d * 0.62);
              return (
                <div
                  key={k}
                  style={{
                    position: 'absolute',
                    left: -29,
                    top: -29,
                    width: 58,
                    height: 58,
                    borderRadius: '50%',
                    background: a.c,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 26,
                    boxShadow: '0 6px 18px rgba(0,0,0,.4)',
                    transform: `translateY(${(k - pos) * STEP}px) scale(${sc})`,
                    opacity: op * seg(t, 0.02 + k * 0.03, 0.12 + k * 0.03),
                    filter: `blur(${Math.min(3, d * 2.4)}px)`,
                  }}
                  >
                  {a.src ? <Img src={staticFile(a.src)} style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%'}} /> : a.e}
                </div>
              );
            })}
          </div>

          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 3,
              transform: `scale(${1 + Math.min(1, breath) * 0.07})`,
            }}
          >
            <svg width={92} height={92} viewBox="0 0 92 92">
              {CORNERS.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={skin?.accent || ACCENT} strokeWidth={4} strokeLinecap="round" />
              ))}
            </svg>
          </div>

          {/* 角色标签（只随对焦位置换透明度，位置不动） */}
          {AV.map((a, k) => (
            <div
              key={k}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%,64px)',
                color: '#8f97b3',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 1,
                opacity: Math.max(0, 1 - Math.abs(k - pos) * 2.2),
              }}
            >
              {a.role}
            </div>
          ))}
        </div>

        <div style={{ color: '#eef1f8', fontWeight: 800, fontSize: 34, letterSpacing: -0.5 }}>teammates</div>
      </div>
    </DesignStage>
  );
};
