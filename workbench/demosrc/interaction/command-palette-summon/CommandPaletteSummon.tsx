// command-palette-summon —— 命令面板降临
// FakeDashboard 静置 → 整屏压暗+blur → ⌘K 面板从中心上方 20px 带 overshoot 弹落
// → 5 条候选行错峰浮现 → 模拟输入 2 字母（灰块当字符）候选 5→3→2 收窄
// → 高亮首条。f=110 后全静止（40f）。光标 f<104 闪烁、之后常亮。
import React from 'react';
import { useCurrentFrame, interpolate, Easing } from 'remotion';
import { G, FakeDashboard } from '../../_fixtures/Fixtures';
import {BusinessTextStage} from '../../_fixtures/BusinessTextStage';
import {skinBackground, type TemplateSkin} from '../../_fixtures/TemplateSkin';

const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// 时间轴
const DIM0 = 12; // 压暗开始（前 12f 初始静置）
const DIM1 = 22;
const PANEL_IN = 18; // 面板开始弹落
const ROWS_START = 32; // 候选行开始错峰浮现
const KEY1 = 62; // 第一个字母
const KEY2 = 78; // 第二个字母
const HL = 94; // 高亮首条
const BLINK_END = 104; // 光标停止闪烁（常亮）

const PANEL_W = 780;
const PANEL_X = (1920 - PANEL_W) / 2;
const PANEL_Y = 290;
const ROW_H = 72;
const ROW_GAP = 8;
const EXIT_DUR = 10;

// exitAt: 0=留到最后，1=第一次按键后退出，2=第二次按键后退出
const ROWS = [
  { titleW: 52, exitAt: 0 },
  { titleW: 38, exitAt: 0 },
  { titleW: 61, exitAt: 2 },
  { titleW: 45, exitAt: 1 },
  { titleW: 56, exitAt: 1 },
];

const PaletteRow: React.FC<{ i: number; frame: number;label?:string;query?:string;selected?:number;skin?:TemplateSkin }> = ({ i, frame,label,query,selected,skin }) => {
  const { titleW } = ROWS[i];
  const exitAt=skin ? !label?.includes(query?.slice(0,1) || '') ? 1 : !label?.includes(query || '') ? 2 : 0 : ROWS[i].exitAt;
  const inStart = ROWS_START + i * 4;
  const exitStart = exitAt === 1 ? KEY1 + 3 : exitAt === 2 ? KEY2 + 3 : null;

  if (exitStart !== null && frame >= exitStart + EXIT_DUR) return null; // 条件卸载，非 opacity 0

  const inOp = interpolate(frame, [inStart, inStart + 8], [0, 1], CL);
  const inY = interpolate(frame, [inStart, inStart + 8], [12, 0], {
    easing: Easing.out(Easing.cubic),
    ...CL,
  });
  const exitT =
    exitStart === null
      ? 1
      : interpolate(frame, [exitStart, exitStart + EXIT_DUR], [1, 0], {
          easing: Easing.inOut(Easing.cubic),
          ...CL,
        });

  // 高亮首条
  const hl = i === (skin ? selected : 0) ? interpolate(frame, [HL, HL + 10], [0, 1], CL) : 0;

  return (
    <div
      style={{
        height: (ROW_H + ROW_GAP) * exitT,
        opacity: inOp * exitT,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: ROW_H,
          borderRadius: 12,
          background: hl > 0 ? skin ? `color-mix(in srgb, ${skin.accent} ${hl*20}%, transparent)` : `rgba(228,228,226,${hl})` : 'transparent',
          boxShadow: hl > 0 ? skin ? `inset 4px 0 0 ${skin.accent}` : `inset 4px 0 0 rgba(47,47,47,${hl})` : 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '0 22px',
          boxSizing: 'border-box',
          transform: `translateY(${inY}px)`,
        }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 9, background: skin?.accent || G.mid }} />
        {skin ? <div style={{font:`600 34px ${skin.fontFamily}`,color:skin.text}}>{label}</div> : <div style={{ height: 14, width: `${titleW}%`, background: G.bar, borderRadius: 7 }} />}
        {!skin&&<div style={{ marginLeft: 'auto', width: 58, height: 24, borderRadius: 6, background: G.line }} />}
      </div>
    </div>
  );
};

export const CommandPaletteSummon: React.FC<{words?:string[];skin?:TemplateSkin;durationInFrames?:number}> = ({words,skin}) => {
  const frame = useCurrentFrame();
  const query=skin ? words?.[0] || '' : '';
  if(skin && [...query].length!==2) throw new Error('Command palette requires a two-character query');
  const labels=skin ? words?.slice(1) || [] : [];
  const selected=labels.findIndex(label=>label.includes(query));
  if(skin && (labels.length!==5 || selected<0)) throw new Error('Command palette requires five candidates and a complete query match');

  // 背景压暗 + blur
  const dim = interpolate(frame, [DIM0, DIM1], [0, 0.45], CL);
  const blur = interpolate(frame, [DIM0, DIM1], [0, 10], CL);

  // 面板弹落：上方 20px → 过冲 +8px → 落回 0
  const panelY =
    frame < PANEL_IN + 9
      ? interpolate(frame, [PANEL_IN, PANEL_IN + 9], [-20, 8], {
          easing: Easing.out(Easing.cubic),
          ...CL,
        })
      : interpolate(frame, [PANEL_IN + 9, PANEL_IN + 15], [8, 0], {
          easing: Easing.inOut(Easing.cubic),
          ...CL,
        });
  const panelOp = interpolate(frame, [PANEL_IN, PANEL_IN + 7], [0, 1], CL);

  // 模拟输入：已敲字符数
  const typed = (frame >= KEY1 ? 1 : 0) + (frame >= KEY2 ? 1 : 0);
  // 光标闪烁（周期 16f），BLINK_END 后常亮保证收尾静止
  const cursorOn = frame >= BLINK_END ? true : (frame - PANEL_IN) % 16 < 8;

  const scene=(
    <div style={{ width: 1920, height: 1080, background: skinBackground(skin,G.bg), position: 'relative', overflow: 'hidden' }}>
      <div style={{ filter: frame < DIM0 ? undefined : `blur(${blur}px)` }}>
        {skin ? <div style={{position:'absolute',left:160,top:80,width:1600,color:skin.text,fontFamily:skin.fontFamily}}>
          <h2 style={{fontSize:56}}>功能目录</h2><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:40}}>{labels.map((label,i)=><div key={i} style={{padding:40,fontSize:42,background:skin.surface,border:`2px solid ${skin.muted}`,borderRadius:8}}>{label}</div>)}</div>
        </div> : <FakeDashboard variant="A" />}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: `rgba(20,20,20,${dim})` }} />

      {frame >= PANEL_IN && (
        <div
          style={{
            position: 'absolute',
            left: PANEL_X,
            top: PANEL_Y,
            width: PANEL_W,
            transform: `translateY(${panelY}px)`,
            opacity: panelOp,
            background: skin?.surface || G.card,
            borderRadius: 18,
            border: `2px solid ${skin?.muted || G.border}`,
            boxShadow: '0 28px 90px rgba(0,0,0,0.4)',
            padding: 20,
            boxSizing: 'border-box',
          }}
        >
          {/* 输入框 */}
          <div
            style={{
              height: 76,
              borderBottom: `2px solid ${skin?.muted || G.line}`,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '0 10px 14px 10px',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 8, background: skin?.accent || G.bar }} />
            {/* 已敲入的字符灰块 */}
            {skin ? <span style={{font:`500 40px ${skin.fontFamily}`,color:skin.text}}>{[...query].slice(0,typed).join('')}</span> : Array.from({ length: typed }).map((_, c) => (
              <div key={c} style={{ width: 28, height: 38, borderRadius: 6, background: '#3a3a3a' }} />
            ))}
            {/* 光标 */}
            {cursorOn && <div style={{ width: 4, height: 42, background: skin?.text || G.ink, borderRadius: 2 }} />}
            {/* 占位提示条：敲第一个字母时卸载 */}
            {typed === 0 && (
              skin ? <span style={{font:`400 32px ${skin.fontFamily}`,color:skin.muted}}>查找功能</span> : <div style={{ width: 260, height: 14, borderRadius: 7, background: G.line, opacity: 0.8 }} />
            )}
          </div>
          {/* 候选行 */}
          <div style={{ paddingTop: 14 }}>
            {ROWS.map((_, i) => (
              <PaletteRow key={i} i={i} frame={frame} label={labels[i]} query={query} selected={selected} skin={skin} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
  return skin ? <BusinessTextStage skin={skin}>{scene}</BusinessTextStage> : scene;
};
