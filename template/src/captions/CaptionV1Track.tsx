import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';

export type CaptionV1Settings = {
  enabled: boolean;
  templateId: 'creator' | 'pill' | 'minimal' | 'notice' | 'impact' | 'shadow';
  position: 'top' | 'center' | 'bottom';
  fontSize: number;
  textColor: string;
  activeColor: string;
  panelColor: string;
  maxChars: number;
  fontId: 'sans' | 'serif' | 'wenkai' | 'smiley';
  panelOpacity: number;
  highlightScale: number;
};

export type TimedCaption = {text: string; startMs: number; endMs: number; highlight?: string};
type Page = {text: string; startMs: number; endMs: number; tokens: TimedCaption[]; highlight?: string};

const fonts: Record<CaptionV1Settings['fontId'], string> = {
  sans: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
  serif: '"Noto Serif SC", "Songti SC", serif',
  wenkai: '"LXGW WenKai", "Noto Sans SC", sans-serif',
  smiley: '"Smiley Sans", "Noto Sans SC", sans-serif',
};

export const makePages = (captions: TimedCaption[], maxChars: number, wordTimed: boolean): Page[] => {
  if (!wordTimed) return captions.flatMap((caption) => {
    const chars = Array.from(caption.text);
    const match = caption.highlight ? caption.text.indexOf(caption.highlight) : -1;
    const highlightStart = match < 0 ? -1 : Array.from(caption.text.slice(0, match)).length;
    const highlightEnd = highlightStart < 0 ? -1 : highlightStart + Array.from(caption.highlight!).length;
    const pages: Page[] = [];
    for (let start = 0; start < chars.length;) {
      let end = Math.min(chars.length, start + maxChars);
      if (end < chars.length) {
        const lastPause = chars.slice(start + Math.ceil(maxChars / 2), end)
          .findLastIndex(char => /[，。！？；、,:;!?]/u.test(char));
        if (lastPause >= 0) end = start + Math.ceil(maxChars / 2) + lastPause + 1;
      }
      if (highlightStart < end && end < highlightEnd) end = highlightStart > start ? highlightStart : highlightEnd;
      const duration = caption.endMs - caption.startMs;
      const token = {
        text: chars.slice(start, end).join('').trim(),
        startMs: caption.startMs + duration * start / chars.length,
        endMs: caption.startMs + duration * end / chars.length,
      };
      if (token.text) pages.push({...token, tokens: [token],
        highlight: highlightStart >= start && highlightEnd <= end ? caption.highlight : undefined});
      start = end;
    }
    return pages;
  });

  const pages: Page[] = [];
  let tokens: TimedCaption[] = [];
  const flush = () => {
    if (tokens.length) pages.push({
      text: tokens.map(token => token.text).join(''),
      startMs: tokens[0].startMs,
      endMs: tokens[tokens.length - 1].endMs,
      tokens,
    });
    tokens = [];
  };
  for (const caption of captions) {
    const previous = tokens.at(-1);
    if (previous && (caption.startMs - previous.endMs >= 420
      || caption.endMs - tokens[0].startMs > 1400
      || tokens.reduce((sum, token) => sum + Array.from(token.text).length, 0) + Array.from(caption.text).length > maxChars)) flush();
    tokens.push(caption);
  }
  flush();
  return pages;
};

export const CaptionV1Track: React.FC<{
  settings: CaptionV1Settings;
  captions: TimedCaption[];
  wordTimed: boolean;
}> = ({settings, captions, wordTimed}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const pages = useMemo(() => makePages(captions, settings.maxChars, wordTimed), [captions, settings.maxChars, wordTimed]);
  const nowMs = frame / fps * 1000;
  const page = pages.find(item => nowMs >= item.startMs && nowMs < item.endMs);
  if (!settings.enabled || !page) return null;

  const isHighlight = settings.templateId === 'creator' || settings.templateId === 'impact';
  const isNotice = settings.templateId === 'notice';
  const isMinimal = settings.templateId === 'minimal';
  const isShadow = settings.templateId === 'shadow';
  const bottomPx = height * (width < height ? 0.25 : 0.09);
  const topPx = height * 0.09;
  const background = isMinimal || isShadow ? 'transparent'
    : settings.panelColor + Math.round(settings.panelOpacity * 255 / 100).toString(16).padStart(2, '0');
  const emphasize = (text: string, active: boolean, key: number) => (
    <span key={key} style={{
      display: 'inline-block',
      color: active ? settings.activeColor : settings.textColor,
      fontSize: active ? `${settings.highlightScale}em` : undefined,
    }}>{text}</span>
  );

  return <AbsoluteFill style={{pointerEvents: 'none', zIndex: 12}}>
    <div style={{
      position: 'absolute', left: '6%', right: '6%', margin: 'auto', width: 'max-content', maxWidth: '82%',
      boxSizing: 'border-box', textAlign: 'center', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
      top: settings.position === 'top' ? topPx : settings.position === 'center' ? '50%' : undefined,
      bottom: settings.position === 'bottom' ? bottomPx : undefined,
      transform: settings.position === 'center' ? 'translateY(-50%)' : undefined,
      padding: isNotice ? '8px 18px' : '14px 28px',
      borderRadius: settings.templateId === 'pill' ? 14 : isNotice ? 2 : 6,
      fontFamily: fonts[settings.fontId], fontSize: settings.fontSize,
      fontWeight: settings.templateId === 'impact' ? 800 : 700, lineHeight: 1.45,
      letterSpacing: 1, color: settings.textColor, background,
      textShadow: isShadow ? '0 0.06em 0.12em rgba(0,0,0,0.95), 0 0.02em 0.04em rgba(0,0,0,0.9)' : isMinimal ? '0 2px 8px #000' : undefined,
    }}>
      {isHighlight && wordTimed
        ? page.tokens.map((token, index) => emphasize(token.text, nowMs >= token.startMs && nowMs < token.endMs, index))
        : isHighlight && page.highlight
          ? <>{page.text.slice(0, page.text.indexOf(page.highlight))}{emphasize(page.highlight, true, 0)}{page.text.slice(page.text.indexOf(page.highlight) + page.highlight.length)}</>
          : page.text}
    </div>
  </AbsoluteFill>;
};
