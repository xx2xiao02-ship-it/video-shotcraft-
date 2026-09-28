import test from "node:test";
import assert from "node:assert/strict";
import {createSubtitleSnapshot, normalizeCaptionInput, normalizeSubtitleSettings, validateSubtitleSettings} from "./subtitle-v1.mjs";

test("旧配置补默认值且横竖共用字体", () => {
  const settings = normalizeSubtitleSettings({horizontal: {templateId: "creator", fontId: "wenkai"}, vertical: {templateId: "pill", fontId: "sans"}});
  assert.equal(settings.horizontal.fontId, "wenkai");
  assert.equal(settings.vertical.fontId, "wenkai");
  assert.equal(settings.vertical.panelOpacity, 85);
});

test("拒绝字体不一致的保存配置", () => {
  const settings = normalizeSubtitleSettings(null);
  settings.vertical.fontId = "serif";
  assert.throws(() => validateSubtitleSettings(settings), /字幕参数无效/);
});

test("字幕时间统一为毫秒并拒绝乱序", () => {
  assert.deepEqual(normalizeCaptionInput({segments: [{text: "你好", start: 1, duration: 0.5}]}).captions,
    [{text: "你好", startMs: 1000, endMs: 1500}]);
  assert.throws(() => normalizeCaptionInput([{text: "后", startMs: 200}, {text: "前", startMs: 100}]), /时间未递增/);
});

test("字幕与分镜不匹配时阻断渲染快照", () => {
  const settings = normalizeSubtitleSettings(null);
  const storyboard = {fps: 30, shots: [{text: "当前分镜", durationInFrames: 30}]};
  assert.throws(() => createSubtitleSnapshot(settings, {segments: [{text: "旧文案", start: 0, duration: 1}]}, storyboard), /文案不一致/);
  assert.deepEqual(createSubtitleSnapshot(settings, {segments: [{text: "当前分镜", start: 0, duration: 1}]}, storyboard).captions,
    [{text: "当前分镜", startMs: 0, endMs: 1000}]);
});
