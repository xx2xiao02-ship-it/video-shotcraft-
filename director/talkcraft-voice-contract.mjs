import fs from 'node:fs';
import path from 'node:path';
import {verifyRecordedVoice} from './talkcraft-host-input.mjs';

const ENGINES = Object.freeze({standard:'edge-tts','volcengine-clone':'volcengine-seed-icl-2.0',
  'volcengine-tts2':'volcengine-seed-tts-2.0','recorded-original':'recorded-original'});
export function expectedTalkcraftVoice(source) {
  const mode=source.voiceMode || 'standard';
  if (!Object.hasOwn(ENGINES,mode)) throw new Error('不支持的音色来源，不能自动切回免费音色');
  return {mode,id:mode==='recorded-original'?'recorded-original':mode==='standard' ? source.voice : source.speakerId,engine:ENGINES[mode]};
}

// Only reading historical output may recognize the retired standard engine.
// Every new synthesis/create path must use this guard before any side effect.
export function assertNewVoiceSelection(source) {
  if (!['volcengine-tts2','volcengine-clone'].includes(source.voiceMode))
    throw new Error('免费音色已移除，请选用火山音色后重新提交');
  const speakerId=String(source.speakerId || '').trim();
  const max=source.voiceMode==='volcengine-clone' ? 128 : 256;
  if (!new RegExp(`^[A-Za-z0-9_-]{2,${max}}$`,'u').test(speakerId) ||
      ['zh-CN-YunxiNeural','zh-CN-XiaoxiaoNeural'].includes(speakerId))
    throw new Error('请填写有效的火山音色 ID，免费音色已移除');
  return {voiceMode:source.voiceMode,speakerId,voice:speakerId};
}

// New clients declare both the applied choice and the candidate separately.
// Existing clients without these optional fields keep their explicit selection.
export function assertTalkcraftVoiceIntent(fields,selection) {
  const expected=expectedTalkcraftVoice(selection);
  const confirmed=String(fields.confirmedVoiceId || '').trim();
  const candidate=String(fields.voiceCandidateId || '').trim();
  if (confirmed && confirmed!==expected.id) throw new Error('已选用音色与提交参数不一致，已阻止生成');
  if (candidate && expected.mode!=='volcengine-clone' && candidate!==expected.id)
    throw new Error('候选音色尚未正式选用，已阻止使用之前的音色生成');
  return expected;
}

export function assertTalkcraftVoiceDeclaration(fields) {
  if (!String(fields.confirmedVoiceId || '').trim())
    throw new Error('缺少已选用音色确认，已阻止生成；请使用新版操作台重新选用音色');
}

export function inspectTalkcraftVoiceOutput(project,source) {
  const expected=expectedTalkcraftVoice(source);
  if(source.voiceMode==='recorded-original'){
    const verified=verifyRecordedVoice(project,source);
    return {verified,expected,actual:{id:'recorded-original',engine:'recorded-original'},issues:verified?[]:['RECORDED_VOICE_PROVENANCE_INVALID']};
  }
  try {
    const timing=JSON.parse(fs.readFileSync(path.join(project,'audio/voice-timing.json'),'utf8'));
    const issues=[];
    if (!expected.id || timing.voice!==expected.id) issues.push('VOICE_ID_MISMATCH');
    if (timing.voiceEngine!==expected.engine) issues.push('VOICE_ENGINE_MISMATCH');
    return {verified:issues.length===0,expected,actual:{id:timing.voice || null,engine:timing.voiceEngine || null},issues};
  } catch {
    return {verified:false,expected,actual:null,issues:['VOICE_PROVIDER_RECORD_MISSING']};
  }
}

export function assertTalkcraftVoiceOutput(project,source) {
  const result=inspectTalkcraftVoiceOutput(project,source);
  if (!result.verified) throw new Error(`实际配音记录与已选音色不一致：${result.issues.join('、')}；已保留音频并停止后续制作`);
  return result;
}
