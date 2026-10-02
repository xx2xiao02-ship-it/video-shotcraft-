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

test('横竖阴影字幕通过保存校验并进入渲染快照', () => {
  const settings = normalizeSubtitleSettings(null);
  settings.horizontal.templateId = settings.vertical.templateId = 'shadow';
  const saved = validateSubtitleSettings(settings);
  for (const aspectRatio of ['16:9','9:16']) {
    const storyboard = {fps:30,aspectRatio,shots:[{text:'阴影字幕',durationInFrames:30}]};
    const snapshot = createSubtitleSnapshot(saved,{segments:[{text:'阴影字幕',start:0,duration:1}]},storyboard);
    assert.equal(snapshot.settings.templateId,'shadow');
    assert.equal(snapshot.captions[0].text,'阴影字幕');
  }
});

test("字幕时间统一为毫秒并拒绝乱序", () => {
  assert.deepEqual(normalizeCaptionInput({segments: [{text: "你好", start: 1, duration: 0.5}]}).captions,
    [{text: "你好", startMs: 1000, endMs: 1500}]);
  assert.deepEqual(normalizeCaptionInput({fps: 30, segments: [
    {text: "第一句", fromFrame: 0, durationInFrames: 75},
    {text: "第二句", fromFrame: 75, durationInFrames: 90},
  ]}).captions, [
    {text: "第一句", startMs: 0, endMs: 2500},
    {text: "第二句", startMs: 2500, endMs: 5500},
  ]);
  assert.throws(() => normalizeCaptionInput([{text: "后", startMs: 200}, {text: "前", startMs: 100}]), /时间未递增/);
  assert.throws(() => normalizeCaptionInput({segments: [{text: "缺帧率", fromFrame: 0, durationInFrames: 30}]}), /帧时间无效/);
  assert.throws(() => normalizeCaptionInput({fps: 30, segments: [{text: "缺时长", fromFrame: 0}]}), /帧时间无效/);
});

test("字幕与分镜不匹配时阻断渲染快照", () => {
  const settings = normalizeSubtitleSettings(null);
  const storyboard = {fps: 30, shots: [{text: "当前分镜", durationInFrames: 30}]};
  assert.throws(() => createSubtitleSnapshot(settings, {segments: [{text: "旧文案", start: 0, duration: 1}]}, storyboard), /文案不一致/);
  assert.deepEqual(createSubtitleSnapshot(settings, {segments: [{text: "当前分镜", start: 0, duration: 1}]}, storyboard).captions,
    [{text: "当前分镜", startMs: 0, endMs: 1000}]);
  assert.deepEqual(createSubtitleSnapshot(settings, {fps: 30, totalFrames: 30,
    segments: [{text: "当前分镜", fromFrame: 0, durationInFrames: 30}]}, storyboard).captions,
    [{text: "当前分镜", startMs: 0, endMs: 1000}]);
});

test("字幕重点只接受逐段原文短语，不自动取句首", () => {
  const settings = normalizeSubtitleSettings(null);
  const storyboard = {fps:30, shots:[{text:"减少可花可不花的开销，存款才是底气。", durationInFrames:90}],
    subtitleHighlights:["存款才是底气"]};
  const timing = {fps:30, segments:[{text:storyboard.shots[0].text, fromFrame:0, durationInFrames:90}]};
  assert.equal(createSubtitleSnapshot(settings, timing, storyboard).captions[0].highlight, "存款才是底气");
  assert.throws(() => createSubtitleSnapshot(settings, timing,
    {...storyboard, subtitleHighlights:["前四个字"]}), /不在原文/);
});

test('竖版成片使用竖版字幕参数', () => {
  const settings = normalizeSubtitleSettings(null);
  settings.vertical.maxChars = 12;
  const storyboard = {fps:30, aspectRatio:'9:16', shots:[{text:'竖版字幕', durationInFrames:30}]};
  const timing = {fps:30, segments:[{text:'竖版字幕', fromFrame:0, durationInFrames:30}]};
  assert.equal(createSubtitleSnapshot(settings, timing, storyboard).settings.maxChars, 12);
});
