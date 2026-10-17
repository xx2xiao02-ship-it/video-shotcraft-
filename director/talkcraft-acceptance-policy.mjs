import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertWordReveals,wordRevealSourceBinding} from './talkcraft-word-reveal.mjs';
import {isNativePresentation} from './talkcraft-native-governance.mjs';
import {assertOpeningRhythm} from './talkcraft-template-governance.mjs';

export const ACCEPTANCE_POLICY='code-rules-and-human-visual-v1';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export const acceptanceResponsibilities=Object.freeze({policy:ACCEPTANCE_POLICY,
  machine:['source','template-binding','parameters','assets','timing','media-integrity'],
  visualReviewer:'human',visualMachineGate:false});

// Retire only the identified visual probes. Code, provider and render errors
// remain failures; old diagnostic files remain on disk for human reference.
export function isVisualDiagnosticFailure(report){
  if(!report)return false;
  return /(?:TEXT_CONTRAST_(?:REQUIRED|STALE)|WORD_REVEAL_QA_REQUIRED|运行时文字裁切或手机可读字号检查未通过)/u.test(report.cause||'')||
    /^(NATIVE_WORD_RUNTIME_FAILED|TEXT_CONTRAST_GATE|TEXT_CONTRAST_REQUIRED|TEXT_CONTRAST_STALE|WORD_REVEAL_QA_REQUIRED|MOTION_PREFLIGHT_FAILED)$/u.test(report.code||'')||
    /(?:Command failed:[^\r\n]*(?:talkcraft-contrast-audit\.mjs|word-reveal-audit\.mjs|freeze_probe\.py|(?:bound-)?motion[_-]check\.py)|整片渲染前静止探针未通过)/u.test(report.cause||'');
}

export function assertMachineTextRules(project,{only}={}){
  const needed=isNativePresentation(project)||fs.existsSync(path.join(project,'remotion/visual-beats.json'));
  if(!needed)return {passed:true,enabled:false,scope:only||null,visualVerified:false};
  const plan=assertWordReveals(project);
  if(!plan.enabled)throw Error('WORD_REVEAL_PLAN_REQUIRED：缺少可核验的字级时间与源码绑定');
  if(isNativePresentation(project))assertOpeningRhythm(project);
  const events=plan.events.filter(e=>!only||only.includes(e.beatId));
  if(!events.length)throw Error('文字代码规则检查范围没有事件');
  return {passed:true,enabled:true,events:events.length,scope:only||null,
    policy:ACCEPTANCE_POLICY,checks:['voice-time-anchors','template-content','runtime-wrapper-source',...(isNativePresentation(project)?['opening-rhythm','content-onset']:[])],visualVerified:false};
}
function sourceBinding(project){
  const binding=wordRevealSourceBinding(project);
  for(const name of ['source-run.json','audio/full.mp3']){
    const file=path.join(project,name);if(fs.existsSync(file))binding[name]=sha(file);
  }
  return binding;
}
export function bindMachineVideo(project,video){
  assertMachineTextRules(project);
  const report={schema:'talkcraft-machine-video-binding-v1',policy:ACCEPTANCE_POLICY,
    video:path.relative(project,video).replaceAll('\\','/'),finalSha256:sha(video),
    binding:sourceBinding(project),visualVerified:false,userAcceptance:false};
  fs.mkdirSync(path.join(project,'qa'),{recursive:true});
  fs.writeFileSync(path.join(project,'qa/machine-video-binding.json'),JSON.stringify(report,null,2));
  return report;
}
export function assertMachineVideo(project,video){
  assertMachineTextRules(project);
  const report=read(path.join(project,'qa/machine-video-binding.json'));
  if(report.policy!==ACCEPTANCE_POLICY||(report.video!=null&&report.video!==path.relative(project,video).replaceAll('\\','/'))||report.finalSha256!==sha(video)||
    JSON.stringify(report.binding)!==JSON.stringify(sourceBinding(project)))
    throw Error('成片与当前画面代码、参数或素材绑定不符，请重新执行机器规则检查');
  return report;
}

// Probe streams and decode the file; no screenshots, OCR, contrast or motion
// judgement. These checks establish a usable media file, not a good-looking one.
export function inspectTechnicalMedia(video,{fps=30,totalFrames}={}){
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',video],{encoding:'utf8'}));
  const stream=probe.streams?.find(s=>s.codec_type==='video');
  if(!stream||!probe.streams.some(s=>s.codec_type==='audio'))throw Error('输出文件缺少视频或音频流');
  const [n,d]=String(stream.avg_frame_rate).split('/').map(Number),actualFps=n/d;
  if(!Number.isFinite(actualFps)||Math.abs(actualFps-fps)>.001)throw Error('输出帧率与工程声明不一致');
  const frames=Number(stream.nb_frames);
  if(Number.isInteger(totalFrames)&&frames!==totalFrames)throw Error('输出帧数与时间轴不一致');
  execFileSync('ffmpeg',['-v','error','-xerror','-i',video,'-f','null','-'],{stdio:'pipe'});
  return {fullDecode:true,audioPresent:true,fps:actualFps,frames,durationSec:Number(probe.format.duration),visualVerified:false};
}
export function queueHumanVisualReview(project,{only}={}){
  const suffix=only?'-'+[...only].sort().join('-'):'';
  const report={schema:'talkcraft-human-visual-review-v1',policy:ACCEPTANCE_POLICY,
    status:'pending',reviewerType:'human',scope:only||'full',approved:false,
    checklist:['画面布局与文字可读性','字色和背景的视觉效果','动效节奏与静止驻留','嘴型与口播观感','全片风格与声音观感']};
  fs.mkdirSync(path.join(project,'qa'),{recursive:true});
  // A checklist is not an approval and never changes review/approval.json.
  fs.writeFileSync(path.join(project,'qa/human-visual-checklist'+suffix+'.json'),JSON.stringify(report,null,2));
  return report;
}
export function humanVisualApprovalCurrent(approval,finalSha256,shots){
  return approval?.reviewerType==='human'&&approval.approved===true&&
    approval.finalSha256===finalSha256&&approval.reviewedShots===shots&&
    approval.openP0===0&&approval.openP1===0;
}
