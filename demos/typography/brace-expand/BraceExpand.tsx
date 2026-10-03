// brace-expand — Brace Expand Reveal 括号拉幕（motion-lab 定稿转原生 Remotion）
// 一对紧贴的花括号先小字号出现在正中，随即带过冲（outBack ~8%）地向左右滑开并放大到
// 标题级，文字像被括号拉开幕布般在中间揭示（clip 宽度严格绑括号间距），落定后字距再细微松弛。
// 设计坐标 480×270（DesignStage 等比放大），参数表数值以此坐标系标定。
import React from 'react';
import { DesignStage, E, lerp, seg, useT } from '../../_fixtures/Motion';
import {skinBackground, type TemplateSkin} from '../../_fixtures/TemplateSkin';

export const BRACE_EXPAND_DURATION = 114; // 3800ms @30fps

const FONT = '-apple-system,system-ui,"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const HALF = 148; // 括号最终半距

// 默认揭示文案
const DEFAULT_WORDS = ['Your title'];

// 单只花括号：x 为当前水平偏移（左负右正），sc 为同步放大比例
const Brace: React.FC<{ ch: string; x: number; sc: number; on: number; skin?: TemplateSkin }> = ({ ch, x, sc, on, skin }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      fontWeight: 800,
      fontSize: 44,
      fontFamily: skin?.fontFamily || FONT,
      color: skin?.accent || 'var(--text)',
      transform: `translate(-50%,-50%) translateX(${x}px) scale(${sc})`,
      opacity: on,
    }}
  >
    {ch}
  </div>
);

export const BraceExpand: React.FC<{ words?: string[]; skin?: TemplateSkin }> = ({ words, skin }) => {
  const W = words && words.length > 0 ? words : DEFAULT_WORDS;
  const title = W[0] ?? DEFAULT_WORDS[0];
  const sub = W.slice(1).join(' · ');
  const t = useT();
  const on = t >= 0.07 ? 1 : 0; // 先单独出现（小字号，约 2 帧后再动）
  const ex = seg(t, 0.13, 0.34, E.outBack); // 弹开：过冲约 8% 再回弹
  const sc = lerp(ex, 0.6, 1); // 字号同步放大到标题级
  const x = HALF * ex * sc;
  // 落定后 letterspacing 细微松弛
  const titleUnits = [...title].reduce((n,ch) => n + (/[^\x00-\x7f]/.test(ch) ? 1 : 0.65),0);
  const fontSize = Math.min(38, (HALF * 2 - 42) / Math.max(titleUnits,1));
  return (
    <DesignStage bg={skinBackground(skin, '#0a0b10')}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
        {/* 文字揭示宽度严格绑括号间距（幕布感，而非打字） */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: 'translate(-50%,-50%)',
            overflow: 'hidden',
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: Math.max(0, x * 2 - 34),
            opacity: on,
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize,
              flexShrink: 0,
              fontFamily: skin?.fontFamily || FONT,
              color: skin?.text || 'var(--text)',
              whiteSpace: 'nowrap',
              letterSpacing: 0,
              transform: `scale(${sc})`,
            }}
          >
            {title}
          </div>
        </div>
        <Brace ch="{" x={-x} sc={sc} on={on} skin={skin} />
        <Brace ch="}" x={x} sc={sc} on={on} skin={skin} />
        {sub && <div style={{position:'absolute', top:46, left:0, width:420, transform:'translateX(-50%)',
          textAlign:'center', fontFamily:skin?.fontFamily || FONT, fontSize:18, color:skin?.text || 'var(--text)', opacity:seg(t, 0.4, 0.65)}}>{sub}</div>}
      </div>
    </DesignStage>
  );
};
