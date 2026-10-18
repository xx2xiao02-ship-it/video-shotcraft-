import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assertTalkcraftVoiceOutput} from './talkcraft-voice-contract.mjs';

export const B_PIPELINE = Object.freeze({mode:'B', pipeline:'video-talkcraft',
  orchestrator:'director/talkcraft-stages.mjs', rendererEntry:'src/index.ts',
  composition:'Main', frontendRole:'parameters-and-observation-only'});
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function renderInputs(project) {
  const names = ['source-run.json','audio/full.mp3','audio/voice-timing.json','remotion/shots.json'];
  const walk = dir => {
    if (!fs.existsSync(path.join(project,dir))) return;
    for (const entry of fs.readdirSync(path.join(project,dir),{withFileTypes:true})) {
      const name=path.join(dir,entry.name).replaceAll('\\','/');
      if (entry.isDirectory()) walk(name); else names.push(name);
    }
  };
  walk('remotion/src');
  for(const name of ['remotion/cues.json','remotion/native-presentation.json','remotion/word-reveal-plan.json'])
    if(fs.existsSync(path.join(project,name)))names.push(name);
  return Object.fromEntries(names.sort().map(name=>[name,hash(path.join(project,name))]));
}

export function pipelineProvenance(source) {
  const issues = Object.entries(B_PIPELINE).filter(([key,value]) => source[key] !== value)
    .map(([key]) => `PIPELINE_${key.toUpperCase()}_MISMATCH`);
  // Bind the actual provider engine to the selected voice mode.
  const expectedEngine = {'standard':'edge-tts','volcengine-clone':'volcengine-seed-icl-2.0',
    'volcengine-tts2':'volcengine-seed-tts-2.0','recorded-original':'recorded-original'}[source.voiceMode || 'standard'];
  if(source.voiceMode==='recorded-original'&&source.workflowPath!=='recorded-host')issues.push('RECORDED_WORKFLOW_MISMATCH');
  if (source.voiceEngine && source.voiceEngine !== expectedEngine)
    issues.push('VOICE_ENGINE_MISMATCH');
  return {...Object.fromEntries(Object.keys(B_PIPELINE).map(key => [key,source[key] || null])),
    voiceEngine:source.voiceEngine || null, timingMethod:source.timingMethod || null,
    verified:issues.length === 0, issues};
}

export function assertPipelineProvenance(project,{requireVoice=false}={}) {
  const source=JSON.parse(fs.readFileSync(path.join(project,'source-run.json'),'utf8'));
  const result = pipelineProvenance(source);
  if (!result.verified) throw new Error(`B 模式工作链路未核验：${result.issues.join('、')}；已保留已有资产`);
  if(requireVoice){
    const voice=assertTalkcraftVoiceOutput(project,source);
    if(!result.voiceEngine){
      const id=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu;
      if(!id.test(source.sourceRunId||'')||source.sourceRunId===source.runId||
        path.basename(path.dirname(path.resolve(project)))!==source.runId)
        throw new Error('未记录实际配音来源，不能进入制作或验收');
      const parent=path.resolve(project,'../..',source.sourceRunId,'talkcraft');
      const previous=JSON.parse(fs.readFileSync(path.join(parent,'source-run.json'),'utf8'));
      if(previous.runId!==source.sourceRunId||!previous.voiceEngine||!pipelineProvenance(previous).verified)
        throw Error('复用配音源任务来源记录无效');
      const previousVoice=assertTalkcraftVoiceOutput(parent,previous);
      if(previousVoice.actual.engine!==voice.actual.engine||previousVoice.actual.id!==voice.actual.id||
        previous.voiceEngine!==voice.actual.engine||Number(previous.speechRate??0)!==Number(source.speechRate??0))
        throw Error('复用配音音色、引擎或语速不一致');
      const inputs={};
      for(const name of ['input.txt','audio/full.mp3','audio/voice-timing.json']){
        inputs[name]=hash(path.join(project,name));
        if(inputs[name]!==hash(path.join(parent,name)))throw Error(`复用配音与指定来源哈希不一致：${name}`);
      }
      const timing=JSON.parse(fs.readFileSync(path.join(project,'audio/voice-timing.json'),'utf8'));
      return {...result,voiceEngine:voice.actual.engine,timingMethod:result.timingMethod||timing.timingMethod||null,
        voiceReuse:{method:'verified-identical-source-assets',sourceRunId:source.sourceRunId,inputs}};
    }
  }
  return result;
}

export function recordOfficialRender(project, skillRoot) {
  const provenance = assertPipelineProvenance(project,{requireVoice:true});
  const inputs = {...renderInputs(project),'remotion/out/final.mp4':hash(path.join(project,'remotion/out/final.mp4'))};
  const renderer = path.join(skillRoot,'scripts/render_shots.mjs');
  const record = {schema:'talkcraft-official-render-v1', passed:true, provenance, inputs,
    renderer, rendererSha256:hash(renderer), completedAt:new Date().toISOString(), userAcceptance:false};
  fs.mkdirSync(path.join(project,'qa'),{recursive:true});
  fs.writeFileSync(path.join(project,'qa/official-render.json'),JSON.stringify(record,null,2));
  return record;
}

export function officialRenderCurrent(project) {
  try {
    const record = JSON.parse(fs.readFileSync(path.join(project,'qa/official-render.json'),'utf8'));
    return record.schema === 'talkcraft-official-render-v1' && record.passed === true &&
      pipelineProvenance(JSON.parse(fs.readFileSync(path.join(project,'source-run.json'),'utf8'))).verified &&
      JSON.stringify({...renderInputs(project),'remotion/out/final.mp4':hash(path.join(project,'remotion/out/final.mp4'))}) === JSON.stringify(record.inputs) &&
      record.rendererSha256 === hash(record.renderer);
  } catch { return false; }
}
