// countdown-arc-scatter — Countdown Arc 表盘数字扫过（motion-lab 定稿转原生 Remotion）
// 白底表盘：等大深色数字沿同一大弧切向排布，整盘扫过 ~96° 减速急停（数字随位置角在
// 弧两端淡入/淡出），短刻度线同步回正；"5" 停上弧顶后落位成标题首字符，
// "min / to / install" 逐词模糊淡入，结尾整词转强调色（末双字母收尾的染色手法保留）。
// 设计坐标 480×270（DesignStage 等比放大），参数表数值以此坐标系标定。
import React from 'react';
import { DesignStage, E, lerp, seg, useT } from '../../_fixtures/Motion';
import {skinBackground, type TemplateSkin} from '../../_fixtures/TemplateSkin';

export const COUNTDOWN_ARC_SCATTER_DURATION = 33; // 1100ms @30fps

const INK = '#17181c';
const ACCENT_RGB = [59, 130, 246]; // #3b82f6
const R0 = 150; // 弧半径
const SP = 24; // 相邻数字角距
// i=6 是 "5"，落位时角度归零停在弧顶
const NUMS = [45, 35, 28, 22, 17, 10, 5, 4, 3];
// "5" 落位的目标点（相对 pivot）
const TARGET = { x: -148, y: -30 };

// 数字/标题共用的字形
const NUM_FONT: React.CSSProperties = {
  color: INK,
  fontWeight: 600,
  fontSize: 40,
  letterSpacing: '-0.5px',
  whiteSpace: 'nowrap',
};

// 逐词模糊淡入的时间窗：min → to → install
const DEFAULT_WORDS: { text: string; mr: number; win: [number, number] }[] = [
  { text: 'min', mr: 11, win: [0.54, 0.68] },
  { text: 'to', mr: 11, win: [0.62, 0.78] },
  { text: 'install', mr: 0, win: [0.7, 0.9] },
];

const mix = (k: number, a: number, b: number) => Math.round(lerp(k, a, b));

export const CountdownArcScatter: React.FC<{ words?: string[]; skin?: TemplateSkin; durationInFrames?: number }> = ({ words, skin }) => {
  const t = useT();
  const target = skin ? Number(words?.[0]) : 5;
  const labels = skin ? words?.slice(1) : words;
  const nums = skin ? NUMS.map(n=>n===5?target:n===4?Math.max(0,target-1):n===3?Math.max(0,target-2):n+target-5) : NUMS;
  const numberWidth = skin ? String(target).length * 24 : 24;
  const titleWidth = skin ? numberWidth + (labels?.join('').length || 0)*40 + 22 : 0;
  const targetX = skin ? -titleWidth/2 + numberWidth/2 : TARGET.x;
  // 由注入 words 重建逐词元数据：保留 mr（词间距）与 win（模糊淡入时间窗）的错峰节奏
  const resolvedWords: { text: string; mr: number; win: [number, number] }[] =
    labels && labels.length > 0
      ? labels.map((text, i, arr) => {
          const n = arr.length;
          const start = 0.54 + (i / Math.max(1, n - 1)) * 0.16;
          return {
            text,
            mr: i === n - 1 ? 0 : 11,
            win: [start, Math.min(0.9, start + 0.16)] as [number, number],
          };
        })
      : DEFAULT_WORDS;
  // 整盘扫过：+96° → 0°，outCubic 减速急停
  const rot = lerp(seg(t, 0, 0.52, E.outCubic), 96, 0);
  const hand = seg(t, 0.52, 0.7, E.inOutCubic); // "5" 落位平移
  const out = seg(t, 0.5, 0.7, E.inQuad); // 其余数字原地淡出
  // 结尾整词（末双字母收尾）转强调色 #17181c → ACCENT
  const bl = seg(t, 0.84, 0.98);
  return (
    <DesignStage bg={skinBackground(skin,'#fff')}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: skin ? 'transparent' : '#fff',
          overflow: 'hidden',
          fontFamily: skin?.fontFamily || '-apple-system,system-ui,"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        }}
      >
        {/* pivot：所有元素都以它为原点定位 */}
        <div style={{ position: 'absolute', left: '50%', top: '58%', width: 0, height: 0 }}>
          {nums.map((n, i) => {
            const is5 = i === 6;
            const pa = (i - 6) * SP + rot; // 当前位置角
            const rad = (pa * Math.PI) / 180;
            let x = Math.sin(rad) * R0;
            let y = -Math.cos(rad) * R0;
            let rSelf = pa; // 切向排布：随位置角自转
            let op = Math.max(0, Math.min(1, (70 - Math.abs(pa)) / 22)); // 弧两端淡入淡出
            if (is5) {
              x = lerp(hand, x, targetX);
              y = lerp(hand, y, TARGET.y);
              rSelf *= 1 - hand;
            } else {
              op *= 1 - out;
            }
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  ...NUM_FONT,
                  color: skin?.text || INK,
                  letterSpacing: skin ? 0 : NUM_FONT.letterSpacing,
                  opacity: op,
                  transform: `translate(-50%,-50%) translate(${x}px,${y}px) rotate(${rSelf}deg)`,
                  // "5" 不模糊；其余数字随淡出同步糊化
                  filter: is5 ? undefined : `blur(${out * 3}px)`,
                }}
              >
                {n}
              </div>
            );
          })}
          {/* 短刻度指针（深色细线，随盘转动回正） */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 0,
              height: 0,
              transform: `rotate(${rot * 0.35}deg)`,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: -1.5,
                top: -101,
                width: 3,
                height: 26,
                borderRadius: 2,
                background: skin?.text || INK,
                opacity: 1 - out,
              }}
            />
          </div>
          {/* 标题（相对 pivot 定位，中性占位文案），"5" 落到其左端 */}
          <div
            style={{
              position: 'absolute',
              left: skin ? targetX+numberWidth/2+11 : -124,
              top: -30,
              transform: 'translateY(-50%)',
              ...NUM_FONT,
              color: skin?.text || INK,
              letterSpacing: skin ? 0 : NUM_FONT.letterSpacing,
            }}
          >
            {resolvedWords.map(({ text, mr, win }, k) => {
              const p = seg(t, win[0], win[1], E.outCubic);
              const isLast = k === resolvedWords.length - 1;
              return (
                <span
                  key={k}
                  style={{
                    display: 'inline-block',
                    marginRight: mr || undefined,
                    opacity: p,
                    filter: `blur(${(1 - p) * 6}px)`,
                    color: skin ? (isLast && bl>0.5 ? skin.accent : skin.text) : isLast
                      ? `rgb(${mix(bl, 23, ACCENT_RGB[0])},${mix(bl, 24, ACCENT_RGB[1])},${mix(bl, 28, ACCENT_RGB[2])})`
                      : undefined,
                  }}
                >
                  {text}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </DesignStage>
  );
};
