import fs from 'node:fs';
import path from 'node:path';
import {parseCardsFromShotbook} from './talkcraft-qa-manifests.mjs';
import {writeUsageReport} from './template-usage.mjs';

export function createTalkcraftTemplateUsage(source, shots, byShot) {
  const fps = source.fps;
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('模板统计缺少有效帧率');
  const groups = new Map();
  const noTemplateShots = [];
  shots.forEach((shot, index) => {
    const cards = [...new Set(byShot[shot.id] || [])];
    if (!cards.length) noTemplateShots.push(shot.id);
    const frames = Math.round(shot.end * fps) - Math.round(shot.start * fps);
    if (!Number.isFinite(frames) || frames <= 0) throw new Error(`镜头 ${shot.id} 的统计时间无效`);
    cards.forEach(template => {
      const item = groups.get(template) || {template, calls:0, durationInFrames:0, shots:[], shotIds:[]};
      item.calls += 1;
      item.durationInFrames += frames;
      item.shots.push(index + 1);
      item.shotIds.push(shot.id);
      groups.set(template, item);
    });
  });
  return {version:1, countingBasis:'shotbook-per-shot', runId:source.runId,
    aspectRatio:source.aspectRatio || source.themeSnapshot?.aspectRatio || '16:9',
    totalShots:shots.length, templatedShots:shots.length - noTemplateShots.length,
    noTemplateShots:noTemplateShots.length, noTemplateShotIds:noTemplateShots,
    uniqueTemplates:groups.size,
    templates:[...groups.values()].map(item => ({...item, durationSeconds:Number((item.durationInFrames / fps).toFixed(2))}))
      .sort((a, b) => b.calls - a.calls || a.template.localeCompare(b.template))};
}

export function writeTalkcraftTemplateUsage(project, skillRoot, videoFile) {
  const source = JSON.parse(fs.readFileSync(path.join(project, 'source-run.json'), 'utf8'));
  const shots = JSON.parse(fs.readFileSync(path.join(project, 'remotion', 'shots.json'), 'utf8'));
  const cards = parseCardsFromShotbook(fs.readFileSync(path.join(project, 'SHOTBOOK.md'), 'utf8'), skillRoot);
  return writeUsageReport(path.join(path.dirname(videoFile), `${path.basename(videoFile, '.mp4')}-template-usage.json`),
    createTalkcraftTemplateUsage(source, shots, cards.byShot), videoFile);
}
