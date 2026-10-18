import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareFilmBackground} from './talkcraft-film-background.mjs';
import {assertNoCustomDrawing} from './talkcraft-reviewed-templates.mjs';
import {assertReviewedShellExtension} from './talkcraft-shell-extension.mjs';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
const source=path.dirname(fileURLToPath(import.meta.url));
function fixture(t){
 const project=fs.mkdtempSync(path.join(os.tmpdir(),'shell-extension-'));
 t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
 const write=(name,text)=>{const file=path.join(project,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
 write('source-run.json','{}');
 const snapshot=prepareFilmBackground(project,project);
 write('remotion/src/film-background.tsx',fs.readFileSync(path.join(source,'talkcraft-film-background.tsx')));
 write('remotion/src/film-background-config.ts',`export const FILM_BACKGROUND = ${JSON.stringify(snapshot)} as const;\n`);
 write('remotion/src/Main.tsx',"import {FilmBackgroundProvider} from './film-background';\nimport {FILM_BACKGROUND} from './film-background-config';");
 return {project,write,snapshot};
}
test('正式门禁接受精确纸背景源码及本任务快照，仍拒绝未知扩展',t=>{
 const f=fixture(t);assert.equal(assertNoCustomDrawing(f.project).passed,true);
 f.write('remotion/src/Main.tsx',"import {Other} from './other';");
 assert.throws(()=>assertNoCustomDrawing(f.project),/未经登记/);
});
for(const kind of ['source','config','image','task'])test('受控背景拒绝篡改：'+kind,t=>{
 const f=fixture(t);
 const name={source:'remotion/src/film-background.tsx',config:'remotion/src/film-background-config.ts',image:'remotion/public/'+f.snapshot.src,task:'source-run.json'}[kind];
 f.write(name,'changed');assert.throws(()=>assertNoCustomDrawing(f.project));
});
test('背景展示及依赖必须精确匹配登记源码',t=>{
 const f=fixture(t);
 for(const name of ['talkcraft-background-presentation.mjs','talkcraft-text-video.mjs'])f.write('remotion/src/'+name,fs.readFileSync(path.join(source,name)));
 assert.equal(assertReviewedShellExtension(f.project,'scenes/scene-shared.tsx','../talkcraft-background-presentation.mjs'),true);
 f.write('remotion/src/talkcraft-text-video.mjs','changed');
 assert.throws(()=>assertReviewedShellExtension(f.project,'scenes/scene-shared.tsx','../talkcraft-background-presentation.mjs'),/源码变化/);
});
test('ThemeFrame只接受安装器规定的依赖重定位和原版lib',t=>{
 const f=fixture(t),upstream=resolveTalkcraftSkillRoot(path.resolve(source,'..'));
 const frame=fs.readFileSync(path.join(upstream,'template/components/theme-frame.tsx'),'utf8');
 f.write('remotion/src/theme-frame.tsx',frame.replace("from './lib'","from './theme-frame-lib'"));
 f.write('remotion/src/theme-frame-lib.tsx',fs.readFileSync(path.join(upstream,'template/components/lib.tsx')));
 assert.equal(assertReviewedShellExtension(f.project,'scenes/scene-shared.tsx','../theme-frame'),true);
 f.write('remotion/src/theme-frame-lib.tsx','changed');
 assert.throws(()=>assertReviewedShellExtension(f.project,'scenes/scene-shared.tsx','../theme-frame'),/源码变化/);
});
