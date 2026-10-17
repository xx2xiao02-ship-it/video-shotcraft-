import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {digitalHumanShotsHash, fileSha256, planTalkcraftDigitalHuman} from './talkcraft-digital-human-plan.mjs';
import {verifyRecordedVoice} from './talkcraft-host-input.mjs';

export function readTalkcraftDigitalHumanStatus(project) {
  const source = JSON.parse(readFileSync(path.join(project, 'source-run.json'), 'utf8'));
  if(source.workflowPath==='recorded-host')return {required:false,imported:true,ready:verifyRecordedVoice(project,source)&&existsSync(path.join(project,'remotion/public/dh/host.mp4')),mode:'imported',units:0};
  if (source.isDigitalHuman === false || !source.digitalHumanMode) return {required:false, ready:false, disabled:true, mode:null, units:0};
  const shotsFile = path.join(project, 'remotion', 'shots.json');
  if (!existsSync(shotsFile)) return {required:true, ready:false, mode:source.digitalHumanMode, units:0};
  let plan;
  try { plan = planTalkcraftDigitalHuman(project); }
  catch (error) { return {required:true, ready:false, mode:source.digitalHumanMode,
    units:0, error:String(error.message || error)}; }
  const reportFile = path.join(project, 'digital-human-report.json');
  if (!existsSync(reportFile)) return {required:true, ready:false, mode:plan.mode, units:plan.units.length};
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  const transparentReady = plan.units.every(unit => unit.shotIds.every(id =>
    existsSync(path.join(project, 'remotion', 'public', 'digital-human', `${id}-transparent.webm`))));
  const ready = report.status === 'SUCCESS' && report.mode === plan.mode &&
    report.shotsHash === digitalHumanShotsHash(shotsFile) &&
    report.audioHash === fileSha256(path.join(project, 'audio', 'full.mp3')) &&
    report.units?.length === plan.units.length && transparentReady &&
    plan.units.every((unit, index) => unit.shotIds.every(id =>
      existsSync(path.join(project, 'remotion', 'public', 'digital-human', `${id}.mp4`))) &&
      report.units[index]?.frames === unit.durationInFrames);
  return {required:true, ready, mode:plan.mode, units:plan.units.length,
    providerTasks:report.taskIds?.length || 0, status:report.status};
}
