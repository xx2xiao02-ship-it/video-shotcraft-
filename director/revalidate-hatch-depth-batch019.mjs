import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {buildSourceAudit} from './card-source-audit.mjs';
import {validateGlobalPlan, validateShotPlan, buildStoryboard} from './a-mode-run.mjs';
import {validateGraphicParams} from './graphic-contracts.mjs';
import {ffmpegPath, ffprobePath} from './packaging-media.mjs';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'template/package.json'));
const {bundle} = require('@remotion/bundler');
const {openBrowser, selectComposition, renderStill, renderMedia} = require('@remotion/renderer');
const ts = require('typescript');
const read = file => JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, file))).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const fixtureFile = 'template/fixtures/card-business-data-batch019-v1.json';
const metricsFile = 'template/fixtures/card-business-data-batch019-source.json';
const outputRelative = 'template/out/card-business-data-batch019-v1';
const output = path.join(root, outputRelative);
const fixture = read(fixtureFile);
fixture.metricsSource.sha256 = hash(metricsFile);
fs.writeFileSync(path.resolve(root, fixtureFile), JSON.stringify(fixture, null, 2) + '\n');
const original = read('director/a-mode-runs/f4f78a6c-aa2b-4917-9bed-66398863f3f9/props.json');
const sourceFiles = [
  fixtureFile, metricsFile, 'director/a-mode-runs/f4f78a6c-aa2b-4917-9bed-66398863f3f9/props.json',
  'template/src/Root.tsx', 'template/src/DynamicVideo.tsx', 'template/src/TemplateAdapter.tsx',
  'director/card-source-audit.mjs', 'director/a-mode-run.mjs', 'director/graphic-contracts.mjs',
  'director/admission-source-policy.mjs', 'director/current-theme.json',
  'demos/_fixtures/Motion.tsx', 'demos/_fixtures/Fixtures.tsx', 'demos/_fixtures/TemplateSkin.ts',
  'demos/data/hatch-depth/HatchDepth.tsx', 'template/render-business-text-videos.mjs',
];
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, hash(file)]));
const report = {
  schema: 'business-data-card-batch-acceptance-v1', fps: fixture.fps, durationInFrames: fixture.durationInFrames,
  sourceHashes, sourceConsistency: true, fixtureFile, baselineFixture: null, media: null,
  scope: 'real original component + current director plan + DynamicVideo; current governance metrics, 180 frames at 30fps',
  actualModelValidated: false, userAcceptance: 'pending', localVisualReview: 'pending', productionAdmission: 'not-recorded', cases: [],
};
const save = () => fs.writeFileSync(path.join(output, 'acceptance.json'), JSON.stringify(report, null, 2) + '\n');
const adapterSource = fs.readFileSync(path.join(root, 'template/src/TemplateAdapter.tsx'), 'utf8');
const adapterJs = ts.transpileModule(adapterSource, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const adapterExports = {};
new Function('require', 'exports', adapterJs)(createRequire(path.join(root, 'template/src/TemplateAdapter.tsx')), adapterExports);
const audit = buildSourceAudit(root);
const registration = audit.registrations.find(item => item.id === 'data/hatch-depth');
assert.ok(registration?.adapter?.shotCard === 'data/hatch-depth');
const originalStyle = original.storyboard.style;
const originalTheme = original.storyboard.theme;
const skinFor = aspect => ({bg: originalStyle.bg, text: originalStyle.text, muted: originalStyle.sub,
  accent: originalStyle.accent, surface: originalTheme.surface || originalStyle.bg,
  fontFamily: originalStyle.fontFamily || "'Noto Sans SC','Microsoft YaHei',sans-serif", transparentBackground: false});
const browserExecutable = process.env.SHOTCRAFT_BROWSER_EXECUTABLE ||
  'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(output, {recursive: true});
const serveUrl = await bundle({entryPoint: path.join(root, 'template/src/index.ts'), publicDir: path.join(root, 'template/public'), outDir: path.join(output, 'bundle')});
const browser = await openBrowser('chrome', {browserExecutable, chromeMode: process.env.SHOTCRAFT_CHROME_MODE || 'chrome-for-testing'});
const options = {serveUrl, puppeteerInstance: browser, logLevel: 'error', offthreadVideoCacheSizeInBytes: 32 * 1024 * 1024, offthreadVideoThreads: 1};

try {
  assert.equal(fixture.cards.length, 1);
  const item = fixture.cards[0];
  validateGraphicParams(item.id, item.templateParams, item.narration);
  for (const aspect of fixture.aspects) {
    const global = [{fromSegment: 0, toSegment: 1, type: 'claim', card: item.id, material: null, materialRole: 'none', reason: item.backgroundPolicy.reason}];
    const detail = [{index: 0, displayLines: item.lines, elementPlan: '原组件接收当前真实治理数值、单位、主题和完整180帧', captionHighlights: [''], templateParams: item.templateParams}];
    const segments = [{text: item.narration, fromFrame: 0, durationInFrames: fixture.durationInFrames}];
    validateGlobalPlan({shots: global}, segments, [], {requireBackground: true, availableCards: [item.id]});
    validateShotPlan({shots: detail}, global, segments);
    const storyboard = buildStoryboard(root, `graphic-batch019-${aspect}`, {fps: fixture.fps, totalFrames: fixture.durationInFrames, segments}, global, detail, {...read('director/current-theme.json'), aspectRatio: aspect});
    const props = {...original, bgm: null, storyboard: {...storyboard, style: originalStyle, theme: originalTheme,
      audio: undefined, subtitleV1: {settings: {...original.storyboard.subtitleV1.settings, enabled: false}, captions: [], wordTimed: false, warnings: []}, subtitleHighlights: undefined}};
    const composition = await selectComposition({...options, id: 'DynamicVideo', inputProps: props});
    const shot = composition.props.storyboard.shots[0];
    assert.equal(shot.shotCard, item.id); assert.deepEqual(shot.templateParams, item.templateParams); assert.deepEqual(shot.displayLines, item.lines);
    assert.equal(composition.durationInFrames, fixture.durationInFrames); assert.equal(composition.fps, fixture.fps);
    const componentProps = adapterExports.translateShot(item.id, {text: shot.displayText || shot.text, lines: shot.displayLines,
      templateParams: shot.templateParams, narration: shot.text, durationInFrames: shot.durationInFrames,
      skin: skinFor(aspect), accent: originalStyle.accent, bg: originalStyle.bg});
    assert.deepEqual(componentProps.rows, item.templateParams.rows); assert.equal(componentProps.unit, item.templateParams.unit);
    assert.equal(componentProps.title, item.lines.join('\n')); assert.equal(componentProps.durationInFrames, fixture.durationInFrames);
    const suffix = aspect === '9:16' ? 'portrait' : 'landscape';
    const video = path.join(output, `hatch-${suffix}.mp4`);
    await renderMedia({...options, composition, inputProps: props, codec: 'h264', pixelFormat: 'yuv420p', outputLocation: video, concurrency: 1});
    execFileSync(ffmpegPath(), ['-v', 'error', '-i', video, '-f', 'null', '-'], {windowsHide: true});
    const stream = JSON.parse(execFileSync(ffprobePath(), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames,r_frame_rate', '-of', 'json', video], {encoding: 'utf8', windowsHide: true})).streams[0];
    assert.deepEqual({width: stream.width, height: stream.height}, aspect === '9:16' ? {width: 1080, height: 1920} : {width: 1920, height: 1080});
    assert.equal(Number(stream.nb_frames), fixture.durationInFrames); assert.equal(stream.r_frame_rate, '30/1');
    const propsFile = path.join(output, `hatch-${suffix}-props.json`); const componentFile = path.join(output, `hatch-${suffix}-component-props.json`);
    fs.writeFileSync(propsFile, JSON.stringify(props, null, 2) + '\n');
    fs.writeFileSync(componentFile, JSON.stringify({componentId: item.id, componentFile: registration.file, componentExport: registration.export, componentSha256: hash(registration.file), adapterProps: componentProps}, null, 2) + '\n');
    const nativeFile = path.resolve(root, aspect === '9:16'
      ? 'template/out/card-business-data-batch014-v1/case-2-portrait-native.png'
      : 'template/out/card-business-data-batch014-v1/case-2-landscape-native.png');
    const samples = [];
    for (const frame of item.inspectFrames) { const file = path.join(output, `hatch-${suffix}-f${frame}.png`); await renderStill({...options, composition, inputProps: props, frame, scale: 0.5, output: file}); samples.push({file: relative(file), frame, sha256: hash(relative(file))}); }
    const decodedVideoReview = [];
    for (const frame of [60, 179]) { const file = path.join(output, `decoded-hatch-${suffix}-f${frame}.png`); execFileSync(ffmpegPath(), ['-y', '-v', 'error', '-i', video, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-vsync', '0', file], {windowsHide: true}); decodedVideoReview.push({file: relative(file), frame, sha256: hash(relative(file))}); }
    report.cases.push({card: item.id, aspect, lines: item.lines, source: registration.file, componentId: item.id, componentFile: registration.file, componentExport: registration.export,
      materialRole: 'none', material: null, backgroundReason: item.backgroundPolicy.reason, samples, directorConsumption: 'passed-authored-plan', resolvedCard: item.id,
      componentProps, componentPropsFile: relative(componentFile), componentPropsSha256: hash(relative(componentFile)), propsFile: relative(propsFile), propsSha256: hash(relative(propsFile)),
      nativeDefault: {file: relative(nativeFile), sha256: hash(relative(nativeFile)), resolvedCard: item.id}, video: {file: relative(video), sha256: hash(relative(video)), stream, fullDecodePassed: true}, decodedVideoReview});
    save(); console.log(`RENDERED hatch-${suffix}`);
  }
} finally { save(); await browser.close({silent: true}); }
assert.equal(report.cases.length, 2);
report.localVisualReview = 'passed-encoded-mp4-frames';
report.reviewEvidence = {encodedFrames: [60, 179], cases: 2, reviewedAt: new Date().toISOString()};
save();
console.log(JSON.stringify({output: outputRelative, cards: 1, cases: report.cases.length, localVisualReview: report.localVisualReview}));
