import fs from 'node:fs';
import path from 'node:path';

// Match only concepts that the library actually labels. Generic filming tags are not evidence.
const CONCEPTS = [
  {re:/手机|截图|转发|视频|打开|屏幕|资料|大脑|数字/u, tags:['科技界面','科技','未来感']},
  {re:/城市|街道|交通|车|大楼/u, tags:['城市建筑','交通车流','城市']},
  {re:/家庭|父母|孩子|老人/u, tags:['家庭','儿童','老年人']},
  {re:/科技|AI|算法|数据/u, tags:['科技界面','科技','未来感']},
  {re:/朋友|教给|讲给|交流|三句话/u, tags:['讨论交流','会议场景','有人物']},
  {re:/收藏|学习|知识|笔记|能力|干货|方法|职场|沟通|行动|工作|进步|记忆|信息|认知|时间管理|理财/u, tags:['办公场景','会议场景','讨论交流','思考眺望','商务']},
];
const FALLBACK_TAGS = ['办公场景','会议场景','讨论交流','科技界面','城市建筑'];

export function loadMaterialIndex(root) {
  const file = path.join(root, 'materials', '_index.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}

export function matchSceneVideos(scenes, index) {
  const used = new Set();
  let previousPath = null;
  const allVideos = index.filter(item => /\.mp4$/i.test(item.path || '') && Number(item.duration_sec) >= 1);
  const chooseFallback = () => allVideos
    .filter(item => item.path !== previousPath && !used.has(item.path))
    .map(item => ({item, score:FALLBACK_TAGS.filter(tag => (item.tags || []).includes(tag)).length * 10 + Math.min(Number(item.duration_sec), 12) / 12}))
    .sort((a,b) => b.score - a.score || a.item.path.localeCompare(b.item.path))[0];
  return scenes.map(scene => {
    const groups = CONCEPTS.filter(rule => rule.re.test(scene.text || ''));
    const wanted = groups[0]?.tags || [];
    const allCandidates = allVideos.map(item => {
      const hit = wanted.filter(tag => (item.tags || []).includes(tag));
      const specific = hit.filter(tag => !['商务','科技','未来感','有人物','城市'].includes(tag));
      const score = specific.length * 10 + hit.length * 2 + Math.min(Number(item.duration_sec), 12) / 12 - (used.has(item.path) ? 4 : 0);
      return {item, hit, specific, score};
    }).filter(candidate => candidate.specific.length > 0)
      .sort((a,b) => b.score - a.score || a.item.path.localeCompare(b.item.path));
    const best = allCandidates.find(candidate => candidate.item.path !== previousPath);
    if (!best) {
      const fallback = chooseFallback();
      if (!fallback) { previousPath = null; return {path:null, status:'unmatched', reason:'相邻镜头不能复用同一素材，素材库没有可用替代视频'}; }
      used.add(fallback.item.path);
      previousPath = fallback.item.path;
      return {path:fallback.item.path, status:'fallback', reason:groups.length ? '具体标签候选用尽，使用未重复兜底素材' : '文案缺少素材标签，使用未重复兜底素材'};
    }
    used.add(best.item.path);
    previousPath = best.item.path;
    return {path:best.item.path, status:'suggested', reason:`主题近似，待核对：${best.specific.join('、')}`, score:Number(best.score.toFixed(2))};
  });
}
