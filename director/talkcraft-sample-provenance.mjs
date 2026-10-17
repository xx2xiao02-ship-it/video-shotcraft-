import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
export function sampleInputs(project) {
  const remotion=path.join(project,'remotion');
  const shot=read(path.join(remotion,'shots.json')).find(s=>s.id==='s01');
  const files=['src/scenes/s01.tsx','src/scenes/scene-shared.tsx','src/talkcraft-template-adapter.tsx',
    'src/Main.tsx','src/Subtitles.tsx','src/timing.json','src/theme.ts','src/camera.tsx','overrides.json'];
  for(const file of ['src/talkcraft-presentation-skin.mjs','src/talkcraft-color-contrast.mjs','src/text-occurrences.mjs'])
    if(fs.existsSync(path.join(remotion,file)))files.push(file);
  const wordFile=path.join(remotion,'word-reveals.json'),presentation=path.join(remotion,'native-presentation.json');
  let nativeWords={};
  if(fs.existsSync(wordFile)&&fs.existsSync(presentation)){
    const events=read(wordFile).events.filter(e=>e.beatId==='s01'),policy=read(path.join(remotion,'text-readability.json'));
    nativeWords={wordEvents:events,presentation:read(presentation).shots.find(s=>s.shotId==='s01'),readability:Object.fromEntries(events.map(e=>[e.id,policy.byEvent?.[e.id]??null]))};
    for(const file of ['src/WordRevealRoot.tsx','src/NativePresentationRoot.tsx','src/native-time-map.mjs'])files.push(file);
  }
  return {shot,files:Object.fromEntries(files.map(f=>[f,hash(path.join(remotion,f))])),
    ...nativeWords,voice:hash(path.join(project,'audio/full.mp3')),
    cues:read(path.join(project,'qa/native-production-plan.json')).cues.filter(c=>c.shotId==='s01')};
}
export function nativeSampleCurrent(project) {
  const record=path.join(project,'qa/sample-render.json');
  // The older explicit card-call renderer has its own approved first-call
  // fingerprint. A shared scaffold file alone does not make it native.
  const calls=path.join(project,'qa/card-calls.json');
  if(!fs.existsSync(path.join(project,'qa/formal-bindings.json'))&&fs.existsSync(calls)) {
    try{const c=read(calls);if(c.schema==='talkcraft-card-calls-v1'&&Array.isArray(c.calls)&&c.calls.some(v=>v.shotId==='s01'))return true;}catch{}
  }
  if(!fs.existsSync(path.join(project,'remotion/src/scenes/scene-shared.tsx')))return true;
  if(!fs.existsSync(record))return false;
  try {const r=read(record);return r.sampleSha256===hash(path.join(project,'remotion/out/preview/s01.mp4'))&&
    JSON.stringify(r.inputs)===JSON.stringify(sampleInputs(project));}catch{return false;}
}
export function preservePreviousSample(project) {
  const file=path.join(project,'remotion/out/preview/s01.mp4');
  if(!fs.existsSync(file))return;
  if(nativeSampleCurrent(project))throw Error('首镜样板与当前输入一致，已保留；请先检查已有样板');
  const dir=path.join(project,'qa/sample-versions');fs.mkdirSync(dir,{recursive:true});
  fs.renameSync(file,path.join(dir,'s01-'+Date.now()+'.mp4'));
}
export function recordSampleRender(project) {
  fs.writeFileSync(path.join(project,'qa/sample-render.json'),JSON.stringify({schema:'talkcraft-sample-render-v1',
    inputs:sampleInputs(project),sampleSha256:hash(path.join(project,'remotion/out/preview/s01.mp4')),userAcceptance:false},null,2));
}
