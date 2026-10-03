// type-and-filter —— 真实 UI 上打字搜索、网格自己收敛成一张卡、点击穿透进详情页
// 功能演示的"操作叙事"段：让观众"跟着做一遍"。节奏必须像人手，不能像脚本。
// 参考实现从 template SceneFlyIn 118–190 段剥离（self-contained）：
// 相机移到搜索框，逐字符打字（3f/字符，光标常亮→闪烁），打完留一口气（11f），
// 25 张非目标卡按阅读序错峰淡出+下沉，目标卡滑到首行槽位（途中浮起+阴影变宽），
// 双圈强调色 ripple 点击确认 + 3px 描边 + 辉光，相机 16f 推进 zoom 2.2 交棒。
// 网格卡用真实纹理裁片（复用 projects-empty.png 里已有的卡），nano-lab 目标卡
// 过滤后滑到首行槽位。缺的 float-* 小块用纯色占位，不影响动效读感。
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { PageCam2D, CamKey2D } from '../../_fixtures/PageCam2D';
import layout from '../../_textures/live-layout.json';
import { skinBackground, type TemplateSkin } from '../../_fixtures/TemplateSkin';

export const TYPE_AND_FILTER_DURATION = 73; // 118–190f 落在 shot 内 offset 0

const PAGE_H = layout.projects.pageH;
const cards = layout.projects.cards;
const PAPER = '#0d0f14';
const FIELD = '#fefcf9';
const AMBER = 'oklch(58% 0.13 65)';
const TYPE_START = 10; // 118 - 118 = 0 偏移基准：scene-local 从 118 起
const FILTER_START = 42; // 160 - 118

// search box (page-space CSS px)
const SEARCH = { x: 408, y: 130, w: 1016, h: 44 };

const NANO_TO = { x: 408, y: 247 }; // first-row slot
const CLICK_C = { x: 586, y: 391 }; // click point on the settled result card

export const TypeAndFilter: React.FC<{
  query?: string;
  targetId?: string;
  texture?: string;
  durationInFrames?: number;
  skin?: TemplateSkin;
}> = ({query, targetId, texture, durationInFrames = TYPE_AND_FILTER_DURATION, skin}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const portrait = height > width;
  const canvasScale = portrait ? Math.min(0.8, (width - 64) / 1920) : 1;
  const canvasLeft = portrait ? (width - 1920 * canvasScale) / 2 : 0;
  const canvasTop = portrait ? (height - 1080 * canvasScale) / 2 : 0;
  const duration = Math.max(1, durationInFrames);
  const cue = (legacyFrame: number) => Math.round((duration - 1) * legacyFrame / (TYPE_AND_FILTER_DURATION - 1));
  const QUERY = query?.trim() || 'nano-lab';
  const target = targetId?.trim() || 'nano-lab';
  const nanoIdx = cards.findIndex((c) => c.title.includes(target));
  if (nanoIdx < 0) throw new Error(`type-and-filter 找不到业务目标卡 ${target}`);
  const nano = cards[nanoIdx];
  const leaveRank = new Map<number, number>();
  cards.forEach((_, i) => { if (i !== nanoIdx) leaveRank.set(i, leaveRank.size); });
  const typeStart = cue(TYPE_START);
  const filterStart = cue(FILTER_START);
  const camKeys: CamKey2D[] = [
    { frame: 0, cx: 960, cy: 380, zoom: 0.9 },
    { frame: cue(56), cx: 960, cy: 380, zoom: 0.9 },
    { frame: cue(72), cx: CLICK_C.x, cy: CLICK_C.y, zoom: 2.2 },
  ];

  // typed chars: one every 3 frames (unhurried)
  const typedCount =
    frame < typeStart ? 0 : Math.min(QUERY.length, Math.floor((frame - typeStart) / Math.max(1, cue(3))) + 1);
  // caret: solid while typing, blinks on an 8f cycle after, until the click
  const caretOn =
    frame >= typeStart - cue(2) &&
    frame <= cue(67) &&
    (frame <= typeStart + cue(24) || Math.floor((frame - (typeStart + cue(24))) / Math.max(1, cue(8))) % 2 === 0);

  return (
    <AbsoluteFill style={{ background: skinBackground(skin, PAPER) }}>
      <div style={{ position: 'absolute', left: canvasLeft, top: canvasTop, width: 1920, height: 1080, transform: `scale(${canvasScale})`, transformOrigin: '0 0' }}>
        <PageCam2D src={texture || 'textures/live/projects-empty.png'} pageH={PAGE_H} keys={camKeys}>
        {/* ---- 25 non-target cards: staggered fade+sink on filter ---- */}
        {cards.map((c, i) => {
          if (i === nanoIdx) return null;
          const outCue = filterStart + leaveRank.get(i)! * Math.max(1, cue(0.4));
          if (frame >= outCue + 5) return null;
          const outT = interpolate(frame, [outCue, outCue + 5], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad),
          });
          return (
            <div
              key={`${c.file}-${i}`}
              style={{
                position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h,
                transform: `translate3d(0px, ${8 * outT}px, 0px)`,
                opacity: 1 - outT, borderRadius: 16, overflow: 'hidden',
                boxShadow: '0 2px 6px rgba(60,45,30,.08)',
              }}
            >
              <Img src={staticFile(`textures/live/${c.file}`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
            </div>
          );
        })}

        {/* ---- nano-lab: slides up to the first-row slot on filter, floating ---- */}
        {(() => {
          const slideT = interpolate(frame, [filterStart, filterStart + cue(10)], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.35, 0, 0.2, 1),
          });
          const slideDy = (NANO_TO.y - nano.y) * slideT;
          const slideDx = (NANO_TO.x - nano.x) * slideT;
          const float = Math.sin(slideT * Math.PI);
          const slideScale = 1 + 0.02 * float;
          const slideZ = 18 * float;
          return (
            <div
              style={{
                position: 'absolute', left: nano.x, top: nano.y, width: nano.w, height: nano.h,
                transform: `translate3d(${slideDx}px, ${slideDy}px, ${slideZ}px) scale(${slideScale})`,
                transformOrigin: 'center center',
                boxShadow: `0 ${2 + 14 * float}px ${6 + 26 * float}px rgba(60,45,30,${0.08 + 0.1 * float})`,
                borderRadius: 16, overflow: 'hidden', zIndex: 2,
              }}
            >
              <Img src={staticFile(`textures/live/${nano.file}`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
            </div>
          );
        })()}

        {/* ---- search box: paper patch over the placeholder (keeps magnifier), typed text + caret ---- */}
        {frame >= 0 ? (
          <div
            style={{
              position: 'absolute', left: 440, top: SEARCH.y + 4,
              width: SEARCH.x + SEARCH.w - 448, height: SEARCH.h - 8,
              background: skin?.surface || FIELD, opacity: 1, pointerEvents: 'none',
            }}
          />
        ) : null}
        <div
          style={{
            position: 'absolute', left: 448, top: SEARCH.y, height: SEARCH.h,
            display: 'flex', alignItems: 'center',
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
            fontSize: 15, letterSpacing: 0.2, color: skin?.text || 'oklch(25% 0.006 82)', pointerEvents: 'none',
          }}
        >
          <span>{QUERY.slice(0, typedCount)}</span>
          {caretOn ? (
            <span style={{ display: 'inline-block', width: 2, height: 20, marginLeft: 2, background: AMBER }} />
          ) : null}
        </div>

        {/* ---- click ripple: two concentric amber rings ---- */}
        {[0, 1].map((r) => {
          const start = cue(58 + r * 3);
          if (frame < start || frame > start + cue(10)) return null;
          const t = interpolate(frame, [start, start + cue(10)], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
          });
          const rad = interpolate(t, [0, 1], [14, r === 0 ? 54 : 78]);
          return (
            <div
              key={`ripple-${r}`}
              style={{
                position: 'absolute', left: CLICK_C.x - rad, top: CLICK_C.y - rad,
                width: rad * 2, height: rad * 2, borderRadius: '50%',
                border: `2px solid ${skin?.accent || AMBER}`, opacity: 1 - t, pointerEvents: 'none', zIndex: 5,
              }}
            />
          );
        })}

        {/* ---- selected-card amber outline, lit from the click ---- */}
        {frame >= cue(60) ? (
          <div
            style={{
              position: 'absolute', left: NANO_TO.x - 6, top: NANO_TO.y - 6,
              width: nano.w + 12, height: nano.h + 12, borderRadius: 16,
              border: `3px solid ${skin?.accent || AMBER}`, boxShadow: '0 0 40px rgba(180,120,50,0.5)',
              opacity: interpolate(frame, [cue(60), cue(63)], [0.5, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              pointerEvents: 'none', zIndex: 4,
            }}
          />
        ) : null}
        </PageCam2D>
      </div>
    </AbsoluteFill>
  );
};
