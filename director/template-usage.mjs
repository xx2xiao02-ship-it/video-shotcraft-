import fs from 'node:fs';
import crypto from 'node:crypto';
import {backgroundCoverage} from './background-policy.mjs';

export function createTemplateUsage(storyboard) {
  const groups = new Map();
  const coverage = backgroundCoverage(storyboard.shots);
  const fps = storyboard.fps || 30;
  for (const [index, shot] of storyboard.shots.entries()) {
    const template = shot.shotCard || null;
    const item = groups.get(template) || {template:template || '无模板', calls:0, durationInFrames:0, shots:[], backgroundVideos:0};
    const background = coverage.backgroundShots.includes(index + 1);
    item.calls += 1;
    item.durationInFrames += shot.durationInFrames;
    item.shots.push(index + 1);
    if (background) item.backgroundVideos += 1;
    groups.set(template, item);
  }
  return {
    version:1, countingBasis:'storyboard-per-shot', runId:storyboard.runId || null, aspectRatio:storyboard.aspectRatio || '16:9',
    totalShots:storyboard.shots.length,
    templatedShots:storyboard.shots.filter(shot => shot.shotCard).length,
    noTemplateShots:storyboard.shots.filter(shot => !shot.shotCard).length,
    uniqueTemplates:[...groups.keys()].filter(Boolean).length,
    backgroundVideoShots:[...groups.values()].reduce((sum, item) => sum + item.backgroundVideos, 0),
    exemptBackgroundShots:coverage.exemptShots,
    missingBackgroundShots:coverage.missingShots,
    templates:[...groups.values()].map(item => ({...item, durationSeconds:Number((item.durationInFrames / fps).toFixed(2))}))
      .sort((a, b) => b.calls - a.calls || a.template.localeCompare(b.template)),
  };
}

export function writeTemplateUsage(file, storyboard, videoFile) {
  return writeUsageReport(file, createTemplateUsage(storyboard), videoFile);
}

export function writeUsageReport(file, usage, videoFile) {
  const bytes = fs.readFileSync(videoFile);
  const report = {...usage, generatedAt:new Date().toISOString(),
    videoSha256:crypto.createHash('sha256').update(bytes).digest('hex'), videoBytes:bytes.length};
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  return report;
}
