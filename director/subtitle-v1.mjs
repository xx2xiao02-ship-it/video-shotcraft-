import fs from "node:fs";
import path from "node:path";

const templates = ["creator", "pill", "minimal", "notice", "impact", "shadow"];
const positions = ["top", "center", "bottom"];
const fonts = ["sans", "serif", "wenkai", "smiley"];
const hex = /^#[0-9a-fA-F]{6}$/;

const horizontalDefault = {
  enabled: true, templateId: "creator", position: "bottom", fontSize: 52,
  textColor: "#ffffff", activeColor: "#ffd34d", panelColor: "#07101e",
  maxChars: 22, fontId: "sans", panelOpacity: 85, highlightScale: 1.2,
};
const verticalDefault = {...horizontalDefault, fontSize: 46, maxChars: 12};

export const subtitleSettingsPath = root => path.join(root, "director", "subtitle-v1-settings.json");

const withDefaults = (value, fallback) => ({
  ...fallback, ...value, fontId: value?.fontId || fallback.fontId,
  panelOpacity: value?.panelOpacity ?? (value?.templateId === "notice" ? 90 : value?.templateId === "minimal" ? 0 : fallback.panelOpacity),
  highlightScale: value?.highlightScale ?? (value?.templateId === "impact" ? 1.35 : fallback.highlightScale),
});

export function normalizeSubtitleSettings(saved) {
  const horizontal = withDefaults(saved?.horizontal || (saved?.templateId ? saved : null), horizontalDefault);
  const vertical = withDefaults(saved?.vertical, verticalDefault);
  vertical.fontId = horizontal.fontId;
  return {horizontal, vertical};
}

export function readSubtitleSettings(root) {
  const file = subtitleSettingsPath(root);
  return normalizeSubtitleSettings(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);
}

const valid = s => s && typeof s.enabled === "boolean" && templates.includes(s.templateId) && positions.includes(s.position)
  && Number.isInteger(s.fontSize) && s.fontSize >= 28 && s.fontSize <= 96
  && Number.isInteger(s.maxChars) && s.maxChars >= 8 && s.maxChars <= 40
  && fonts.includes(s.fontId) && Number.isInteger(s.panelOpacity) && s.panelOpacity >= 0 && s.panelOpacity <= 100
  && typeof s.highlightScale === "number" && Number.isFinite(s.highlightScale) && s.highlightScale >= 1 && s.highlightScale <= 1.8
  && hex.test(s.textColor) && hex.test(s.activeColor) && hex.test(s.panelColor);

const clean = s => ({
  enabled: s.enabled, templateId: s.templateId, position: s.position, fontSize: s.fontSize,
  textColor: s.textColor, activeColor: s.activeColor, panelColor: s.panelColor,
  maxChars: s.maxChars, fontId: s.fontId, panelOpacity: s.panelOpacity, highlightScale: s.highlightScale,
});

export function validateSubtitleSettings(body) {
  if (!valid(body?.horizontal) || !valid(body?.vertical) || body.horizontal.fontId !== body.vertical.fontId) {
    throw new Error("字幕参数无效");
  }
  return {horizontal: clean(body.horizontal), vertical: clean(body.vertical)};
}

export function writeSubtitleSettings(root, body) {
  const settings = validateSubtitleSettings(body);
  fs.writeFileSync(subtitleSettingsPath(root), JSON.stringify(settings, null, 2), "utf8");
  return settings;
}

export function normalizeCaptionInput(raw) {
  const source = Array.isArray(raw) ? raw : raw?.captions || raw?.words || raw?.segments || [];
  const captions = [];
  const warnings = [];
  let previousStartMs = -Infinity;
  source.forEach((item, itemIndex) => {
    const entries = Array.isArray(item?.words) ? item.words : [item];
    entries.forEach((entry, entryIndex) => {
      const frameTimed = entry?.fromFrame != null || entry?.durationInFrames != null;
      if (frameTimed && (!Number.isFinite(raw?.fps) || raw.fps <= 0 ||
          !Number.isInteger(entry.fromFrame) || entry.fromFrame < 0 ||
          !Number.isInteger(entry.durationInFrames) || entry.durationInFrames < 1)) {
        throw new Error(`字幕帧时间无效: ${itemIndex}.${entryIndex}`);
      }
      const startMs = frameTimed ? entry.fromFrame / raw.fps * 1000
        : Number(entry?.startMs ?? Number(entry?.start ?? 0) * 1000);
      if (!Number.isFinite(startMs) || startMs < 0) throw new Error(`字幕开始时间无效: ${itemIndex}.${entryIndex}`);
      if (startMs < previousStartMs) throw new Error(`字幕时间未递增: ${itemIndex}.${entryIndex}`);
      previousStartMs = startMs;
      const hasEnd = entry?.endMs != null || entry?.end != null;
      const hasDuration = entry?.durationMs != null || entry?.duration != null;
      const endMs = frameTimed ? (entry.fromFrame + entry.durationInFrames) / raw.fps * 1000
        : hasEnd ? Number(entry.endMs ?? Number(entry.end) * 1000)
        : hasDuration ? startMs + Number(entry.durationMs ?? Number(entry.duration) * 1000) : startMs + 500;
      if (!frameTimed && !hasEnd && !hasDuration) warnings.push(`字幕 ${itemIndex}.${entryIndex} 缺少 end/duration，已按 500ms 处理`);
      if (!Number.isFinite(endMs) || endMs <= startMs) { warnings.push(`字幕 ${itemIndex}.${entryIndex} 时间无效，已跳过`); return; }
      const text = String(entry?.text ?? "").trim();
      if (!text) { warnings.push(`字幕 ${itemIndex}.${entryIndex} 缺少文本，已跳过`); return; }
      captions.push({text, startMs: Math.round(startMs), endMs: Math.round(endMs)});
    });
  });
  return {captions, warnings, wordTimed: Boolean(raw?.words || source.some(item => Array.isArray(item?.words)))};
}

export function createSubtitleSnapshot(settings, timing, storyboard) {
  const selected = storyboard.aspectRatio === '9:16' ? settings.vertical : settings.horizontal;
  if (!selected.enabled) return {settings: selected, captions: [], wordTimed: false, warnings: []};
  const result = normalizeCaptionInput(timing);
  if (!result.captions.length) throw new Error("字幕时间数据为空");
  const normalizeText = text => String(text || "").replace(/\s+/gu, "");
  const timedText = normalizeText(result.captions.map(item => item.text).join(""));
  const shotText = normalizeText(storyboard.shots.map(item => item.text).join(""));
  if (timedText !== shotText) throw new Error("字幕时间数据与当前分镜文案不一致，请重新校正时间线");
  if (storyboard.subtitleHighlights) {
    if (storyboard.subtitleHighlights.length !== result.captions.length)
      throw new Error("字幕重点数量与时间段不一致");
    result.captions.forEach((caption, index) => {
      const highlight = storyboard.subtitleHighlights[index];
      if (typeof highlight !== "string" || (highlight && !caption.text.includes(highlight)))
        throw new Error(`第 ${index + 1} 段字幕重点不在原文中`);
      if (Array.from(highlight).length > selected.maxChars) {
        // A model may return a valid but overly long phrase. Do not block the
        // whole render; keep the narration and omit only this highlight.
        result.warnings.push(`第 ${index + 1} 段字幕重点过长，已跳过强调`);
      } else if (highlight) caption.highlight = highlight;
    });
  }
  const durationMs = storyboard.shots.reduce((sum, item) => sum + item.durationInFrames, 0) / storyboard.fps * 1000;
  if (Math.abs(result.captions.at(-1).endMs - durationMs) > 1000) {
    throw new Error("字幕时长与当前分镜相差超过 1 秒，请重新校正时间线");
  }
  return {settings: selected, ...result};
}
