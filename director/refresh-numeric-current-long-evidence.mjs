import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ffmpegPath} from './packaging-media.mjs';

const root = path.resolve(import.meta.dirname, '..');
const reportFile = 'template/out/card-business-data-batch014-current-long-20261003/compatibility.json';
const reportPath = path.resolve(root, reportFile);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, file))).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');

for (const item of report.cases) {
  const video = path.resolve(root, item.video);
  for (const sample of item.samples) {
    const frame = Number(sample.frame);
    const sourceName = path.basename(sample.file);
    const freshName = sourceName.replace(/\.png$/i, '-fresh.png');
    const freshPath = path.join(path.dirname(video), freshName);
    execFileSync(ffmpegPath(), ['-y', '-v', 'error', '-i', video, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-vsync', '0', freshPath], {windowsHide: true});
    if (!fs.existsSync(freshPath) || fs.statSync(freshPath).size < 1024) throw new Error(`样帧生成失败：${freshPath}`);
    sample.file = relative(freshPath);
    sample.sha256 = hash(sample.file);
  }
}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({report: reportFile, freshSamples: report.cases.reduce((n, item) => n + item.samples.length, 0)}));
