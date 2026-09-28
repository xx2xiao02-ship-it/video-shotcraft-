import {loadMaterialIndex, matchSceneVideos} from './b-mode-material-match.mjs';

export function materialMatchPreviewEnabled(env = process.env) {
  return env.SHOTCRAFT_MATCH_PREVIEW === '1';
}

export async function readMaterialMatchPreviewBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 64 * 1024) throw new Error('匹配请求过大');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export function previewMaterialMatches(root, scenes) {
  if (!Array.isArray(scenes) || scenes.length < 1 || scenes.length > 80 ||
      scenes.some(scene => typeof scene?.text !== 'string' || !scene.text.trim() || scene.text.length > 80)) {
    throw new Error('分镜文案应为 1 至 80 条，每条不超过 80 字');
  }
  const matches = matchSceneVideos(scenes, loadMaterialIndex(root));
  return {ok: true, matches: matches.map((match, sceneIndex) => ({
    sceneIndex, ...match, review: 'pending',
  }))};
}
