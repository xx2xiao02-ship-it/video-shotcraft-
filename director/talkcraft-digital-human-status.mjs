import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileSha256, planTalkcraftDigitalHuman} from './talkcraft-digital-human-plan.mjs';

export function readTalkcraftDigitalHumanStatus(project) {
  const source = JSON.parse(readFileSync(path.join(project, 'source-run.json'), 'utf8'));
  if (!source.digitalHumanMode) return {required:false, ready:false, mode:null, units:0};
  const shotsFile = path.join(project, 'remotion', 'shots.json');
  if (!existsSync(shotsFile)) return {required:true, ready:false, mode:source.digitalHumanMode, units:0};
  let plan;
  try { plan = planTalkcraftDigitalHuman(project); }
  catch (error) { return {required:true, ready:false, mode:source.digitalHumanMode,
    units:0, error:String(error.message || error)}; }
  const reportFile = path.join(project, 'digital-human-report.json');
  if (!existsSync(reportFile)) return {required:true, ready:false, mode:plan.mode, units:plan.units.length};
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  const ready = report.status === 'SUCCESS' && report.mode === plan.mode &&
    report.shotsHash === fileSha256(shotsFile) &&
    report.audioHash === fileSha256(path.join(project, 'audio', 'full.mp3')) &&
    report.units?.length === plan.units.length &&
    plan.units.every((unit, index) => unit.shotIds.every(id =>
      existsSync(path.join(project, 'remotion', 'public', 'digital-human', `${id}.mp4`))) &&
      report.units[index]?.frames === unit.durationInFrames);
  return {required:true, ready, mode:plan.mode, units:plan.units.length,
    providerTasks:report.taskIds?.length || 0, status:report.status};
}
