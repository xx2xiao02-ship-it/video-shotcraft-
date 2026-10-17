import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {audioOnlyMain,prepareSfxSoloProject,preserveStaleSfxSolo,sfxSoloCurrent} from './talkcraft-sfx-solo.mjs';
const require = createRequire(new URL('../_audit/video-talkcraft/runtime/package.json', import.meta.url));
const ts = require('typescript');
const cues = '{CUES.map((cue,index) => <Sequence key={index} from={Math.round(cue.t*30)}><Audio src={staticFile(cue.file)} volume={cue.volume} playbackRate={cue.rate ?? 1} trimAfter={cue.clip}/></Sequence>)}';
const voice = '{!sfxSolo && <Audio src={staticFile("narration.mp3")}/>}';
const source = `export const Main: React.FC<{sfxSolo?:boolean}> = ({sfxSolo=false}) => <AbsoluteFill><Environment/>{SHOTS.map(shot => <Sequence><OffthreadVideo src="invalid.mp4" muted/></Sequence>)}<Subtitles/>${voice}${cues}</AbsoluteFill>;`;
test('isolated audio retains exact production timing and mixing expressions', () => {
  const result = audioOnlyMain(source, ts);
  assert.ok(result.includes(cues)); assert.ok(result.includes(voice));
  assert.ok(!result.includes('<OffthreadVideo')); assert.ok(!result.includes('<Environment'));
  assert.ok(!result.includes('<Subtitles')); assert.equal(ts.createSourceFile('Main.tsx',result,99,true,4).parseDiagnostics.length,0);
});
test('unsupported and missing sound graphs fail closed', () => {
  assert.throws(() => audioOnlyMain('export const Main = () => <div/>;', ts), /不支持/);
  assert.throws(() => audioOnlyMain(source.replace(cues,''), ts), /禁止用空音轨/);
});
test('visual decoder mixed into an audio expression is rejected', () => {
  assert.throws(() => audioOnlyMain(source.replace(cues,cues.replace('<Audio','<OffthreadVideo/><Audio')),ts), /无法独立提取/);
});
test('staging preserves the approved source and binds the actual production audio module', t => {
  fs.mkdirSync('tmp',{recursive:true});
  const project=fs.mkdtempSync(path.resolve('tmp/sfx-staging-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  fs.mkdirSync(path.join(project,'remotion/src'),{recursive:true});
  fs.mkdirSync(path.join(project,'remotion/public'));
  fs.writeFileSync(path.join(project,'remotion/src/Main.tsx'),source);
  fs.writeFileSync(path.join(project,'remotion/src/sfx.ts'),'export const CUES=[];');
  fs.writeFileSync(path.join(project,'remotion/cues.json'),'[]');
  const result=prepareSfxSoloProject(project,path.resolve('_audit/video-talkcraft'));
  assert.equal(fs.readFileSync(path.join(project,'remotion/src/Main.tsx'),'utf8'),source);
  assert.equal(fs.readFileSync(path.join(result.staging,'src/sfx.ts'),'utf8'),'export const CUES=[];');
  assert.ok(!fs.readFileSync(path.join(result.staging,'src/Main.tsx'),'utf8').includes('<OffthreadVideo'));
  assert.equal(fs.existsSync(path.join(project,'remotion/out')),false);
  assert.equal(fs.realpathSync(path.join(result.staging,'public')),fs.realpathSync(path.join(project,'remotion/public')));
});
test('stale SFX-only audit track is archived when cue inputs change',t=>{
  fs.mkdirSync('tmp',{recursive:true});
  const project=fs.mkdtempSync(path.resolve('tmp/sfx-stale-'));t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  const put=(rel,value)=>{const file=path.join(project,...rel.split('/'));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
  put('remotion/src/Main.tsx','main');put('remotion/src/sfx.ts','sfx');put('remotion/cues.json','[]');put('remotion/out/sfx-solo.wav','audio');
  const digest=value=>createHash('sha256').update(value).digest('hex');
  put('qa/sfx-solo-render.json',JSON.stringify({schema:'talkcraft-sfx-solo-render-v1',originalMainSha256:digest('main'),sourceSfxSha256:digest('sfx'),cuesSha256:digest('[]'),outputSha256:digest('audio')}));
  assert.equal(sfxSoloCurrent(project),true);
  put('remotion/cues.json','[{"at":1}]');
  assert.equal(sfxSoloCurrent(project),false);
  const archive=preserveStaleSfxSolo(project,{now:()=>456});
  assert.equal(fs.readFileSync(path.join(archive,'sfx-solo.wav'),'utf8'),'audio');
  assert.equal(fs.existsSync(path.join(project,'remotion/out/sfx-solo.wav')),false);
});
