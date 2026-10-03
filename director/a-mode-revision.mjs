import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildStoryboard, validateGlobalPlan, validateShotPlan} from './a-mode-run.mjs';
import {applyVideoPlayback} from './video-material-policy.mjs';

export function buildAModeRevision(root, runId, planFile, outputFile) {
  const dir = path.join(root, 'director', 'a-mode-runs', runId);
  const timing = JSON.parse(fs.readFileSync(path.join(dir, 'timing.revised.json'), 'utf8'));
  const theme = JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8'));
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(root, 'materials', '_index.json'), 'utf8'));
  const globals = plan.shots.map(shot => {
    if (!shot.materialRef) return {...shot, material:null};
    const matches = index.filter(item => item.path.endsWith(shot.materialRef) &&
      fs.existsSync(path.join(root, 'materials', '_scenes', item.path)));
    if (matches.length !== 1) throw new Error(`素材引用不唯一或文件不存在: ${shot.materialRef}`);
    return {...shot, material:matches[0].path};
  });
  const materials = index.filter(item => globals.some(shot => shot.material === item.path));
  validateGlobalPlan({shots:globals}, timing.segments, materials);
  if (!Array.isArray(plan.captionHighlights) || plan.captionHighlights.length !== timing.segments.length)
    throw new Error('修订字幕重点数量与口播段不一致');
  const details = globals.map((shot, index) => ({index, displayLines:shot.displayLines,
    elementPlan:shot.reason, captionHighlights:plan.captionHighlights.slice(shot.fromSegment, shot.toSegment)}));
  validateShotPlan({shots:details}, globals, timing.segments);
  const storyboard = buildStoryboard(root, runId, timing, globals, details, theme);
  storyboard.shots = applyVideoPlayback(storyboard.shots, materials, storyboard.fps);
  fs.writeFileSync(outputFile, JSON.stringify(storyboard, null, 2), 'utf8');
  return storyboard;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [runId, planFile] = process.argv.slice(2);
  if (!runId || !planFile) throw new Error('用法：node director/a-mode-revision.mjs <任务ID> <修订计划JSON>');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const output = path.join(root, 'director', 'a-mode-runs', runId, 'storyboard.revised.json');
  const storyboard = buildAModeRevision(root, runId, path.resolve(planFile), output);
  console.log(`修订分镜：${storyboard.shots.length} 镜，${storyboard.shots.reduce((n, shot) => n + shot.durationInFrames, 0)} 帧`);
}
