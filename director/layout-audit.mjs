// TalkCraft 修复迭代：文字安全区/排版布局审计（固化自成功案例 17c3017d 的 render-check.mjs）。
// 依赖模板侧 auditLayout 埋点：inputProps.auditLayout=true 时，组件经浏览器日志通道
// TALKCRAFT_LAYOUT_AUDIT: 回传每帧排版矩形；本工具批量静帧采样并断言零安全区违规。
// 用法: node director/layout-audit.mjs --project <talkcraft/remotion> --work <迭代目录> \
//        [--frames 2395,2483] [--cards type-contrast-emphasis,word-relay-filmstrip]
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const args = {};
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith('--')) {
    const next = process.argv[index + 1];
    if (next === undefined || next.startsWith('--')) args[arg.slice(2)] = true;
    else { args[arg.slice(2)] = next; index += 1; }
  }
}
if (!args.project || !args.work) {
  console.error('用法: node director/layout-audit.mjs --project <talkcraft/remotion> --work <迭代目录> [--frames ...] [--cards ...]');
  process.exit(1);
}

const project = path.resolve(String(args.project));
const work = path.resolve(String(args.work));
const require = createRequire(path.join(project, 'package.json'));
const {bundle} = require('@remotion/bundler');
const {selectComposition, renderStill} = require('@remotion/renderer');

const beats = JSON.parse(fs.readFileSync(path.join(project, 'visual-beats.json'), 'utf8'));
const cardFilter = String(args.cards || '').split(',').map(item => item.trim()).filter(Boolean);
const explicit = String(args.frames || '').split(',').map(item => Number(item.trim())).filter(Number.isFinite);
const derived = cardFilter.flatMap(card => beats.filter(beat => beat.card === card)
  .flatMap(beat => [Math.min(beat.startFrame + 60, beat.endFrame - 1), beat.endFrame - 1]));
const frames = [...new Set([...explicit, ...derived])];
if (!frames.length) { console.error('没有可审计的帧：提供 --frames 或 --cards'); process.exit(1); }

const logs = [];
console.log('打包渲染 bundle…');
const serveUrl = await bundle({entryPoint:path.join(project,'src/index.ts'), publicDir:path.join(project,'public'), outDir:path.join(work,'render-bundle')});
const composition = await selectComposition({serveUrl, id:'Main', inputProps:{bgm:null, keyedHumans:{}, auditLayout:true}});
for (const frame of frames) {
  await renderStill({serveUrl, composition, inputProps:{bgm:null, keyedHumans:{}, auditLayout:true},
    frame, output:path.join(work, `frame-${frame}.png`),
    onBrowserLog:entry => { if (entry.text?.includes('TALKCRAFT_LAYOUT_AUDIT:')) logs.push(entry.text); }});
  console.log('frame', frame, 'rendered');
}
const audit = logs.map(line => JSON.parse(line.slice(line.indexOf('TALKCRAFT_LAYOUT_AUDIT:') + 23)));
fs.writeFileSync(path.join(work, 'layout-audit.json'), JSON.stringify(audit, null, 2));
const violations = audit.filter(row => row.safeViolations.length);
if (audit.length !== frames.length || violations.length) {
  console.error('安全区检查未通过:', JSON.stringify(violations.map(row => ({beat:row.beatId, frame:row.frame, violations:row.safeViolations}))));
  process.exit(1);
}
console.log('safe-zone checks passed:', audit.length);
