import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assertFilmBackgroundSnapshot} from './talkcraft-film-background.mjs';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {assertPresentationIntegrity} from './talkcraft-presentation-integrity.mjs';

const source=path.dirname(fileURLToPath(import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function assertReviewedShellExtension(project,shell,target){
  const src=path.join(project,'remotion/src');
  const exact=(name,original)=>{
    const file=path.join(src,name);
    if(!fs.existsSync(file)||!fs.readFileSync(file).equals(original))
      throw Error('受控渲染扩展源码变化或缺失：'+name);
  };
  if(shell==='NativePresentationRoot.tsx'&&target==='./talkcraft-presentation-runtime'){
    exact('talkcraft-presentation-runtime.tsx',fs.readFileSync(path.join(source,'talkcraft-presentation-runtime.tsx')));
    exact('talkcraft-color-contrast.mjs',fs.readFileSync(path.join(source,'talkcraft-color-contrast.mjs')));
    assertPresentationIntegrity(project);
    return true;
  }
  const film=(shell==='Main.tsx'&&['./film-background','./film-background-config'].includes(target))||
    (shell==='scenes/scene-shared.tsx'&&target==='../film-background');
  if(film){
    exact('film-background.tsx',fs.readFileSync(path.join(source,'talkcraft-film-background.tsx')));
    const record=JSON.parse(fs.readFileSync(path.join(project,'qa/film-background-preparation.json'),'utf8'));
    if(record.schema!=='talkcraft-film-background-preparation-v1'||
      record.sourceSha256!==sha(fs.readFileSync(path.join(project,'source-run.json'))))
      throw Error('受控背景扩展与当前任务输入不一致');
    assertFilmBackgroundSnapshot(project,record.snapshot);
    exact('film-background-config.ts',Buffer.from(`export const FILM_BACKGROUND = ${JSON.stringify(record.snapshot)} as const;\n`));
    return true;
  }
  if(shell==='scenes/scene-shared.tsx'&&target==='../talkcraft-background-presentation.mjs'){
    for(const name of ['talkcraft-background-presentation.mjs','talkcraft-text-video.mjs'])
      exact(name,fs.readFileSync(path.join(source,name)));
    return true;
  }
  if(shell==='scenes/scene-shared.tsx'&&target==='../theme-frame'){
    const upstream=resolveTalkcraftSkillRoot(path.resolve(source,'..'));
    const frame=fs.readFileSync(path.join(upstream,'template/components/theme-frame.tsx'),'utf8');
    if(!frame.includes("from './lib'"))throw Error('原版ThemeFrame依赖已变化');
    exact('theme-frame.tsx',Buffer.from(frame.replace("from './lib'","from './theme-frame-lib'")));
    exact('theme-frame-lib.tsx',fs.readFileSync(path.join(upstream,'template/components/lib.tsx')));
    return true;
  }
  return false;
}
