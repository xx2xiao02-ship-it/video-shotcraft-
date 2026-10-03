// terminal-typewriter —— 终端打字机触发
// 深色终端窗居中，"$ acme deploy --prod" 逐字符敲出（2f/字符，帧确定
// substring），方块光标 12f 方波闪 → 敲完停 12f → 回车帧：整场景 6f
// Easing.in(cubic) 急推 scale 1→3.2 向命令行推入（末 2f 加 blur）硬切到
// FakeDashboard A 全屏，1.06→1 回稳 4f 落定。收尾真静止 ≥40f。
import React from 'react';
import { useCurrentFrame, interpolate, Easing } from 'remotion';
import { G, FakeDashboard } from '../../_fixtures/Fixtures';
import {BusinessTextStage} from '../../_fixtures/BusinessTextStage';
import type {TemplateSkin} from '../../_fixtures/TemplateSkin';

const DEFAULT_CMD = 'acme deploy --prod';

// 终端窗几何
const TW = 1100;
const TH = 620;
const TL = (1920 - TW) / 2; // 410
const TT = (1080 - TH) / 2; // 230
const TITLEBAR = 52;
const PAD = 34;
// 命令行基线（推入焦点）：标题栏下第二行文字中心
const FOCUS_X = 960;
const FOCUS_Y = TT + TITLEBAR + PAD + 92; // ≈ 408

const TerminalWindow: React.FC<{ text: string; chars: number; cursorOn: boolean; skin?: TemplateSkin }> = ({ text, chars, cursorOn, skin }) => (
  <div style={{
    width: TW, height: TH, background: '#1e1e1c', borderRadius: 14,
    boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
    overflow: 'hidden', boxSizing: 'border-box',
  }}>
    {/* 标题栏：三圆点窗控（灰阶） */}
    <div style={{
      height: TITLEBAR, background: '#2a2a28', borderBottom: '1px solid #3a3a38',
      display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px',
      boxSizing: 'border-box',
    }}>
      {['#6a6a68', '#8f8f8d', '#b5b5b3'].map((c, i) => (
        <div key={i} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
      ))}
      <div style={{ margin: '0 auto', height: 10, width: 200, background: '#4a4a48', borderRadius: 5 }} />
      <div style={{ width: 72 }} />
    </div>
    {/* 内容区 */}
    <div style={{
      padding: PAD, fontFamily: 'Menlo, Consolas, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", monospace', fontSize: 40,
      color: '#d8d8d6', lineHeight: 1.5,
    }}>
      {/* 一行历史输出做上下文 */}
      <div style={{ color: '#7a7a78', fontSize: 32, marginBottom: 18 }}>{skin ? '素材工作台' : '~/acme-app (main)'}</div>
      <div style={{ display: 'flex', alignItems: 'center', whiteSpace: 'pre' }}>
        <span style={{ color: '#9f9f9d' }}>{'$ '}</span>
        <span>{text.substring(0, chars)}</span>
        <span style={{
          display: 'inline-block', width: 24, height: 48, marginLeft: 4,
          background: '#d8d8d6', opacity: cursorOn ? 1 : 0,
        }} />
      </div>
    </div>
  </div>
);

export const TerminalTypewriter: React.FC<{ text?: string; skin?: TemplateSkin; durationInFrames?: number }> = ({ text, skin }) => {
  const CMD = text || DEFAULT_CMD;
  // 时间轴（30fps，共 145f）；typeEnd 随 CMD 长度派生
  const T = {
    typeStart: 10,                       // 开始敲字
    typeEnd: 10 + CMD.length * 2,        // 2f/字符
    enter: skin ? 10 + CMD.length * 2 + 12 : 58,
    pushEnd: skin ? 10 + CMD.length * 2 + 18 : 64,
    settleEnd: skin ? 10 + CMD.length * 2 + 22 : 68,
    total: 145,                          // f68 起真静止
  };
  const frame = useCurrentFrame();

  // 帧确定打字：2f/字符
  const chars = Math.min(CMD.length, Math.max(0, Math.floor((frame - T.typeStart) / 2)));

  // 方块光标 12f 周期方波闪（全程）
  const cursorOn = frame % 12 < 6;

  // 回车急推：整场景 scale 1→3.2，6f Easing.in(cubic)，向命令行推入
  const pushScale = interpolate(frame, [T.enter, T.pushEnd], [1, 3.2], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  // 末 2f 运动模糊（f62–f64），硬切后摘罩=条件挂载
  const pushBlur = interpolate(frame, [T.pushEnd - 2, T.pushEnd], [0, 10], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // 硬切：f64 起终端场景整体卸载，dashboard 挂载
  const cut = frame >= T.pushEnd;

  // dashboard 落定：1.06→1 回稳 4f
  const dashScale = interpolate(frame, [T.pushEnd, T.settleEnd], [1.06, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const content = (
    <div style={{ width: 1920, height: 1080, background: skin ? 'transparent' : G.bg, position: 'relative', overflow: 'hidden' }}>
      {!cut ? (
        <div style={{
          width: 1920, height: 1080,
          transform: `scale(${pushScale})`,
          transformOrigin: `${FOCUS_X}px ${FOCUS_Y}px`,
          ...(pushBlur > 0 ? { filter: `blur(${pushBlur}px)` } : {}),
        }}>
          <div style={{ position: 'absolute', left: TL, top: TT }}>
            <TerminalWindow text={CMD} chars={chars} cursorOn={cursorOn} skin={skin} />
          </div>
        </div>
      ) : (
        <div style={{
          width: 1920, height: 1080,
          transform: `scale(${dashScale})`,
          transformOrigin: '960px 540px',
        }}>
          {skin ? <div style={{position:'absolute',left:260,right:260,top:460,textAlign:'center',
            color:skin.text,fontFamily:skin.fontFamily,fontSize:86,fontWeight:700}}>{CMD}</div> : <FakeDashboard variant="A" />}
        </div>
      )}
    </div>
  );
  return skin ? <BusinessTextStage skin={skin}>{content}</BusinessTextStage> : content;
};
