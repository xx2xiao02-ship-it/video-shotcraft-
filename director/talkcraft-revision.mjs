import {randomUUID} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

export function createTalkcraftRevision(root, sourceRunId, scriptFile) {
  if (!RUN_ID.test(sourceRunId)) throw new Error('Invalid source run ID');
  const sourceDir = path.join(root, 'director', 'b-mode-runs', sourceRunId);
  const sourceReport = JSON.parse(readFileSync(path.join(sourceDir, 'placeholder-report.json'), 'utf8'));
  const sourceProject = path.join(sourceDir, 'talkcraft');
  const text = readFileSync(scriptFile, 'utf8').trim();
  const sentences = (text.replace(/\r/gu, '').match(/[^。！？!?\n]+[。！？!?]?/gu) || [])
    .map(sentence => sentence.trim()).filter(Boolean);
  if (sourceReport.runId !== sourceRunId || !sentences.length || text.length > 1200 ||
      !existsSync(path.join(sourceDir, 'avatar.png'))) {
    throw new Error('Revised script or source run is invalid');
  }
  const runId = randomUUID();
  const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  mkdirSync(path.join(project, 'audio'), {recursive:true});
  mkdirSync(path.join(project, 'assets'), {recursive:true});
  mkdirSync(path.join(project, 'remotion', 'public', 'broll'), {recursive:true});
  copyFileSync(path.join(sourceDir, 'avatar.png'), path.join(project, 'assets', 'avatar.png'));
  for (const name of ['phone.mp4', 'laptop.mp4']) {
    const source = path.join(sourceProject, 'remotion', 'public', 'broll', name);
    if (existsSync(source)) copyFileSync(source, path.join(project, 'remotion', 'public', 'broll', name));
  }
  writeFileSync(path.join(project, 'input.txt'), text + '\n', 'utf8');
  writeFileSync(path.join(project, 'script.txt'), sentences.join('\n') + '\n', 'utf8');
  writeFileSync(path.join(project, 'script.json'), JSON.stringify({sentences}, null, 2), 'utf8');
  writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({schema:'talkcraft-revision-v1',
    runId, sourceRunId, fps:30, totalFrames:null, voice:sourceReport.voice,
    isDigitalHuman:false, visualTextLocale:'zh-CN',
    textRevision:'research-claim-correction'}, null, 2), 'utf8');
  writeFileSync(path.join(project, 'sources.md'), `# 素材与研究来源\n\n` +
    `- 人物图：复用源运行 ${sourceRunId}，静态图片，不代表数字人口型。\n` +
    `- 手机与笔记本实拍：复用本地素材库，使用镜头仍需逐镜登记与审核。\n` +
    `- Sparrow 等（2011）：https://pubmed.ncbi.nlm.nih.gov/21764755/\n` +
    `- Storm 与 Stone（2015）：https://pubmed.ncbi.nlm.nih.gov/25491269/\n`, 'utf8');
  return {runId, project, sentences:sentences.length, characters:text.length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(createTalkcraftRevision(ROOT, process.argv[2] || '',
    path.resolve(process.argv[3] || '')), null, 2));
}
