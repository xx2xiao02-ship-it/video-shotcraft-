import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {alignAModeTiming} from './a-mode-timing.mjs';

export function retimeAModeRun(runDir, outputFile = path.join(runDir, 'timing.revised.json')) {
  const timing = JSON.parse(fs.readFileSync(path.join(runDir, 'timing.json'), 'utf8'));
  const boundaries = fs.readFileSync(path.join(runDir, 'timing.boundary.jsonl'), 'utf8');
  const aligned = alignAModeTiming(timing, boundaries);
  if (!aligned) throw new Error('句子边界与现有口播段无法对应，未写入修订时间轴');
  fs.writeFileSync(outputFile, JSON.stringify(aligned, null, 2), 'utf8');
  return aligned;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runDir = process.argv[2];
  if (!runDir) throw new Error('用法：node director/a-mode-retime.mjs <A模式任务目录>');
  const timing = retimeAModeRun(path.resolve(runDir));
  console.log(`${timing.timingMethod}: ${timing.timingBoundaryCount} 个真实句子边界，${timing.segments.length} 个字幕段`);
}
