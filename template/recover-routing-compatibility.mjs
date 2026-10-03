import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
import {ffmpegPath,ffprobePath} from '../director/packaging-media.mjs';

const root=path.resolve(import.meta.dirname,'..');
const batch='card-governance-batch-003-routing';
const out=path.join(root,'template/out',batch);
const read=file=>JSON.parse(fs.readFileSync(path.resolve(root,file),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex');
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const evidence=path.join(out,'evidence.json');
const report=read(evidence);
if (report.legacy.numeric.length!==11 || report.routingChecks) throw new Error('Unexpected recovery state');
for(const [file,sha] of Object.entries(report.sourceHashes)) if(hash(file)!==sha) throw new Error(`Source changed: ${file}`);
const archive=path.join(out,'failed-evidence.json');
if(!fs.existsSync(archive)) fs.copyFileSync(evidence,archive);
const snapshot=read(report.snapshot.file);
const numeric=read(snapshot.files['director/numeric-card-production-admission.json'].snapshot);
const priorReport=read(numeric.report);
const prior=(priorReport.numeric || [...priorReport.legacy.numeric,...priorReport.addedNumeric])[11];
const original=read(snapshot.files['director/a-mode-runs/f4f78a6c-aa2b-4917-9bed-66398863f3f9/props.json'].snapshot);
const frames=Number(prior.stream.nb_frames);
const shot={...original.storyboard.shots[0],shotCard:prior.card,durationInFrames:frames,text:prior.params.evidence,
  templateParams:prior.params,displayLines:['现金底气'],displayText:'现金底气',materialRole:'backdrop'};
const props={...original,bgm:null,storyboard:{...original.storyboard,aspectRatio:prior.aspect,shots:[shot],audio:undefined,subtitleV1:undefined,subtitleHighlights:undefined}};
const video='template/out/'+batch+'/counter-11.mp4';
execFileSync(ffmpegPath(),['-v','error','-i',path.join(root,video),'-f','null','-'],{windowsHide:true});
const stream=JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','v:0','-show_entries','stream=width,height,nb_frames,r_frame_rate','-of','json',path.join(root,video)],{encoding:'utf8',windowsHide:true})).streams[0];
if(stream.width!==1080 || stream.height!==1920 || Number(stream.nb_frames)!==frames || stream.r_frame_rate!=='30/1') throw new Error('Invalid last video');
const browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
const options={serveUrl:path.join(out,'bundle'),puppeteerInstance:browser,logLevel:'error',offthreadVideoCacheSizeInBytes:32*1024*1024,offthreadVideoThreads:1};
const pixels=file=>execFileSync(ffmpegPath(),['-v','error','-i',file,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,maxBuffer:16*1024*1024});
async function pair(composition,inputProps,frame,name){
  const file=path.join(out,name+'.png'),baseline=path.join(out,name+'-baseline.png');
  await renderStill({...options,composition,inputProps,frame,scale:0.5,output:file});
  await renderStill({...options,serveUrl:path.join(out,'baseline-bundle'),composition,inputProps,frame,scale:0.5,output:baseline});
  const a=pixels(file),b=pixels(baseline);let differentPixels=0,maxChannelDelta=0;
  for(let i=0;i<a.length;i+=3){let delta=0;for(let c=0;c<3;c++)delta=Math.max(delta,Math.abs(a[i+c]-b[i+c]));if(delta){differentPixels++;maxChannelDelta=Math.max(maxChannelDelta,delta);}}
  const result={file:relative(file),frame,sha256:hash(file),baseline:relative(baseline),baselineSha256:hash(baseline),pixelIdentical:a.equals(b),differentPixels,maxChannelDelta};
  console.log(JSON.stringify(result));return result;
}
try {
  const composition=await selectComposition({...options,id:'DynamicVideo',inputProps:props});
  const repeats=[];
  for(let i=0;i<3;i++) repeats.push(await pair(composition,props,98,`recovery-counter-11-f98-repeat-${i}`));
  fs.writeFileSync(path.join(out,'repeat-diagnostic.json'),JSON.stringify(repeats,null,2)+'\n');
  if(repeats.some(sample=>!sample.pixelIdentical)) throw new Error('Repeated exact comparison still differs; admission remains closed');
  const result={card:prior.card,aspect:prior.aspect,params:prior.params,file:video,sha256:hash(video),stream,fullDecodePassed:true,samples:[]};
  for(const sample of prior.samples){
    const rendered=sample.frame===98 ? repeats[0] : await pair(composition,props,sample.frame,`recovery-counter-11-f${sample.frame}`);
    if(!rendered.pixelIdentical) throw new Error('Recovery sample differs');result.samples.push(rendered);
  }
  report.legacy.numeric.push(result);
  report.routingChecks=[];
  const input=card=>({...original,bgm:null,storyboard:{...original.storyboard,mode:'A',audio:undefined,subtitleV1:undefined,subtitleHighlights:undefined,
    shots:[{type:'claim',text:'运行选择测试',displayLines:['选择测试'],shotCard:card,durationInFrames:180,materialRole:'none'}]}});
  for(const [card,message] of [['typography/typewriter-moves','完整变体ID'],['unknown/missing','精确运行注册']]){
    const inputProps=input(card),comp=await selectComposition({...options,id:'DynamicVideo',inputProps});
    let errorText;
    try{await renderStill({...options,composition:comp,inputProps,frame:45,output:path.join(out,'unexpected-recovery-routing.png')});}
    catch(error){errorText=error.message;}
    if(!errorText?.includes(message)) throw new Error('Missing expected runtime rejection');
    report.routingChecks.push({card,mode:'A',rejected:true,error:errorText});
  }
  const legacy=input('typography/typewriter-moves');legacy.storyboard.mode=undefined;
  const comp=await selectComposition({...options,id:'DynamicVideo',inputProps:legacy});
  report.legacyDirectoryChoice={card:'typography/typewriter-moves',mode:'legacy',...await pair(comp,legacy,45,'recovery-legacy-directory-choice')};
  if(!report.legacyDirectoryChoice.pixelIdentical) throw new Error('Legacy directory pixels differ');
  report.recovery={failedReport:relative(archive),failedReportSha256:hash(archive),originalMismatch:{file:'counter-11-f98.png',baseline:'counter-11-f98-baseline.png',differentPixels:8},repeats,
    conclusion:'Three fresh current/frozen pairs were exact; initial edge raster mismatch retained, not tolerated as passing evidence'};
  report.sourceHashes['template/recover-routing-compatibility.mjs']=hash('template/recover-routing-compatibility.mjs');
  for(const [file,sha] of Object.entries(report.sourceHashes)) if(hash(file)!==sha) throw new Error(`Source changed during recovery: ${file}`);
  fs.writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');
  console.log('RECOVERY PASSED: all 12 numeric videos, exact repeated samples, real rejection probes');
} finally {await browser.close({silent:true});}
