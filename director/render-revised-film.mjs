// TalkCraft 交付后修复迭代：底片 + 受影响拍替换导出工具。
// 从成功案例 run 17c3017d / qa/text-safe-color-fix-20261010 的 render-revised-film.mjs 固化：
// 审计门禁 -> 受影响拍逐拍渲染（已存在则跳过）-> 底片分缝拼合 + 原音轨直拷 ->
// 拒绝覆盖、原片不可变校验、完整解码验证、结果存证（userAcceptance 恒为 false，等用户验收）。
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// 纯函数：按受影响拍把 [0,totalFrames) 切成 缺口/补丁 交替序列，返回 filter_complex 片段
export function planPatchTimeline(changedBeats, totalFrames) {
  const sorted = [...changedBeats].sort((a, b) => a.startFrame - b.startFrame);
  const gaps = [];
  let cursor = 0;
  for (const beat of sorted) {
    if (beat.startFrame > cursor) gaps.push([cursor, beat.startFrame]);
    cursor = beat.endFrame;
  }
  if (cursor < totalFrames) gaps.push([cursor, totalFrames]);
  const filters = [`[0:v]split=${gaps.length}${gaps.map((_, i) => `[base${i}]`).join('')}`];
  let gap = 0;
  cursor = 0;
  const sequence = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const beat = sorted[i];
    if (beat.startFrame > cursor) {
      filters.push(`[base${gap}]trim=start_frame=${cursor}:end_frame=${beat.startFrame},setpts=PTS-STARTPTS[gap${gap}]`);
      sequence.push(`[gap${gap}]`);
      gap += 1;
    }
    filters.push(`[${i + 1}:v]setpts=PTS-STARTPTS[patch${i}]`);
    sequence.push(`[patch${i}]`);
    cursor = beat.endFrame;
  }
  if (cursor < totalFrames) {
    filters.push(`[base${gap}]trim=start_frame=${cursor}:end_frame=${totalFrames},setpts=PTS-STARTPTS[gap${gap}]`);
    sequence.push(`[gap${gap}]`);
  }
  filters.push(`${sequence.join('')}concat=n=${sequence.length}:v=1:a=0[outv]`);
  return {filters, sequence};
}

function parseArgs(argv) {
  const flags = {};
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) flags[arg.slice(2)] = true;
      else { flags[arg.slice(2)] = next; index += 1; }
    }
  }
  return flags;
}

function usage() {
  throw new Error('用法: node director/render-revised-film.mjs --project <talkcraft/remotion> '
    + '--base <底片mp4> --audit <layout-audit.json> --out <输出mp4> [--work <迭代目录>] '
    + '(--cards 卡型,卡型 | --beats 拍id,拍id)');
}

export async function runRevisedFilm(flags) {
  const project = path.resolve(String(flags.project || ''));
  const base = path.resolve(String(flags.base || ''));
  const auditFile = path.resolve(String(flags.audit || ''));
  const output = path.resolve(String(flags.out || ''));
  const work = path.resolve(String(flags.work || path.dirname(output)));
  if (!flags.project || !flags.base || !flags.audit || !flags.out) usage();
  if (!flags.cards && !flags.beats) usage();

  // 门禁 1：布局审计必须全绿（零安全区违规）
  const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
  if (!Array.isArray(audit) || !audit.length) throw new Error('布局审计为空，拒绝导出');
  const violations = audit.filter(row => row.safeViolations.length);
  if (violations.length) throw new Error('布局审计未通过: ' + JSON.stringify(violations.map(row => ({beat: row.beatId, frame: row.frame, violations: row.safeViolations}))));

  // 门禁 2：输出已存在则拒绝（不覆盖任何既有成片）
  if (fs.existsSync(output)) throw new Error(`拒绝覆盖已存在的输出: ${output}`);
  if (!fs.existsSync(base)) throw new Error(`底片不存在: ${base}`);
  const originalHash = digest(base);

  const beats = JSON.parse(fs.readFileSync(path.join(project, 'visual-beats.json'), 'utf8'));
  const cardFilter = String(flags.cards || '').split(',').map(item => item.trim()).filter(Boolean);
  const beatFilter = String(flags.beats || '').split(',').map(item => item.trim()).filter(Boolean);
  const changed = beats.filter(beat =>
    (cardFilter.length && cardFilter.includes(beat.card)) || (beatFilter.length && beatFilter.includes(beat.id)));
  if (!changed.length) throw new Error('未匹配到任何受影响拍');

  const require = createRequire(path.join(project, 'package.json'));
  const {bundle} = require('@remotion/bundler');
  const {selectComposition, renderMedia} = require('@remotion/renderer');

  const missing = changed.filter(beat => !fs.existsSync(path.join(work, `${beat.id}-corrected.mp4`)));
  let serveUrl = null;
  let composition = null;
  if (missing.length) {
    serveUrl = await bundle({entryPoint:path.join(project,'src/index.ts'), publicDir:path.join(project,'public'), outDir:path.join(work,'render-bundle')});
    composition = await selectComposition({serveUrl, id:'Main', inputProps:{bgm:null, keyedHumans:{}}});
  }
  for (const beat of changed) {
    const clip = path.join(work, `${beat.id}-corrected.mp4`);
    if (fs.existsSync(clip)) { console.log('corrected clip', beat.id, '(cached)'); continue; }
    await renderMedia({serveUrl, composition, inputProps:{bgm:null, keyedHumans:{}},
      frameRange:[beat.startFrame, beat.endFrame - 1], codec:'h264',
      outputLocation:path.resolve(clip), concurrency:1, crf:18});
    console.log('corrected clip', beat.id);
  }

  const totalFrames = composition
    ? composition.durationInFrames
    : Number(JSON.parse(execFileSync('ffprobe', ['-v','error','-select_streams','v:0',
      '-show_entries','stream=nb_frames','-of','json', base], {encoding:'utf8'})).streams[0].nb_frames);
  const {filters} = planPatchTimeline(changed, totalFrames);
  const filterFile = path.join(work, 'patch-filter.txt');
  fs.writeFileSync(filterFile, filters.join(';\n'));

  const args = ['-hide_banner','-v','error','-i',base];
  for (const beat of changed) args.push('-i', path.join(work, `${beat.id}-corrected.mp4`));
  args.push('-filter_complex_threads','1','-filter_complex_script',filterFile,'-map','[outv]','-map','0:a',
    '-c:v','libx264','-threads','2','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','copy',
    '-movflags','+faststart', output);
  execFileSync('ffmpeg', args, {stdio:'inherit'});

  // 门禁 3：完整解码 + 媒体规格 + 原片不可变
  execFileSync('ffmpeg', ['-v','error','-i',output,'-f','null', process.platform === 'win32' ? 'NUL' : '/dev/null'], {stdio:'inherit'});
  const info = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_streams','-show_format','-of','json', output], {encoding:'utf8'}));
  const video = info.streams.find(stream => stream.codec_type === 'video');
  if (Number(video.nb_frames) !== totalFrames) throw new Error(`帧数不符: ${video.nb_frames} != ${totalFrames}`);
  if (!info.streams.some(stream => stream.codec_type === 'audio')) throw new Error('输出缺少音轨');
  if (digest(base) !== originalHash) throw new Error('底片在导出过程中被修改');

  const result = {output, sha256:digest(output), base, originalHash, originalPreserved:true,
    changedBeats:changed.map(beat => beat.id), width:video.width, height:video.height,
    fps:video.r_frame_rate, frames:video.nb_frames, duration:info.format.duration,
    fullDecodePassed:true, audioCopiedFromBase:true, userAcceptance:false, independentReview:'pending'};
  fs.writeFileSync(path.join(work, 'revised-film-result.json'), JSON.stringify(result, null, 2));
  console.log('REVISED_FILM_READY', output);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRevisedFilm(parseArgs(process.argv)).catch(error => { console.error('[render-revised-film]', error.message); process.exitCode = 1; });
}
