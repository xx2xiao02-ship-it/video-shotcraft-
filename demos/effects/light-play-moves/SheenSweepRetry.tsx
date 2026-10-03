// sheen-sweep-retry —— 单点扫光（高标准重试）
// 深墨大卡居中，一道 45° 高光带在 40–68f 从左外扫到右外，仅此一次。
// 约束：单点(只扫主角卡)、圆角裁剪(overflow hidden)、扫前扫后完全静止。
import React from 'react';
import { useCurrentFrame, interpolate, Easing } from 'remotion';
import { G } from '../../_fixtures/Fixtures';
import {BusinessTextStage} from '../../_fixtures/BusinessTextStage';
import {skinBackground, type TemplateSkin} from '../../_fixtures/TemplateSkin';

const CARD_W = 760;
const CARD_H = 420;
const SHEEN_W = CARD_W * 1.6; // 1216

export const SheenSweepRetry: React.FC<{words?:string[];skin?:TemplateSkin;durationInFrames?:number}> = ({words,skin}) => {
  const frame = useCurrentFrame();

  // 扫光：40–68f，从卡左外(-SHEEN_W)扫到卡右外(CARD_W)，inOut(cubic)，只一次
  const sweepActive = frame >= 40 && frame <= 68;
  const x = interpolate(frame, [40, 68], [-SHEEN_W, CARD_W], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scene=(
    <div
      style={{
        width: 1920,
        height: 1080,
        background: skinBackground(skin,G.bg),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: skin?.fontFamily || 'Helvetica, Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      <div
        style={{
          width: CARD_W,
          height: CARD_H,
          background: skin?.surface || G.side,
          borderRadius: 24,
          overflow: 'hidden', // 圆角裁剪：高光带被卡的圆角裁住
          position: 'relative',
          boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
          boxSizing: 'border-box',
          padding: '64px 72px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 28,
        }}
      >
        <div
          style={{
            fontSize: skin ? 90 : 130,
            fontWeight: 800,
            color: skin?.text || '#f5f5f3',
            letterSpacing: skin ? 0 : 2,
            lineHeight: 1,
          }}
        >
          {skin ? words?.[0] : 'PRO'}
        </div>
        {skin ? words?.slice(1).map((word,i)=><div key={i} style={{fontSize:36,lineHeight:1.1,color:skin.text}}>{word}</div>) : <>
          <div style={{ height: 16, width: 380, background: G.sideBar, borderRadius: 8 }} />
          <div style={{ height: 16, width: 260, background: G.sideBar, borderRadius: 8 }} />
        </>}

        {/* 高光带：条件挂载，扫完即摘罩，收尾真静止 */}
        {sweepActive && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: SHEEN_W,
              height: CARD_H,
              transform: `translateX(${x}px)`,
              background:
                'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.32) 50%, transparent 58%)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
  return skin ? <BusinessTextStage skin={skin}>{scene}</BusinessTextStage> : scene;
};
