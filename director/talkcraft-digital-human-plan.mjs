import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';

export const fileSha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');

export function planTalkcraftDigitalHuman(project) {
  const source = JSON.parse(readFileSync(path.join(project, 'source-run.json'), 'utf8'));
  const shots = JSON.parse(readFileSync(path.join(project, 'remotion', 'shots.json'), 'utf8'));
  if (!['segments', 'combined'].includes(source.digitalHumanMode)) {
    throw new Error('此任务没有启用主成片数字人生成');
  }
  if (source.fps !== 30 || !Number.isInteger(source.totalFrames) || source.totalFrames <= 0 ||
      !Array.isArray(shots) || !shots.length) throw new Error('分镜或主配音时间轴无效');
  const units = [];
  let nextFrame = 0;
  for (const [index, shot] of shots.entries()) {
    const start = Math.round(Number(shot.start) * 30);
    const end = Math.round(Number(shot.end) * 30);
    if (!/^[a-z][a-z0-9]*$/i.test(shot.id || '') ||
        !['person', 'other'].includes(shot.subject) || start !== nextFrame || end <= start) {
      throw new Error(`第 ${index + 1} 镜需明确 subject=person 或 other，且时间轴必须连续`);
    }
    nextFrame = end;
    if (shot.subject !== 'person') continue;
    const previous = units.at(-1);
    if (previous && previous.fromFrame + previous.durationInFrames === start) {
      previous.durationInFrames += end - start;
      previous.shotIds.push(shot.id);
    } else {
      units.push({index:units.length, fromFrame:start, durationInFrames:end - start, shotIds:[shot.id]});
    }
  }
  if (nextFrame !== source.totalFrames || !units.length) {
    throw new Error('分镜未覆盖主配音全长，或没有标记 person 的数字人镜头');
  }
  return {mode:source.digitalHumanMode, fps:30, totalFrames:nextFrame, units};
}
