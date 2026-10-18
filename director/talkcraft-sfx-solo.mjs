import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const shaFile = file => sha(fs.readFileSync(file));

export function assertAudioPassSegments(directory,shots) {
  if(!Array.isArray(shots)||!shots.length)throw Error('纯音轨导出缺少已验证的视频段清单');
  for(const shot of shots){
    if(!/^[\w-]+$/.test(shot.id||''))throw Error('纯音轨导出镜头ID无效');
    const file=path.join(directory,shot.id+'.mp4');
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()||fs.statSync(file).size===0)
      throw Error('正式视频段缺失，禁止在纯音轨工程生成空白视频：'+shot.id);
  }
}

export function sfxSoloInputs(project) {
  const remotion=path.join(project,'remotion');
  return {
    originalMainSha256:shaFile(path.join(remotion,'src/Main.tsx')),
    sourceSfxSha256:shaFile(path.join(remotion,'src/sfx.ts')),
    cuesSha256:shaFile(path.join(remotion,'cues.json')),
  };
}

export function sfxSoloCurrent(project) {
  const output=path.join(project,'remotion/out/sfx-solo.wav');
  const recordFile=path.join(project,'qa/sfx-solo-render.json');
  if(!fs.existsSync(output)||!fs.existsSync(recordFile))return false;
  try {
    const record=JSON.parse(fs.readFileSync(recordFile,'utf8'));
    const inputs=sfxSoloInputs(project);
    return record.schema==='talkcraft-sfx-solo-render-v1'&&record.outputSha256===shaFile(output)&&
      Object.entries(inputs).every(([key,value])=>record[key]===value);
  } catch { return false; }
}

export function preserveStaleSfxSolo(project,{now=Date.now}={}) {
  const output=path.join(project,'remotion/out/sfx-solo.wav');
  if(!fs.existsSync(output)||sfxSoloCurrent(project))return null;
  const archive=path.join(project,'qa/sfx-solo-history',String(now()));
  fs.mkdirSync(archive,{recursive:true});
  fs.renameSync(output,path.join(archive,'sfx-solo.wav'));
  const record=path.join(project,'qa/sfx-solo-render.json');
  if(fs.existsSync(record))fs.renameSync(record,path.join(archive,'sfx-solo-render.json'));
  return archive;
}

// Keep the actual production Audio expressions, including timing/rate/volume.
// Only omit visual JSX from an isolated copy: muted videos must not be decoded
// to measure an SFX stem. Never rewrite the approved production composition.
export function audioOnlyMain(source, ts) {
  const file = ts.createSourceFile('Main.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (file.parseDiagnostics.length) throw Error('音效审计入口存在 TSX 语法错误');
  let main;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'Main') main = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!main || !ts.isArrowFunction(main) || !ts.isJsxElement(main.body) || !main.parameters.some(p => p.getText(file).includes('sfxSolo')))
    throw Error('音效审计不支持当前 Main，已保留原入口');
  const body = main.body;
  const containsAudio = node => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(file) === 'Audio') return true;
    return ts.forEachChild(node, containsAudio) === true;
  };
  // Approved paper backgrounds wrap both visuals and audio in a provider.
  // Descend only through that known visual-only wrapper; retain the original
  // Audio expressions verbatim, rather than capturing its video siblings.
  const collect = element => element.children.flatMap(node => {
    if (!containsAudio(node)) return [];
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'FilmBackgroundProvider')
      return collect(node);
    return [node.getFullText(file)];
  });
  const audio = collect(body);
  if (!audio.length || !audio.some(text => /CUES\.map\s*\(/u.test(text)) || audio.some(text => /<(?:OffthreadVideo|Video)\b/u.test(text)))
    throw Error('无法独立提取正式入口的音效节点，禁止用空音轨替代');
  return source.slice(0, body.openingElement.end) + '\n' + audio.join('\n') + '\n' + source.slice(body.closingElement.getStart(file));
}

export function prepareSfxSoloProject(project, skillRoot, {purpose='sfx-solo'}={}) {
  if(!['sfx-solo','full-audio'].includes(purpose))throw Error('未知纯音轨导出用途');
  const remotion = path.join(project, 'remotion');
  const staging = path.join(project, '.render-temp', `${purpose}-${process.pid}-${Date.now()}`);
  const runtime = path.join(skillRoot, 'runtime', 'node_modules');
  const require = createRequire(path.join(runtime, 'typescript', 'package.json'));
  const original = fs.readFileSync(path.join(remotion, 'src/Main.tsx'), 'utf8');
  const isolated = audioOnlyMain(original, require('typescript'));
  fs.mkdirSync(staging, {recursive:true});
  fs.cpSync(path.join(remotion, 'src'), path.join(staging, 'src'), {recursive:true,preserveTimestamps:true});
  for (const entry of fs.readdirSync(remotion, {withFileTypes:true})) {
    if (entry.isFile() && /(?:\.json|^remotion\.config\.[cm]?[jt]s)$/u.test(entry.name))
      fs.cpSync(path.join(remotion, entry.name), path.join(staging, entry.name), {preserveTimestamps:true});
  }
  fs.symlinkSync(path.join(remotion, 'public'), path.join(staging, 'public'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.symlinkSync(runtime, path.join(staging, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(path.join(staging, 'src/Main.tsx'), isolated);
  return {staging, originalMainSha256:sha(original), audioMainSha256:sha(isolated),
    sourceSfxSha256:sha(fs.readFileSync(path.join(remotion, 'src/sfx.ts'))),
    cuesSha256:sha(fs.readFileSync(path.join(remotion,'cues.json')))};
}
