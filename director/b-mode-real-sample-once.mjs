import {readFileSync, existsSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const recordFile = path.join(root, 'director', 'b-mode-real-sample-20260928.json');
if (existsSync(recordFile)) throw new Error('已有本次真实样片提交记录；为避免重复计费，拒绝再次提交');
const baseUrl = 'http://127.0.0.1:8776';
const config = await (await fetch(`${baseUrl}/api/b-mode/digital-human/config`)).json();
if (!config.ok || !config.configured) throw new Error('8776 数字人服务未读取到 RunningHub 配置');

const scenes = [
  {text:'今天用一条短片验证数字人镜头的音画同步。', subject:'person'},
  {text:'相邻的人物镜头会继续使用同一段数字人素材。', subject:'person'},
  {text:'中间的图解镜头只显示信息，不调用数字人。', subject:'graphics'},
  {text:'随后人物再次出现，使用独立裁切的配音生成新素材。', subject:'person'},
];
const images = [
  path.join(root, 'director', 'b-mode-runs', 'feaeb277-9c7d-4ff5-97e0-4cd2969b1d87', 'talkcraft', 'assets', 'avatar.png'),
  path.join(root, 'director', 'b-mode-runs', '05d7bd6c-14db-49e6-a22f-59a7b0b01e1a', 'talkcraft', 'assets', 'avatar.png'),
];
if (!images.every(existsSync)) throw new Error('真实样片形象图缺失');
const form = new FormData();
form.set('text', scenes.map(scene => scene.text).join(''));
form.set('voiceMode', 'standard');
form.set('voice', 'zh-CN-YunxiNeural');
form.set('scenes', JSON.stringify(scenes));
form.set('prompt', '人物自然说话，身体稳定，轻微自然手势');
for (const image of images) form.append('avatar', new Blob([readFileSync(image)], {type:'image/png'}), path.basename(image));

const record = {schema:'b-mode-real-sample-submission-v1', createdAt:new Date().toISOString(),
  status:'submitting', billable:true, maxDigitalHumanUnits:2, scenes, avatarSources:images,
  localBaseUrl:baseUrl};
writeFileSync(recordFile, JSON.stringify(record, null, 2), 'utf8');
try {
  const response = await fetch(`${baseUrl}/api/b-mode/digital-human`, {method:'POST', body:form});
  const result = await response.json();
  record.status = response.ok && result.ok ? 'submitted' : 'rejected';
  record.response = result;
  writeFileSync(recordFile, JSON.stringify(record, null, 2), 'utf8');
  console.log(JSON.stringify({status:record.status, runId:result.runId || null,
    taskId:result.id || null, error:result.error || null}));
} catch (error) {
  record.status = 'submission_unknown';
  record.error = String(error.message || error);
  writeFileSync(recordFile, JSON.stringify(record, null, 2), 'utf8');
  throw error;
}
