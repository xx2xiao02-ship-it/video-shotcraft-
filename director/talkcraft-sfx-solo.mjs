import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');

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
  const audio = body.children.filter(containsAudio).map(node => node.getFullText(file));
  if (!audio.length || !audio.some(text => /CUES\.map\s*\(/u.test(text)) || audio.some(text => /<(?:OffthreadVideo|Video)\b/u.test(text)))
    throw Error('无法独立提取正式入口的音效节点，禁止用空音轨替代');
  return source.slice(0, body.openingElement.end) + '\n' + audio.join('\n') + '\n' + source.slice(body.closingElement.getStart(file));
}

export function prepareSfxSoloProject(project, skillRoot) {
  const remotion = path.join(project, 'remotion');
  const staging = path.join(project, '.render-temp', `sfx-solo-${process.pid}-${Date.now()}`);
  const runtime = path.join(skillRoot, 'runtime', 'node_modules');
  const require = createRequire(path.join(runtime, 'typescript', 'package.json'));
  const original = fs.readFileSync(path.join(remotion, 'src/Main.tsx'), 'utf8');
  const isolated = audioOnlyMain(original, require('typescript'));
  fs.mkdirSync(staging, {recursive:true});
  fs.cpSync(path.join(remotion, 'src'), path.join(staging, 'src'), {recursive:true});
  for (const entry of fs.readdirSync(remotion, {withFileTypes:true})) {
    if (entry.isFile() && /(?:\.json|^remotion\.config\.[cm]?[jt]s)$/u.test(entry.name))
      fs.copyFileSync(path.join(remotion, entry.name), path.join(staging, entry.name));
  }
  fs.symlinkSync(path.join(remotion, 'public'), path.join(staging, 'public'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.symlinkSync(runtime, path.join(staging, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(path.join(staging, 'src/Main.tsx'), isolated);
  return {staging, originalMainSha256:sha(original), audioMainSha256:sha(isolated),
    sourceSfxSha256:sha(fs.readFileSync(path.join(remotion, 'src/sfx.ts')))};
}
