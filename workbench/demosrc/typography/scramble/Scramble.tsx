// scramble — Scramble Decode 乱码锁定（motion-lab 定稿转原生 Remotion）
// 每个字符先高速随机跳字（种子驱动、可复现），再从左到右逐个"锁定"为真字符，
// 锁定瞬间闪一下高亮辉光。与 typewriter 的顺序打字完全不同的质感——黑客/解密感。
// 设计坐标 480×270（DesignStage 等比放大），参数表数值以此坐标系标定。
import React from 'react';
import { DesignStage, rand, seg, useT } from '../../_fixtures/Motion';
import {skinBackground, type TemplateSkin} from '../../_fixtures/TemplateSkin';

export const SCRAMBLE_DURATION = 96; // 3200ms @30fps

const DEFAULT_TEXT = 'TEMPLATE MOTION DEMO';
const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=<>/\\';


export const Scramble: React.FC<{ text?: string; skin?: TemplateSkin }> = ({ text, skin }) => {
  const TEXT = text || DEFAULT_TEXT;
  const LINES = TEXT.split('\n');
  const pool = /[\u4e00-\u9fff]/u.test(TEXT) ? [...TEXT.replace(/[\s\p{P}]/gu, '')] : [...POOL];
  const charCount = [...TEXT.replace(/\n/gu, '')].length;
  const t = useT();
  const frame = Math.floor(t * 96);
  return (
    <DesignStage bg={skinBackground(skin, '#07080c')}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: skinBackground(skin, '#07080c'),
          fontFamily: skin?.fontFamily || '"SF Mono",Menlo,monospace',
          fontSize: Math.min(34, Math.floor(430 / Math.max(...LINES.map(line => [...line].length), 1))),
          letterSpacing: 2,
        }}
      >
        {LINES.map((line, lineIndex) => <div key={lineIndex} style={{display:'flex', minHeight:'1.25em'}}>
        {[...line].map((ch, charIndex) => {
          const i = LINES.slice(0, lineIndex).reduce((sum, previous) => sum + [...previous].length, 0) + charIndex;
          let content: string = ch;
          let color = skin?.muted || '#3d4560';
          let textShadow = 'none';
          if (ch !== ' ') {
            // 锁定时刻：从左到右基础 stagger + 种子微扰
            const lockAt = 0.25 + (i / charCount) * 0.6 + rand(i * 7) * 0.06;
            if (t < 0.06) {
              content = ' '; // 开场短暂空白
            } else if (t < lockAt) {
              // 高速跳字：每 2 帧换一个随机字符
              content = pool[Math.floor(rand(i * 131 + Math.floor(frame / 2)) * pool.length)] || ch;
            } else {
              // 锁定为真字符，锁定瞬间闪高亮辉光后回落
              const flash = 1 - seg(t, lockAt, lockAt + 0.1);
              color = flash > 0.4 ? (skin?.accent || '#dff3ff') : (skin?.text || '#e8eaf0');
              textShadow = `0 0 ${flash * 18}px ${skin?.accent || 'rgba(120,200,255,0.9)'}`;
            }
          }
          return (
            <span
              key={i}
              style={{ minWidth: '0.62em', textAlign: 'center', color, textShadow }}
            >
              {content === ' ' ? ' ' : content}
            </span>
          );
        })}</div>)}
      </div>
    </DesignStage>
  );
};
