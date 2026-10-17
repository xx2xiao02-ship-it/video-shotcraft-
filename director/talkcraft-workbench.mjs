import {execFileSync, spawn} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {talkcraftProject} from './talkcraft-status.mjs';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {ensureTalkcraftRenderRuntime} from './talkcraft-render-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = resolveTalkcraftSkillRoot(ROOT);

function linkDirectory(target, link) {
  if (existsSync(link)) {
    if (realpathSync(link).toLowerCase() !== realpathSync(target).toLowerCase()) {
      throw new Error(`Existing workbench link points elsewhere: ${link}`);
    }
    return;
  }
  symlinkSync(target, link, 'junction');
}

export function prepareTalkcraftWorkbench(root, skillRoot, runId) {
  const project = talkcraftProject(root, runId);
  const source = path.join(skillRoot, 'workbench');
  const workbench = path.join(project, 'workbench');
  const remotion = path.join(project, 'remotion');
  if (!existsSync(path.join(remotion, 'src', 'index.ts')) || !existsSync(path.join(remotion, 'shots.json'))) {
    throw new Error('TalkCraft Remotion project is not scaffolded');
  }
  ensureTalkcraftRenderRuntime(project,skillRoot);
  if (!existsSync(path.join(skillRoot, 'runtime', 'node_modules', 'vite', 'bin', 'vite.js'))) {
    throw new Error('TalkCraft shared runtime is not installed');
  }
  if (!existsSync(workbench)) {
    cpSync(source, workbench, {recursive:true, filter:item => {
      const relative = path.relative(source, item).replaceAll('\\', '/');
      return !relative || !['node_modules', 'tplcards', 'public', 'docs', 'tests', 'dist', 'exports'].some(
        excluded => relative === excluded || relative.startsWith(`${excluded}/`));
    }});
  }
  linkDirectory(path.join(skillRoot, 'scripts'), path.join(project, 'scripts'));
  linkDirectory(path.join(skillRoot, 'runtime', 'node_modules'), path.join(workbench, 'node_modules'));
  linkDirectory(path.join(skillRoot, 'template', 'cards'), path.join(workbench, 'tplcards'));
  linkDirectory(path.join(remotion, 'src'), path.join(workbench, 'kbsrc'));
  const publicDir = path.join(workbench, 'public');
  mkdirSync(publicDir, {recursive:true});
  const previews = path.join(skillRoot, 'gallery', 'media');
  if (existsSync(previews)) linkDirectory(previews, path.join(publicDir, 'cardpreviews'));
  linkDirectory(path.join(skillRoot, 'gallery', 'thumbs'), path.join(publicDir, 'cardthumbs'));
  for (const name of ['broll', 'pages', 'sfx']) {
    const target = path.join(remotion, 'public', name);
    if (existsSync(target)) linkDirectory(target, path.join(publicDir, name));
  }
  const narration = path.join(remotion, 'public', 'narration.mp3');
  if (existsSync(narration) && !existsSync(path.join(publicDir, 'narration.mp3'))) {
    cpSync(narration, path.join(publicDir, 'narration.mp3'));
  }
  execFileSync(process.execPath, [path.join(workbench, 'scripts', 'gen-index.mjs')],
    {cwd:workbench, windowsHide:true, stdio:'pipe'});
  return {project, workbench};
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

export function readTalkcraftWorkbench(root, runId) {
  const project = talkcraftProject(root, runId);
  const file = path.join(project, 'workbench-server.json');
  if (!existsSync(file)) return null;
  const state = JSON.parse(readFileSync(file, 'utf8'));
  if (state.runId !== runId || !Number.isInteger(state.port) || !Number.isInteger(state.pid)) return null;
  try {
    process.kill(state.pid, 0);
    const actual = realpathSync(path.join(project, 'workbench', 'kbsrc'));
    const expected = realpathSync(path.join(project, 'remotion', 'src'));
    if (actual.toLowerCase() !== expected.toLowerCase()) return null;
  } catch { return null; }
  return {...state, url:`http://127.0.0.1:${state.port}/?tracks`};
}

export async function startTalkcraftWorkbench(root, skillRoot, runId) {
  const previous = readTalkcraftWorkbench(root, runId);
  if (previous) {
    try { if ((await fetch(previous.url)).ok) return previous; } catch {}
    throw new Error('Previous workbench process is alive but its HTTP endpoint is unavailable');
  }
  const {project, workbench} = prepareTalkcraftWorkbench(root, skillRoot, runId);
  const port = await freePort();
  const vite = path.join(skillRoot, 'runtime', 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {cwd:workbench, windowsHide:true, detached:true, stdio:'ignore'});
  if (!child.pid) throw new Error('Workbench process did not start');
  const url = `http://127.0.0.1:${port}/?tracks`;
  for (let attempt=0; attempt<60; attempt++) {
    try {
      const response = await fetch(url, {signal:AbortSignal.timeout(1000)});
      if (response.ok) {
        const state = {schema:'talkcraft-workbench-v1', runId, port, pid:child.pid,
          startedAt:new Date().toISOString()};
        writeFileSync(path.join(project, 'workbench-server.json'), JSON.stringify(state, null, 2));
        child.unref();
        return {...state, url};
      }
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Workbench did not pass HTTP startup check');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await startTalkcraftWorkbench(ROOT, SKILL, process.argv[2] || ''), null, 2));
}
