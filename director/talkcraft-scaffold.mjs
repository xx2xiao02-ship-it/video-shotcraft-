import {assertReviewedSelection} from './talkcraft-reviewed-templates.mjs';
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {installTalkcraftCardRuntime} from './talkcraft-card-runtime.mjs';
import {canonicalCardId, loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {normalizeTheme, readCurrentTheme, themeAdapter, videoDimensions} from './theme-contract.mjs';
import {ensureTalkcraftRenderRuntime} from './talkcraft-render-runtime.mjs';
import {installBundledFonts} from './bundled-fonts.mjs';
import {assertParallelPreparationJoined,createPreparedTalkcraftResolver} from './talkcraft-parallel-preparation.mjs';
import {snapshotFilmBackground,assertFilmBackgroundSnapshot} from './talkcraft-film-background.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = resolveTalkcraftSkillRoot(ROOT);
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

// 口播句之间可以有真实停顿。分镜边界仍保持原始口播时间，渲染工程则把停顿
// 交给上一镜头的最后一帧承接，避免审核通过后搭建阶段因为“视觉空洞”直接失败。
function bridgeVisualTimelineGaps(shots) {
  return shots.map((shot, index) => {
    const end = Number(shot.end);
    const nextStart = Number(shots[index + 1]?.start);
    const bridgedEnd = Number.isFinite(nextStart) && nextStart > end + 0.001 ? nextStart : end;
    return bridgedEnd > end
      ? {...shot, end:bridgedEnd, visualHoldSec:Number((bridgedEnd - end).toFixed(3))}
      : {...shot, visualHoldSec:0};
  });
}

export function scaffoldTalkcraftProject(root, skillRoot, runId, {sampleOnly=true, emptyScenes=false}={}) {
  if (!RUN_ID.test(runId)) throw new Error('Invalid B run ID');
  const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  assertReviewedSelection(project,{skillRoot});
  assertParallelPreparationJoined(project);
  const prepared=createPreparedTalkcraftResolver(project);
  const remotion = path.join(project, 'remotion');
  const src = path.join(remotion, 'src');
  if (existsSync(src)) {
    const complete = ['shots.ts','index.ts','scenes/index.ts'].every(file => existsSync(path.join(src,file)));
    if (complete) throw new Error('TalkCraft source already exists; existing work was preserved');
  }
  const plannedShots = JSON.parse(readFileSync(path.join(remotion, 'shots.json'), 'utf8'));
  const timing = JSON.parse(readFileSync(path.join(remotion, 'timing.json'), 'utf8'));
  if (!Array.isArray(plannedShots) || !plannedShots.length || !Array.isArray(timing.scenes) || !timing.scenes.length) {
    throw new Error('Aligned timing and reviewed shots are required before scaffolding');
  }
  const shots = bridgeVisualTimelineGaps(plannedShots);
  if (shots[0].start !== 0 || shots.some((shot, index) => !shot.id || shot.end <= shot.start ||
      (index && Math.abs(shot.start - shots[index - 1].end) > 0.001))) {
    throw new Error('Reviewed shots do not form a continuous timeline');
  }
  const bridges = shots.filter(shot => shot.visualHoldSec > 0)
    .map(shot => ({shotId:shot.id, fromSec:Number((shot.end - shot.visualHoldSec).toFixed(3)), toSec:shot.end, durationSec:shot.visualHoldSec}));
  if (bridges.length) {
    mkdirSync(path.join(project, 'qa'), {recursive:true});
    writeFileSync(path.join(project, 'qa', 'visual-timeline-bridges.json'), JSON.stringify({
      schema:'talkcraft-visual-timeline-bridges-v1', runId, source:'remotion/shots.json', bridges,
      note:'口播停顿由上一镜头最后一帧承接；未改写原始分镜边界。'
    }, null, 2), 'utf8');
  }
  const source = JSON.parse(readFileSync(path.join(project, 'source-run.json'), 'utf8'));
  if (Math.abs(shots.at(-1).end - source.totalFrames / source.fps) > 0.001) {
    throw new Error('Reviewed shots do not cover the complete audio');
  }
  const theme = normalizeTheme(source.themeSnapshot || readCurrentTheme(root));
  const bTheme = themeAdapter(theme, 'B');
  const {width, height} = videoDimensions(source.aspectRatio || source.themeSnapshot?.aspectRatio || '16:9');
  const upstream = path.join(skillRoot, 'template', 'motion-systems');
  const governedCatalog = loadTalkcraftGovernedCatalog(JSON.parse(readFileSync(path.join(skillRoot,'references/cards-index.json'),'utf8')));
  const runtimePackage = JSON.parse(readFileSync(path.join(skillRoot, 'runtime', 'package.json'), 'utf8'));
  if (!existsSync(path.join(upstream, 'camera.tsx')) || !existsSync(path.join(upstream, 'params.ts'))) {
    throw new Error('TalkCraft source systems are unavailable');
  }

  mkdirSync(path.join(src, 'scenes'), {recursive:true});
  mkdirSync(path.join(src, 'cards'), {recursive:true});
  mkdirSync(path.join(remotion, 'public'), {recursive:true});
  installBundledFonts(ROOT, remotion,{resolveSource:prepared});
  const runtimeContracts = Object.fromEntries(governedCatalog.cards.map(card=>[card.cardId,{
    fields:card.fields.map(field=>field.key),locked:card.fields.filter(field=>!field.writable).map(field=>field.key),
    required:card.policy.required,blankAllowed:card.fields.filter(field=>field.blankAllowed).map(field=>field.key),media:card.policy.media}]));
  writeFileSync(path.join(src,'card-contracts.ts'),`export const CARD_CONTRACTS: Record<string,{fields:string[];locked:string[];required:string[];blankAllowed:string[];media:Record<string,string>}> = ${JSON.stringify(runtimeContracts,null,2)};\n`);
  copyFileSync(path.join(ROOT, 'director', 'talkcraft-scene-shared.tsx'), path.join(src, 'scenes', 'scene-shared.tsx'));
  copyFileSync(path.join(ROOT, 'director', 'talkcraft-template-adapter.tsx'), path.join(src, 'talkcraft-template-adapter.tsx'));
  const filmBackground=source.backgroundSnapshot
    ? assertFilmBackgroundSnapshot(project,source.backgroundSnapshot) : snapshotFilmBackground(root,project);
  copyFileSync(path.join(ROOT,'director','talkcraft-film-background.tsx'),path.join(src,'film-background.tsx'));
  writeFileSync(path.join(src,'film-background-config.ts'),`export const FILM_BACKGROUND = ${JSON.stringify(filmBackground)} as const;\n`);
  copyFileSync(path.join(ROOT, 'director', 'talkcraft-host-context.mjs'), path.join(src, 'talkcraft-host-context.mjs'));
  const cardAlias = {
    'data/odometer-digit-roll':'number-counter',
    'ui-entrance/list-reveal':'chapter-progress-list',
    'outro/neon-triple-marquee':'word-relay-filmstrip',
    'typography/title-demote-to-label':'title-demote-to-label',
    'interaction/chip-grid-single-select':'chip-grid-single-select',
  };
  const cardsRoot = path.join(skillRoot, 'template', 'cards');
  const cardFiles = readdirSync(cardsRoot).filter(name => name.endsWith('.tsx')).sort();
  const registryRows = [];
  for (const filename of cardFiles) {
    const slug = filename.slice(0, -4);
    const sourceCard = path.join(cardsRoot, filename);
    const destinationCard = path.join(src, 'cards', filename);
    copyFileSync(prepared(sourceCard), destinationCard);
    const identifier = `Card${registryRows.length}`;
    registryRows.push(`import ${identifier} from './${slug}';`);
    registryRows.push(`  '${slug}': ${identifier},`);
  }
  const imports = registryRows.filter(line => line.startsWith('import ')).join('\n');
  const entries = registryRows.filter(line => line.startsWith('  ')).join('\n');
  writeFileSync(path.join(src, 'cards', 'index.ts'), `import React from 'react';\n${imports}\nexport const CARD_REGISTRY: Record<string, React.ComponentType<any>> = {\n${entries}\n};\n`, 'utf8');
  installTalkcraftCardRuntime(skillRoot, src);
  const normalizedCards = new Map();
  for (const shot of shots) {
    const requested = String(shot.shotCard || 'impact-open-title');
    const slug = cardAlias[requested] || canonicalCardId(requested, governedCatalog);
    const filename = `${slug.split('/').at(-1)}.tsx`;
    const sourceCard = path.join(skillRoot, 'template', 'cards', filename);
    if (!existsSync(sourceCard)) throw new Error(`GitHub TalkCraft 卡片不存在：${requested} -> ${filename}`);
    normalizedCards.set(requested, slug);
  }
  copyFileSync(prepared(path.join(upstream, 'camera.tsx')), path.join(src, 'camera.tsx'));
  copyFileSync(prepared(path.join(upstream, 'params.ts')), path.join(src, 'params.ts'));
  copyFileSync(prepared(path.join(upstream, 'timing.ts')), path.join(src, 'timing.ts'));
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
  // The upstream Node renderer reads explicit project encode settings.
  // JPEG-80 intermediates introduced temporal text noise even at concurrency
  // one; lossless PNG intermediates preserve the card's original motion.
  const renderConfig=path.join(remotion,'remotion.config.js');
  if(!existsSync(renderConfig)&&!existsSync(path.join(remotion,'remotion.config.ts')))
    writeFileSync(renderConfig,"import {Config} from '@remotion/cli/config';\nConfig.setVideoImageFormat('png');\nConfig.setCrf(10);\n",'utf8');
  writeFileSync(path.join(remotion, 'package.json'), JSON.stringify({name:'talkcraft-b-run', private:true, type:'module',
    scripts:{studio:'remotion studio src/index.ts'},
    dependencies:Object.fromEntries(['remotion', 'react', 'react-dom'].map(name => [name, runtimePackage.dependencies[name]])),
    devDependencies:{'@remotion/cli':runtimePackage.dependencies['@remotion/cli'],
      typescript:runtimePackage.devDependencies.typescript}}, null, 2), 'utf8');
  ensureTalkcraftRenderRuntime(project,skillRoot);

  const shotDefs = shots.map((shot, index) => ({
    id:shot.id, subject:shot.subject || 'other', startSec:shot.start, durationSec:shot.end - shot.start,
    shotCard:normalizedCards.get(shot.shotCard || '') || shot.shotCard || null, templateParams:shot.templateParams || {},
    lead:0, tail:0, path:[{t:0, scale:index % 2 ? 1.05 : 1},
      {t:shot.end - shot.start, scale:index % 2 ? 1 : 1.05}], impulses:[],
  }));
  writeFileSync(path.join(src, 'shots.ts'), `import type {CamKey, CamImpulse} from './camera';
export const FPS = 30;
export const TOTAL_FRAMES = ${source.totalFrames};
export type Shot = {id:string; subject:'person'|'other'; shotCard:string|null; templateParams:Record<string, unknown>; startSec:number; durationSec:number; lead:number; tail:number; path:CamKey[]; impulses:CamImpulse[]};
export const SHOTS: Shot[] = ${JSON.stringify(shotDefs, null, 2)};
export const shotSequence = (shot: Shot, fps=FPS) => ({from:Math.round(shot.startSec*fps)-shot.lead,
  duration:Math.round((shot.startSec+shot.durationSec)*fps)-Math.round(shot.startSec*fps)+shot.lead+shot.tail});
export const darkAt = (_sec:number) => false;
`, 'utf8');
  writeFileSync(path.join(src, 'sfx.ts'), `export type SfxCue = {t:number; file:string; volume:number; rate?:number; clip?:number};
export const CUES: SfxCue[] = [];
export const SFX_CUES = CUES;
export const cues = CUES;
`, 'utf8');
  writeFileSync(path.join(src, 'theme.ts'), `export const THEME = ${JSON.stringify(bTheme.tokens, null, 2)} as const;
export const THEME_META = ${JSON.stringify({schema:bTheme.schema, themeId:bTheme.themeId, themeHash:bTheme.themeHash}, null, 2)} as const;
export const CSS_VARS = ${JSON.stringify(bTheme.cssVars, null, 2)} as const;
`, 'utf8');
  implementNativeScenes(project,skillRoot,{sampleOnly,emptyScenes});
  writeFileSync(path.join(src, 'Environment.tsx'), `import React from 'react';
import {FilmBackground} from './film-background';
export const Environment = FilmBackground;
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
export const SubtitleLine: React.FC<{text:string; dark?:boolean}> = ({text}) => {
  const {width,height}=useVideoConfig(); const portrait=height>width;
  return <AbsoluteFill style={{justifyContent:'flex-end', alignItems:'center', pointerEvents:'none'}}>
    <div style={{maxWidth:portrait?'84%':1480, marginBottom:portrait?Math.round(height*0.22):75,
      padding:'8px 18px', textAlign:'center', overflowWrap:'anywhere',
      fontFamily:'var(--sc-font-family)', fontSize:portrait?42:(text.length>24?38:44),
      fontWeight:600, lineHeight:1.3, color:'var(--sc-caption-color, var(--sc-text))', background:'color-mix(in srgb, var(--sc-surface) 76%, transparent)'}}>{text}</div>
  </AbsoluteFill>;
};
export const Subtitles: React.FC = () => {
  const frame=useCurrentFrame(); const {fps}=useVideoConfig();
  const now=frame/fps; const line=phrases().find(p=>now>=p.start && now<p.end);
  return line ? <SubtitleLine text={line.text} /> : null;
};
`, 'utf8');
  writeFileSync(path.join(src, 'Main.tsx'), `import React from 'react';
import {AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {CameraRig} from './camera';
import {Environment, Overlays} from './Environment';
import {FilmBackgroundProvider,type FilmBackgroundConfig} from './film-background';
import {FILM_BACKGROUND} from './film-background-config';
import {Subtitles} from './Subtitles';
import {SHOTS, shotSequence, type Shot} from './shots';
import {hostStageStyle} from './talkcraft-host-context.mjs';
import {SCENES} from './scenes';
import {CUES} from './sfx';
import {CSS_VARS} from './theme';
import {THEME} from './theme';
import {BundledFonts} from './BundledFonts';
import {timing} from './timing';
const DefaultScene: React.FC<{shot:Shot}> = ({shot}) => {
  throw new Error('正式模板场景缺失，禁止自动补画：'+shot.id);
};
export const Main: React.FC<{sfxSolo?:boolean; bgm?:{src:string; volume:number}|null;filmBackground?:FilmBackgroundConfig}> = ({sfxSolo=false,bgm=null,filmBackground=FILM_BACKGROUND as FilmBackgroundConfig}) => <AbsoluteFill style={CSS_VARS as React.CSSProperties}><FilmBackgroundProvider value={filmBackground}>
  <BundledFonts fontFamily={THEME.fontFamily} />
  <Environment />
  {SHOTS.map(shot => {
    const range=shotSequence(shot); const Scene=(SCENES as Record<string, React.FC<{shot:Shot}>>)[shot.id] || DefaultScene;
    return <Sequence key={shot.id} from={range.from} durationInFrames={range.duration}>
      <CameraRig path={shot.path} impulses={shot.impulses} durationSec={shot.durationSec} leadFrames={shot.lead}>
        <Scene shot={shot} />
        {shot.subject === 'person' && <div style={hostStageStyle(shot.shotCard) as React.CSSProperties}>
          <OffthreadVideo src={staticFile('digital-human/'+shot.id+${JSON.stringify(source.workflowPath==='recorded-host'?'.mp4':'-transparent.webm')})} muted transparent={${source.workflowPath!=='recorded-host'}} style={{width:'100%',height:'100%',objectFit:'contain'}} />
        </div>}
      </CameraRig>
    </Sequence>;
  })}
  <Overlays /><Subtitles />
  {!sfxSolo && <Audio src={staticFile('narration.mp3')} />}
  {!sfxSolo && bgm && <Audio src={staticFile(bgm.src)} loop volume={(frame) =>
    bgm.volume * Math.max(0, Math.min(1, frame / 30, (${source.totalFrames} - frame - 1) / 15))} />}
  {CUES.map((cue,index) => <Sequence key={index} from={Math.round(cue.t*30)}>
    <Audio src={staticFile('sfx/'+cue.file)} volume={cue.volume} playbackRate={cue.rate ?? 1}
      trimAfter={cue.clip === undefined ? undefined : Math.max(1, Math.round(cue.clip*30))} />
  </Sequence>)}
</FilmBackgroundProvider></AbsoluteFill>;
`, 'utf8');
  writeFileSync(path.join(src, 'Root.tsx'), `import React from 'react';
import {Composition} from 'remotion';
import {Main} from './Main';
export const Root: React.FC = () =>
  <Composition id="Main" component={Main} durationInFrames={${source.totalFrames}} fps={30} width={${width}} height={${height}} defaultProps={{sfxSolo:false}} />;
`, 'utf8');
  writeFileSync(path.join(src, 'index.ts'), `import {registerRoot} from 'remotion';
import {Root} from './Root';
registerRoot(Root);
`, 'utf8');
  return {project, shots:shots.length, contract:'skeleton', implementedScenes:1};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(scaffoldTalkcraftProject(ROOT, SKILL, process.argv[2] || ''), null, 2));
}

export function implementNativeScenes(project,skillRoot,{sampleOnly=false,emptyScenes=false}={}) {
  assertReviewedSelection(project,{skillRoot});
  const src=path.join(project,'remotion/src');
  const shots=JSON.parse(readFileSync(path.join(project,'remotion/shots.json'),'utf8'));
  const selectedShots=emptyScenes?[]:sampleOnly?shots.filter(s=>s.id==='s01'):shots;
  const governedCatalog=loadTalkcraftGovernedCatalog(JSON.parse(readFileSync(path.join(skillRoot,'references/cards-index.json'),'utf8')));
  const sceneParams = [];
  for (const shot of selectedShots) {
    if (!/^s\d+[a-z]*$/u.test(shot.id)) throw new Error(`镜头 ID 无法用于场景注册：${shot.id}`);
    const card = governedCatalog.cards.find(card => card.cardId === shot.shotCard);
    const approved = shot.templateParams?.cardProps || {};
    // 只暴露治理契约允许修改、且编导实际提供的字段。禁止填演示默认内容。
    const fields = (card?.fields || []).filter(field => field.writable && Object.hasOwn(approved, field.key)).map(field => ({
      type:field.type,key:field.key,label:field.key,default:approved[field.key],
      ...Object.fromEntries(['min','max','step','options'].filter(key => field[key] !== undefined).map(key => [key,field[key]])),
    }));
    const fieldSource = fields.map(field => '{'+Object.entries(field).map(([key,value]) => `${key}:${JSON.stringify(value)}`).join(',')+'}').join(',\n');
    const sceneFile=path.join(src,'scenes',`${shot.id}.tsx`);
    if (existsSync(sceneFile)) {
      const previous=readFileSync(sceneFile,'utf8');
      const declaration=/export const PARAMS = \[[\s\S]*?\] as const;/u;
      if(!declaration.test(previous)||!previous.includes('const approved = (shot.templateParams.cardProps || {})'))
        throw new Error(`镜头 ${shot.id} 的场景包含自定义参数实现，请先核对模板变更，禁止覆盖`);
      const next=previous.replace(declaration,`export const PARAMS = [${fieldSource}] as const;`);
      if(next!==previous)writeFileSync(sceneFile,next,'utf8');
    } else writeFileSync(sceneFile, `import React from 'react';
import type {Shot} from '../shots';
import {useParams, type ParamField} from '../params';
import {TemplateScene} from './scene-shared';
export const PARAMS = [${fieldSource}] as const;
export const ${shot.id.toUpperCase()}: React.FC<{shot:Shot}> = ({shot}) => {
  const approved = (shot.templateParams.cardProps || {}) as Record<string,unknown>;
  // 同步后的业务参数是当前默认值，不能被工程创建时的旧文案覆盖。
  const fields = (PARAMS as readonly ParamField[]).map(field => ({...field,default:approved[field.key]} as ParamField));
  const values = useParams(shot.id, fields);
  return <TemplateScene shot={{...shot,templateParams:{...shot.templateParams,cardProps:{...approved,...values}}}} />;
};
`, 'utf8');
    sceneParams.push(`  ${shot.id}:${shot.id.toUpperCase()}_PARAMS,`);
  }
  const sceneImports = selectedShots.map(shot => `import {${shot.id.toUpperCase()}, PARAMS as ${shot.id.toUpperCase()}_PARAMS} from './${shot.id}';`).join('\n');
  const sceneRows = selectedShots.map(shot => `  ${shot.id}:${shot.id.toUpperCase()},`).join('\n');
  writeFileSync(path.join(src, 'scenes', 'index.ts'), `${sceneImports}\n\nexport const SCENES = {\n${sceneRows}\n};\nexport const SCENE_PARAMS = {\n${sceneParams.join('\n')}\n};\n`, 'utf8');

  return {implementedScenes:selectedShots.length};
}
