// hatch-depth — Hatch → Depth Chart 斜纹柱实体化（motion-lab 定稿转原生 Remotion）
// 标签下的斜纹条逐条 wipe 伸长（保持 45° 斜纹占位质感），随后斜纹层淡出、强调色
// 实心层淡入，蜕变为数据横柱条形图——几何无跳变、只换纹理与颜色，讲"占位变真数据"的隐喻。
// 设计坐标 480×270（DesignStage 等比放大），参数表数值以此坐标系标定。
import React from 'react';
import {useCurrentFrame} from 'remotion';
import { DesignStage, E, seg, useT } from '../../_fixtures/Motion';
import {skinBackground, type TemplateSkin} from '../../_fixtures/TemplateSkin';

export const HATCH_DEPTH_DURATION = 132; // 4400ms @30fps

const ACCENT = '#5B8DEF'; // 模板强调色，可按项目替换
const ACCENT_HI = '#8FB2F7'; // 同族高亮（数值文字）

const ROWS = [
  { label: 'SERIES_A', w: 0.85 },
  { label: 'SERIES_B', w: 0.55 },
  { label: 'GROUP_C', w: 0.95 },
  { label: 'GROUP_D', w: 0.4 },
  { label: 'OTHER_E', w: 0.7 },
];

// 头部信息条里的 &nbsp;&nbsp;（连续普通空格在 JSX 会被折叠，须用不换行空格）
const NBSP2 = '  ';

export const HatchDepth: React.FC<{rows?: {label:string;value:number}[]; unit?:string; title?:string; skin?:TemplateSkin; durationInFrames?:number}> = ({rows,unit = '',title,skin,durationInFrames}) => {
  const compositionT = useT();
  const frame = useCurrentFrame();
  const short = Boolean(rows && durationInFrames === 60);
  const t = durationInFrames ? Math.min(1,frame / Math.max(1,durationInFrames - 1)) : compositionT;
  const maximum = Math.max(...(rows || []).map(row => row.value),1);
  const content = rows ? rows.map(row => ({...row,w:row.value / maximum * 0.85})) : ROWS.map(row => ({...row,value:Math.round(row.w * 420)}));
  const rowGap = rows && rows.length > 3 ? 10 : rows ? 20 : 13;
  const rowHeight = rows && rows.length > 3 ? 22 : 26;
  const chartHeight = content.length * rowHeight + (content.length - 1) * rowGap;
  // 头部信息条：下滑入场
  const headIn = short ? seg(frame, 0, 8, E.outCubic) : seg(t, 0.62, 0.78, E.outCubic);
  return (
    <DesignStage bg={skinBackground(skin,'#0d0f14')}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: skinBackground(skin,'#0d0f14'),
          padding: '36px 60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: rowGap,
          // 原栈 SF Mono 对无头 Chrome 不可见，真实 Chrome 落到 macOS 默认
          // 等宽字体 Courier（衬线打字机形）；显式补 Courier 兜底对齐原片
          fontFamily: skin?.fontFamily || '"SF Mono",Courier,monospace',
        }}
      >
        {content.map(({ label, w, value }, i) => {
          // 逐条 wipe 伸长 → 斜纹淡出/实心淡入 → 末段轻微 wiggle
          // Short version: two bars finish by f30, then hold for a full second.
          const grow = short ? seg(frame, 4 + i * 4, 18 + i * 4, E.outCubic) : seg(t, 0.06 + i * 0.05, 0.06 + i * 0.05 + 0.22, E.outCubic);
          const morph = short ? seg(frame, 20 + i * 2, 28 + i * 2) : seg(t, 0.5 + i * 0.03, 0.5 + i * 0.03 + 0.14);
          const wiggle = rows ? 1 : 1 + Math.sin(t * 30 + i * 2.1) * 0.02 * seg(t, 0.7, 0.85);
          const wPct = grow * w * 100 * wiggle;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, height: rowHeight }}>
              <span
                style={{
                  color: skin?.text || (morph > 0.5 ? '#5c626f' : '#8b91a3'),
                  fontSize: rows ? Math.min(16,96 / [...label].length) : 11,
                  width: rows ? 100 : 70,
                  flex: 'none',
                  textAlign: 'right',
                }}
              >
                {label}
              </span>
              <div style={{ position: 'relative', height: '100%', flex: 1 }}>
                {/* 斜纹占位层 */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${wPct}%`,
                    borderRadius: 3,
                    background: 'repeating-linear-gradient(45deg,#565860 0 4px,transparent 4px 9px)',
                    border: '1px solid #565860',
                    // 原渲染无全局 border-box：宽高为内容尺寸，1px 边框外扩
                    // （斜纹相位随元素尺寸变化，box-sizing 不还原相位就对不上）
                    boxSizing: 'content-box',
                    opacity: 1 - morph,
                  }}
                />
                {/* 强调色实心层 */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${wPct}%`,
                    borderRadius: 3,
                    background: skin?.accent || `linear-gradient(90deg,${ACCENT},${ACCENT_HI})`,
                    opacity: morph,
                  }}
                />
                {/* 柱端数值 */}
                <span
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: skin?.text || ACCENT_HI,
                    fontSize: rows ? 16 : 10,
                    whiteSpace: 'nowrap',
                    left: `calc(${wPct}% + 8px)`,
                    opacity: morph,
                  }}
                >
                  {Math.round(value * grow)}{rows ? unit : 'K'}
                </span>
              </div>
            </div>
          );
        })}
        {/* 头部信息条 */}
        <div
          style={{
            position: 'absolute',
            top: rows ? `calc(50% - ${chartHeight / 2 + 42}px)` : 20,
            left: 60,
            fontWeight: 600,
            fontSize: 12,
            fontFamily: '"SF Mono",Courier,monospace', // 同上：Courier 兜底
            letterSpacing: 1,
            transform: `translateY(${-30 + headIn * 30}px)`,
            opacity: headIn,
          }}
        >
          {rows ? <span style={{color:skin?.text || '#e8eaf0',fontFamily:skin?.fontFamily,fontSize:22,letterSpacing:0}}>{title}</span> : <><span style={{ color: '#e8eaf0', fontWeight: 700 }}>METRICS</span>
          {NBSP2}
          <span style={{ color: '#67d17c' }}>● LIVE</span>
          {NBSP2}
          <span style={{ color: '#8b91a3' }}>TOTAL 875K{NBSP2}AVG 1.02M</span></>}
        </div>
      </div>
    </DesignStage>
  );
};
