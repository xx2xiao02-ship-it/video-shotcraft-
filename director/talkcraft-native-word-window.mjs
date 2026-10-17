import fs from 'node:fs';
import path from 'node:path';
import {nativeFrameAt} from './talkcraft-native-time-map.mjs';
import {compileWordReveals} from './talkcraft-word-reveal.mjs';
import {auditOpeningRhythm} from './talkcraft-template-governance.mjs';

// Exact windows of the upstream error-retype card. Its first text is removed
// before its second text is typed; a narration gate cannot bring erased text back.
export function checkNativeWordWindows(shots, presentation, reveals) {
  const issues=[];
  for (const shot of shots.filter(s=>s.shotCard==='error-retype')) {
    const row=presentation.shots.find(r=>r.shotId===shot.id);
    if (!row) continue; // Structural governance reports missing rows.
    const props=shot.templateParams?.cardProps||{},fps=30;
    const firstLength=String(props.first||'').length,secondLength=String(props.second||'').length;
    const deleteAt=.7+firstLength*.09+.55;
    const retypeAt=deleteAt+firstLength*.06+.12;
    const windows={first:[Math.ceil((.7+(firstLength-1)*.09)*fps),Math.ceil(deleteAt*fps)-1],
      second:[Math.ceil((retypeAt+(secondLength-1)*.06)*fps),Math.floor((retypeAt+secondLength*.06+.3+2.6)*fps)]};
    for (const event of reveals.events.filter(e=>e.beatId===shot.id&&e.role==='spoken'&&!e.deferredTo)) {
      const window=windows[event.field];if(!window)continue;
      const outputFrame=Math.min(row.endFrame-row.startFrame-1,event.localFrame+3);
      const nativeFrame=nativeFrameAt(row.timeline,outputFrame);
      if(nativeFrame<window[0]||nativeFrame>window[1])issues.push({code:'NATIVE_TEXT_WINDOW_MISMATCH',shotId:shot.id,eventId:event.id,
        field:event.field,outputFrame,nativeFrame,visibleNativeFrames:window,
        message:`第 ${shots.findIndex(s=>s.id===shot.id)+1} 镜（${shot.id}）的“${event.text}”说到时，原模板已删除或尚未打完该文字；须重新编导模板或驻留计划。`});
    }
  }
  return {schema:'talkcraft-native-word-window-v1',passed:issues.length===0,issues,runtimeVerified:false};
}

export function recordNativeWordWindows(project, reveals) {
  const read=name=>JSON.parse(fs.readFileSync(path.join(project,'remotion',name),'utf8'));
  if(!fs.existsSync(path.join(project,'remotion/native-presentation.json')))return {passed:true,issues:[]};
  const report=checkNativeWordWindows(read('shots.json'),read('native-presentation.json'),reveals);
  fs.mkdirSync(path.join(project,'qa'),{recursive:true});
  fs.writeFileSync(path.join(project,'qa/native-word-window-check.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}

// Planning must check both provider-native words and CPU-aligned words. The
// presence of the optional offline ASR file must never decide this gate.
export function recordPlanningWordCheck(project,{required=true}={}) {
  if(!required)return {required:false,passed:true,issues:[]};
  try {
    const opening=auditOpeningRhythm(JSON.parse(fs.readFileSync(path.join(project,'remotion/shots.json'),'utf8')));
    if(!opening.passed){const error=Error('开场短镜头规划未通过');error.issues=opening.issues;throw error;}
    const reveals=compileWordReveals(project);
    if(!reveals.enabled)throw Error('正式模板缺少字级落点计划');
    return {...recordNativeWordWindows(project,reveals),required:true,eventCount:reveals.events.length};
  }catch(error){
    const report={schema:'talkcraft-native-word-window-v1',required:true,passed:false,
      issues:error.issues||[{code:error.code||'NATIVE_WORD_ANCHOR_INVALID',message:error.message}],runtimeVerified:false};
    fs.mkdirSync(path.join(project,'qa'),{recursive:true});
    fs.writeFileSync(path.join(project,'qa/native-word-window-check.json'),JSON.stringify(report,null,2)+'\n');
    return report;
  }
}
