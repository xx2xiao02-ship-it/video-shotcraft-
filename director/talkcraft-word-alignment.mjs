import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pythonExecutable,pythonEnvironment,requireChineseAlignmentSupport} from './portable-runtime.mjs';
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const normalize = value => String(value).normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
const inputs = project => Object.fromEntries(['audio/full.mp3','script.json'].map(file=>[file,hash(path.join(project,file))]));

export function readWordAlignment(project) {
  const proofFile=path.join(project,'qa/word-alignment.json');
  const file=path.join(project,'audio/word-timestamps.json');
  if (!fs.existsSync(proofFile) || !fs.existsSync(file)) return null;
  const proof=JSON.parse(fs.readFileSync(proofFile,'utf8'));
  if (proof.schema!=='talkcraft-word-alignment-v1' || proof.sha256!==hash(file) ||
      JSON.stringify(proof.inputs)!==JSON.stringify(inputs(project))) throw Error('字级对齐证据已过期，原配音已保留');
  const timing=JSON.parse(fs.readFileSync(file,'utf8'));
  const script=JSON.parse(fs.readFileSync(path.join(project,'script.json'),'utf8')).sentences;
  if (timing.sentences?.length!==script.length) throw Error('字级对齐句数与原稿不符');
  let previous=0;
  for (const [i,s] of timing.sentences.entries()) {
    if (s.text!==script[i] || s.ok!==true || !(s.match>=.9) || !s.words?.length ||
        normalize(s.words.map(w=>w.text).join(''))!==normalize(s.text)) throw Error(`第 ${i+1} 句字级对齐未通过，需人工核对`);
    for (const w of s.words) {
      if (!Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start<previous-.001 || w.end<=w.start || w.end>timing.total+.05)
        throw Error('字级时间轴倒序或越界');
      previous=w.end;
    }
  }
  return timing;
}

export function alignExistingVoice(project,skillRoot) {
  const python=pythonExecutable();
  const file=path.join(project,'audio/word-timestamps.json');
  let timing;
  try {timing=readWordAlignment(project);} catch {timing=null;}
  if (!timing) {
    requireChineseAlignmentSupport();
    if (fs.existsSync(file)) {
      const prior=JSON.parse(fs.readFileSync(file,'utf8'));
      if (!prior.sentences?.some(s=>s.ok!==true || s.match<.9)) throw Error('字级文件证据不一致，已保留，禁止自动覆盖');
      fs.copyFileSync(file,path.join(project,'qa',`word-alignment-before-retry-${Date.now()}.json`));
      execFileSync(python,[path.resolve('director/talkcraft-word-alignment-retry.py'),project,skillRoot,
        process.env.TALKCRAFT_ASR_MODEL || 'small'],{stdio:'inherit',env:{...pythonEnvironment(),PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
    } else {
    execFileSync(python,[path.join(skillRoot,'scripts/timestamps_cpu.py'),'audio/full.mp3','script.json','audio/word-timestamps.json',
      '--backend',process.env.TALKCRAFT_ASR_BACKEND || 'whisper','--model',process.env.TALKCRAFT_ASR_MODEL || 'small'],
      {cwd:project,stdio:'inherit',env:{...pythonEnvironment(),PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
    }
    fs.mkdirSync(path.join(project,'qa'),{recursive:true});
    fs.writeFileSync(path.join(project,'qa/word-alignment.json'),JSON.stringify({schema:'talkcraft-word-alignment-v1',
      inputs:inputs(project),sha256:hash(file),backend:process.env.TALKCRAFT_ASR_BACKEND || 'whisper',userAcceptance:false},null,2));
    timing=readWordAlignment(project);
  }
  const renderFile=path.join(project,'remotion/timing.json');
  const old=fs.readFileSync(renderFile);
  const backup=path.join(project,'qa/timing-before-word-alignment.json');
  if (!fs.existsSync(backup)) fs.writeFileSync(backup,old,{flag:'wx'});
  execFileSync(python,[path.join(skillRoot,'scripts/make_timing.py'),file,renderFile],{cwd:project,stdio:'inherit'});
  const src=path.join(project,'remotion/src/timing.json');
  if (fs.existsSync(src)) fs.copyFileSync(renderFile,src);
  return {status:'word_alignment_passed',sentences:timing.sentences.length,artifact:'audio/word-timestamps.json',billable:false};
}
export function recoverExistingAlignment(project,skillRoot){
  const file=path.join(project,'audio/timestamps.json'),prior=JSON.parse(fs.readFileSync(file,'utf8'));
  const script=JSON.parse(fs.readFileSync(path.join(project,'script.json'),'utf8')).sentences;
  if(prior.timingSource==='tts-native'||prior.sentences?.length!==script.length||prior.sentences.some((s,i)=>s.text!==script[i]||!s.words?.length)||!prior.sentences.some(s=>s.ok!==true||s.match<.9))
    throw Error('仅支持已有真实识别词记录的失败句恢复，不改供应商原始时间戳或成功时间轴');
  const originalInputs=inputs(project),qa=path.join(project,'qa');fs.mkdirSync(qa,{recursive:true});
  const backup=path.join(qa,'sentence-alignment-before-recovery-'+Date.now()+'.json');fs.copyFileSync(file,backup);
  const words=path.join(project,'audio/word-timestamps.json');
  if(!fs.existsSync(words))fs.copyFileSync(file,words);
  alignExistingVoice(project,skillRoot);
  const checked=readWordAlignment(project);
  if(JSON.stringify(inputs(project))!==JSON.stringify(originalInputs))throw Error('恢复过程中稿或配音改变，停止同步');
  fs.copyFileSync(words,file);
  return {status:'sentence_alignment_recovered',sentences:checked.sentences.length,backup,originalVoicePreserved:true,billable:false};
}
