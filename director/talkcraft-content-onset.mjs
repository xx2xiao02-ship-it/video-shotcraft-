import fs from 'node:fs';
import path from 'node:path';
import {normalizeVisibleText} from './talkcraft-text-occurrences.mjs';

// A code-level planning budget, not a pixel/visual acceptance test.
export const CONTENT_ONSET_MAX_SEC=1;
export const CONTENT_ONSET_RULES='每镜须规划起始内容：纯文字/图形镜头在首秒内应有与当前解说对应的有效文字；色块、编号、箭头和底部字幕不能作为内容承载。后置关键词必须保持真实发声锚点，之前用当前语义的已审模板内容、真实素材或人物承接。禁止把未来结论改成 context 提前显示来通过检查；无法承接须回到自然短句重新编排或重选卡，不得空等关键词。';

function hasSubstantiveText(event){
  const text=normalizeVisibleText(event.text);
  if(text.length<2)return false;
  if(/\p{L}/u.test(text))return true;
  // A spoken statistical value is content; an unanchored decorative counter
  // is not. Spoken anchors are validated against voice evidence by the compiler.
  return /^\p{N}+$/u.test(text)&&event.role==='spoken'&&Number.isFinite(event.spokenSec)&&
    text===normalizeVisibleText(event.anchor);
}

function hasLocalMedia(shot,project){
  if(!project)return false;
  const root=path.resolve(project,'remotion/public');
  const props=shot.templateParams?.cardProps||{};
  const values=[shot.templateParams?.materialSrc,...Object.entries(props).filter(([k])=>/^src\d*$/iu.test(k)).map(([,v])=>v)];
  return values.some(value=>{
    if(typeof value!=='string'||/^[a-z]+:\/\//iu.test(value)||! /\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v|avif)$/iu.test(value))return false;
    const file=path.resolve(root,value.replace(/^remotion\/public\//u,''));
    const relative=path.relative(root,file);
    return relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&fs.existsSync(file)&&fs.statSync(file).isFile()&&fs.statSync(file).size>0;
  });
}

export function checkContentOnset(shots,reveals,{project=null}={}){
  const fps=reveals.fps||30,issues=[],checks=[];
  if(fps!==30)throw Error('内容起始校验要求明确的30fps');
  for(const shot of shots){
    const durationFrames=Math.round(shot.end*fps)-Math.round(shot.start*fps);
    const events=reveals.events.filter(e=>e.beatId===shot.id&&!e.deferredTo&&
      Number.isInteger(e.localFrame)&&e.localFrame>=0&&e.localFrame<durationFrames&&
      hasSubstantiveText(e));
    const first=events.reduce((best,e)=>!best||e.localFrame<best.localFrame?e:best,null);
    const initialMedia=hasLocalMedia(shot,project),plannedHost=shot.subject==='person';
    const firstTextFrame=first?.localFrame??null;
    const delaySec=firstTextFrame==null?durationFrames/fps:firstTextFrame/fps;
    checks.push({shotId:shot.id,cardId:shot.shotCard,firstTextFrame,delaySec,
      initialMedia,plannedHost,mediaAdmissionVerified:false});
    if(!plannedHost&&!initialMedia&&(firstTextFrame==null||firstTextFrame>CONTENT_ONSET_MAX_SEC*fps)){
      issues.push({code:'CONTENT_ONSET_GAP',shotId:shot.id,firstEventId:first?.id??null,
        delaySec,maxLeadSec:CONTENT_ONSET_MAX_SEC,
        message:`${shot.id} 前 ${delaySec.toFixed(3)} 秒没有已规划的有效大字、人物或本地素材承接解说；不能只留色块/编号等待关键词。须按当前语义补齐原卡内容职责、拆分自然短句或重选已审模板，禁止提前显示未来结论。`});
    }
  }
  return {schema:'talkcraft-content-onset-v1',passed:issues.length===0,unit:'seconds',fps,
    checks,issues,visualVerified:false,userAcceptance:false};
}
