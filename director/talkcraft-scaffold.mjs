import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {normalizeTheme, readCurrentTheme, themeAdapter} from './theme-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = resolveTalkcraftSkillRoot(ROOT);
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

export function scaffoldTalkcraftProject(root, skillRoot, runId) {
  if (!RUN_ID.test(runId)) throw new Error('Invalid B run ID');
  const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  const remotion = path.join(project, 'remotion');
  const src = path.join(remotion, 'src');
  if (existsSync(src)) throw new Error('TalkCraft source already exists; existing work was preserved');
  const shots = JSON.parse(readFileSync(path.join(remotion, 'shots.json'), 'utf8'));
  const timing = JSON.parse(readFileSync(path.join(remotion, 'timing.json'), 'utf8'));
  if (!Array.isArray(shots) || !shots.length || !Array.isArray(timing.scenes) || !timing.scenes.length) {
    throw new Error('Aligned timing and reviewed shots are required before scaffolding');
  }
  if (shots[0].start !== 0 || shots.some((shot, index) => !shot.id || shot.end <= shot.start ||
      (index && Math.abs(shot.start - shots[index - 1].end) > 0.001))) {
    throw new Error('Reviewed shots do not form a continuous timeline');
  }
  const source = JSON.parse(readFileSync(path.join(project, 'source-run.json'), 'utf8'));
  if (Math.abs(shots.at(-1).end - source.totalFrames / source.fps) > 0.001) {
    throw new Error('Reviewed shots do not cover the complete audio');
  }
  const theme = normalizeTheme(source.themeSnapshot || readCurrentTheme(root));
  const bTheme = themeAdapter(theme, 'B');
  const upstream = path.join(skillRoot, 'template', 'motion-systems');
  const runtimePackage = JSON.parse(readFileSync(path.join(skillRoot, 'runtime', 'package.json'), 'utf8'));
  if (!existsSync(path.join(upstream, 'camera.tsx')) || !existsSync(path.join(upstream, 'params.ts'))) {
    throw new Error('TalkCraft source systems are unavailable');
  }

  mkdirSync(path.join(src, 'scenes'), {recursive:true});
  mkdirSync(path.join(remotion, 'public'), {recursive:true});
  copyFileSync(path.join(upstream, 'camera.tsx'), path.join(src, 'camera.tsx'));
  copyFileSync(path.join(upstream, 'params.ts'), path.join(src, 'params.ts'));
  copyFileSync(path.join(upstream, 'timing.ts'), path.join(src, 'timing.ts'));
  writeFileSync(path.join(src, 'timing.ts'), readFileSync(path.join(src, 'timing.ts'), 'utf8') + `
export const cleanText = (value: string) => value.replace(/[\\s，。？！；：、]/gu, '');
export const atChar = (sceneIndex: number, query: string, occurrence=0): number => {
  const scene=timing.scenes[sceneIndex];
  if (!scene || !query) return 0;
  let from=0, found=-1;
  for (let i=0;i<=occurrence;i++) {
    found=scene.text.indexOf(query,from);
    if (found<0) return 0;
    from=found+query.length;
  }
  return scene.chars[found]?.t ?? 0;
};
`, 'utf8');
  copyFileSync(path.join(remotion, 'timing.json'), path.join(src, 'timing.json'));
  copyFileSync(path.join(project, 'audio', 'full.mp3'), path.join(remotion, 'public', 'narration.mp3'));
  copyFileSync(path.join(skillRoot, 'LICENSE'), path.join(project, 'TALKCRAFT-LICENSE'));
  copyFileSync(path.join(skillRoot, 'THIRD_PARTY_NOTICES.md'), path.join(project, 'TALKCRAFT-THIRD_PARTY_NOTICES.md'));
  writeFileSync(path.join(remotion, 'overrides.json'), '{}\n', 'utf8');
  writeFileSync(path.join(remotion, 'package.json'), JSON.stringify({name:'talkcraft-b-run', private:true, type:'module',
    scripts:{studio:'remotion studio src/index.ts'},
    dependencies:Object.fromEntries(['remotion', 'react', 'react-dom'].map(name => [name, runtimePackage.dependencies[name]])),
    devDependencies:{'@remotion/cli':runtimePackage.dependencies['@remotion/cli'],
      typescript:runtimePackage.devDependencies.typescript}}, null, 2), 'utf8');

  const shotDefs = shots.map((shot, index) => ({
    id:shot.id, startSec:shot.start, durationSec:shot.end - shot.start,
    lead:0, tail:0, path:[{t:0, scale:index % 2 ? 1.05 : 1},
      {t:shot.end - shot.start, scale:index % 2 ? 1 : 1.05}], impulses:[],
  }));
  writeFileSync(path.join(src, 'shots.ts'), `import type {CamKey, CamImpulse} from './camera';
export const FPS = 30;
export const TOTAL_FRAMES = ${source.totalFrames};
export type Shot = {id:string; startSec:number; durationSec:number; lead:number; tail:number; path:CamKey[]; impulses:CamImpulse[]};
export const SHOTS: Shot[] = ${JSON.stringify(shotDefs, null, 2)};
export const shotSequence = (shot: Shot, fps=FPS) => ({from:Math.round(shot.startSec*fps)-shot.lead,
  duration:Math.round(shot.durationSec*fps)+shot.lead+shot.tail});
export const darkAt = (_sec:number) => false;
`, 'utf8');
  writeFileSync(path.join(src, 'sfx.ts'), `export type SfxCue = {t:number; file:string; volume:number};
export const CUES: SfxCue[] = [];
export const SFX_CUES = CUES;
export const cues = CUES;
`, 'utf8');
  writeFileSync(path.join(src, 'theme.ts'), `export const THEME = ${JSON.stringify(bTheme.tokens, null, 2)} as const;
export const THEME_META = ${JSON.stringify({schema:bTheme.schema, themeId:bTheme.themeId, themeHash:bTheme.themeHash}, null, 2)} as const;
export const CSS_VARS = ${JSON.stringify(bTheme.cssVars, null, 2)} as const;
`, 'utf8');
  writeFileSync(path.join(src, 'scenes', 'index.ts'), `export const SCENES = {
};
export const SCENE_PARAMS = {
};
`, 'utf8');
  writeFileSync(path.join(src, 'Environment.tsx'), `import React from 'react';
import {AbsoluteFill} from 'remotion';
export const Environment: React.FC = () => <AbsoluteFill style={{background:'var(--sc-bg)', color:'var(--sc-text)', fontFamily:'var(--sc-font-family)'}} />;
export const Overlays: React.FC = () => null;
export const ShapeWipes: React.FC = () => null;
`, 'utf8');
  writeFileSync(path.join(src, 'Subtitles.tsx'), `import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {timing} from './timing';
const BREAKS = new Set(['，','。','？','！','；','：']);
export const phrases = () => {
  const out: Array<{text:string;start:number;end:number;dark:boolean}> = [];
  for (const scene of timing.scenes) {
    let chars: typeof scene.chars = [];
    const flush = () => {
      const spoken=chars.filter(c=>c.ch.trim() && !BREAKS.has(c.ch));
      const text=chars.map(c=>c.ch).join('').replace(/[，。？！；：、]/gu,'').trim();
      if (spoken.length && text) out.push({text,start:spoken[0].t,end:spoken.at(-1)!.e,dark:false});
      chars=[];
    };
    for (const char of scene.chars) {
      chars.push(char);
      if (BREAKS.has(char.ch) || chars.length>=24) flush();
    }
    flush();
  }
  return out.map((phrase,index) => ({...phrase,end:out[index+1]?.start ?? timing.totalSec}));
};
export const SubtitleLine: React.FC<{text:string; dark?:boolean}> = ({text}) =>
  <AbsoluteFill style={{justifyContent:'flex-end', alignItems:'center', pointerEvents:'none'}}>
    <div style={{maxWidth:1480, marginBottom:75, padding:'8px 18px', textAlign:'center',
      fontFamily:'var(--sc-font-family)', fontSize:text.length>24?38:44,
      fontWeight:600, lineHeight:1.3, color:'var(--sc-caption-color, var(--sc-text))', background:'color-mix(in srgb, var(--sc-surface) 76%, transparent)'}}>{text}</div>
  </AbsoluteFill>;
export const Subtitles: React.FC = () => {
  const frame=useCurrentFrame(); const {fps}=useVideoConfig();
  const now=frame/fps; const line=phrases().find(p=>now>=p.start && now<p.end);
  return line ? <SubtitleLine text={line.text} /> : null;
};
`, 'utf8');
  writeFileSync(path.join(src, 'Main.tsx'), `import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {CameraRig} from './camera';
import {Environment, Overlays} from './Environment';
import {Subtitles} from './Subtitles';
import {SHOTS, shotSequence, type Shot} from './shots';
import {SCENES} from './scenes';
import {CUES} from './sfx';
import {CSS_VARS} from './theme';
const PlaceholderScene: React.FC<{shot:Shot}> = () => null;
export const Main: React.FC<{sfxSolo?:boolean; bgm?:{src:string; volume:number}|null}> = ({sfxSolo=false,bgm=null}) => <AbsoluteFill style={CSS_VARS as React.CSSProperties}>
  <Environment />
  {SHOTS.map(shot => {
    const range=shotSequence(shot); const Scene=(SCENES as Record<string, React.FC<{shot:Shot}>>)[shot.id] || PlaceholderScene;
    return <Sequence key={shot.id} from={range.from} durationInFrames={range.duration}>
      <CameraRig path={shot.path} impulses={shot.impulses} durationSec={shot.durationSec} leadFrames={shot.lead}>
        <Scene shot={shot} />
      </CameraRig>
    </Sequence>;
  })}
  <Overlays /><Subtitles />
  {!sfxSolo && <Audio src={staticFile('narration.mp3')} />}
  {!sfxSolo && bgm && <Audio src={staticFile(bgm.src)} loop volume={(frame) =>
    bgm.volume * Math.max(0, Math.min(1, frame / 30, (${source.totalFrames} - frame - 1) / 15))} />}
  {CUES.map((cue,index) => <Sequence key={index} from={Math.round(cue.t*30)}>
    <Audio src={staticFile('sfx/'+cue.file)} volume={cue.volume} />
  </Sequence>)}
</AbsoluteFill>;
`, 'utf8');
  writeFileSync(path.join(src, 'Root.tsx'), `import React from 'react';
import {Composition} from 'remotion';
import {Main} from './Main';
export const Root: React.FC = () =>
  <Composition id="Main" component={Main} durationInFrames={${source.totalFrames}} fps={30} width={1920} height={1080} defaultProps={{sfxSolo:false}} />;
`, 'utf8');
  writeFileSync(path.join(src, 'index.ts'), `import {registerRoot} from 'remotion';
import {Root} from './Root';
registerRoot(Root);
`, 'utf8');
  return {project, shots:shots.length, contract:'skeleton', implementedScenes:0};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(scaffoldTalkcraftProject(ROOT, SKILL, process.argv[2] || ''), null, 2));
}
