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
  const cardCallsRequired = source.cardCallsRequired === true &&
    (source.aspectRatio || source.themeSnapshot?.aspectRatio || '16:9') === '16:9';
  let cards;
  const formalFile = path.join(project, 'qa', 'formal-bindings.json');
  const formal = fs.existsSync(formalFile) ? JSON.parse(fs.readFileSync(formalFile, 'utf8')) : null;
  if(formal?.schema === 'talkcraft-formal-bindings-v1' && Array.isArray(formal.bindings)) {
    const byShot=Object.fromEntries(formal.bindings.map(b=>[b.shotId,[b.shotCard]]));
    if(shots.some(s=>!byShot[s.id]?.length))throw Error('正式模板绑定未覆盖全部镜头');
    cards={slugs:[...new Set(formal.bindings.map(b=>b.shotCard))],byShot};
  } else try {
    cards = parseCardsFromShotbook(fs.readFileSync(path.join(project, 'SHOTBOOK.md'), 'utf8'), skillRoot);
  } catch (error) {
    if (cardCallsRequired) throw error;
    cards = {slugs:[], byShot:Object.fromEntries(shots.map(shot => [shot.id, []]))};
  }
  // 竖屏 B 模式不要求旧版 card-call 记录，但正式绑定仍是唯一模板来源。
  // 统计不能因为缺少旧格式的 SHOTBOOK 选卡行而把实际调用报成 0。
  if (!cards.slugs.length) {
    const formalFile = path.join(project, 'qa', 'formal-bindings.json');
    if (fs.existsSync(formalFile)) {
      const formal = JSON.parse(fs.readFileSync(formalFile, 'utf8'));
      const bindings = Array.isArray(formal.bindings) ? formal.bindings : [];
      const byShot = Object.fromEntries(shots.map(shot => [shot.id, []]));
      for (const binding of bindings) {
        if (byShot[binding.shotId] && binding.shotCard) byShot[binding.shotId].push(binding.shotCard);
      }
      cards = {slugs:[...new Set(bindings.map(binding => binding.shotCard).filter(Boolean))], byShot};
    }
  }
  return writeUsageReport(path.join(path.dirname(videoFile), `${path.basename(videoFile, '.mp4')}-template-usage.json`),
    createTalkcraftTemplateUsage(source, shots, cards.byShot), videoFile);
}
