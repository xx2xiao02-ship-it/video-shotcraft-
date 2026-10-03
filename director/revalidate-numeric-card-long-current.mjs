import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {buildSourceAudit} from './card-source-audit.mjs';
import {validateGlobalPlan,validateShotPlan,buildStoryboard} from './a-mode-run.mjs';
import {NUMERIC_CARD_CONTRACTS,validateNumericCardParams,assertNumericCardDuration} from './numeric-card-contracts.mjs';
import {ffmpegPath,ffprobePath} from './packaging-media.mjs';

const root=path.resolve(import.meta.dirname,'..');
const templateRequire=createRequire(path.join(root,'template/package.json'));
const {bundle}=templateRequire('@remotion/bundler');
const {openBrowser,selectComposition,renderStill,renderMedia}=templateRequire('@remotion/renderer');
const read=file=>JSON.parse(fs.readFileSync(path.resolve(root,file),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex');
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const fixtureFile='template/fixtures/card-business-data-batch014-v2.json';
const fixture=read(fixtureFile);
const original=read('director/a-mode-runs/f4f78a6c-aa2b-4917-9bed-66398863f3f9/props.json');
const outputRelative='template/out/card-business-data-batch014-current-long-20261003';
const output=path.join(root,outputRelative);
const sourceFiles=[fixtureFile,'director/a-mode-runs/f4f78a6c-aa2b-4917-9bed-66398863f3f9/props.json',
  'template/src/Root.tsx','template/src/DynamicVideo.tsx','template/src/TemplateAdapter.tsx',
  'director/card-source-audit.mjs','director/a-mode-run.mjs','director/numeric-card-contracts.mjs',
  'director/current-theme.json','director/admission-source-policy.mjs',
  'demos/_fixtures/Motion.tsx','demos/_fixtures/Fixtures.tsx','demos/_fixtures/TemplateSkin.ts',
  'demos/data/counter-confetti/CounterConfetti.tsx','demos/data/odometer-digit-roll/OdometerDigitRoll.tsx',
  'demos/data/odometer-digit-roll/odometer-contract.mjs'];
const sourceHashes=Object.fromEntries(sourceFiles.map(file=>[file,hash(file)]));
const reportPath=path.join(output,'compatibility.json');
const report={schema:'numeric-card-current-long-compatibility-v1',fixtureFile,
  sourceHashes,cards:fixture.cards.map(item=>item.id),fps:fixture.fps,durationInFrames:fixture.durationInFrames,
  scope:'current DynamicVideo selectComposition, real adapter props, 180-frame landscape/portrait videos, full decode and samples; paid model, production execution and user acceptance remain pending',
  actualModelValidated:false,userAcceptance:'pending',productionAdmission:'not-recorded',cases:[]};
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
const ts=templateRequire('typescript');
const adapterSource=fs.readFileSync(path.join(root,'template/src/TemplateAdapter.tsx'),'utf8');
const adapterJs=ts.transpileModule(adapterSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const adapterExports={};
new Function('require','exports',adapterJs)(createRequire(path.join(root,'template/src/TemplateAdapter.tsx')),adapterExports);
const audit=buildSourceAudit(root);
const runtimeIds=audit.registrations.map(item=>item.id);
const pixels=file=>execFileSync(ffmpegPath(),['-v','error','-i',file,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,maxBuffer:16*1024*1024});
const browserExecutable=process.env.SHOTCRAFT_BROWSER_EXECUTABLE ||
  path.join(root,'template/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const chromeMode=process.env.SHOTCRAFT_CHROME_MODE || 'chrome-for-testing';
const skinFor=(props,aspect)=>{const style=props.storyboard.style,theme=props.storyboard.theme;return {
  bg:style.bg,text:style.text,muted:style.sub,accent:style.accent,surface:theme.surface||style.bg,
  fontFamily:style.fontFamily||"'Noto Sans SC','Microsoft YaHei',sans-serif",transparentBackground:false,
};};

fs.mkdirSync(output,{recursive:true});
const entryPoint=path.join(root,'template/src/index.ts');
const publicDir=path.join(root,'template/public');
const serveUrl=await bundle({entryPoint,publicDir,outDir:path.join(output,'bundle')});
const browser=await openBrowser('chrome',{browserExecutable,chromeMode});
const options={serveUrl,puppeteerInstance:browser,logLevel:'error',offthreadVideoCacheSizeInBytes:32*1024*1024,offthreadVideoThreads:1};

try {
  assert.equal(fixture.schema,'business-card-data-batch-v1');
  assert.equal(fixture.cards.length,2);
  for(const item of fixture.cards){
    assert.ok(NUMERIC_CARD_CONTRACTS[item.id],`missing numeric contract: ${item.id}`);
    validateNumericCardParams(item.id,item.templateParams,item.narration);
    assertNumericCardDuration(item.id,fixture.durationInFrames,fixture.fps);
    assert.ok(runtimeIds.includes(item.id),`missing exact runtime ID: ${item.id}`);
    const registration=audit.registrations.find(entry=>entry.id===item.id);
    assert.equal(registration.adapter?.shotCard,item.id);
    for(const aspect of fixture.aspects){
      const segments=[{text:item.narration,fromFrame:0,durationInFrames:fixture.durationInFrames}];
      const global={fromSegment:0,toSegment:1,type:'claim',card:item.id,material:null,materialRole:'none',reason:item.backgroundPolicy.reason};
      const detail={index:0,displayLines:item.lines,elementPlan:'原组件接收真实数值、单位、标签、主题和完整180帧，标题使用真实业务夹具',captionHighlights:[''],templateParams:item.templateParams};
      validateGlobalPlan({shots:[global]},segments,[],{requireBackground:true,availableCards:fixture.cards.map(card=>card.id)});
      validateShotPlan({shots:[detail]},[global],segments);
      const storyboard=buildStoryboard(root,`numeric-current-${item.id}-${aspect}`,{fps:fixture.fps,totalFrames:fixture.durationInFrames,segments},[global],[detail],{...read('director/current-theme.json'),aspectRatio:aspect});
      const props={...original,bgm:null,storyboard:{...storyboard,style:original.storyboard.style,theme:original.storyboard.theme,audio:undefined,subtitleV1:{settings:{...original.storyboard.subtitleV1.settings,enabled:false},captions:[],wordTimed:false,warnings:[]},subtitleHighlights:undefined}};
      const composition=await selectComposition({...options,id:'DynamicVideo',inputProps:props});
      const shot=composition.props.storyboard.shots[0];
      assert.equal(shot.shotCard,item.id); assert.deepEqual(shot.templateParams,item.templateParams); assert.deepEqual(shot.displayLines,item.lines);
      assert.equal(composition.durationInFrames,180); assert.equal(composition.fps,30);
      const componentProps=adapterExports.translateShot(item.id,{text:shot.displayText||shot.text,lines:shot.displayLines,
        templateParams:shot.templateParams,narration:shot.text,durationInFrames:shot.durationInFrames,skin:skinFor(props,aspect),accent:props.storyboard.style.accent,bg:props.storyboard.style.bg});
      assert.equal(componentProps.value,item.templateParams.value); assert.equal(componentProps.unit,item.templateParams.unit);
      assert.equal(componentProps.label,item.templateParams.label); assert.equal(componentProps.title,item.lines.join('\n'));
      const suffix=aspect==='9:16'?'portrait':'landscape';
      const name=`${item.id.endsWith('counter-confetti')?'counter':'odometer'}-${suffix}`;
      const video=path.join(output,`${name}.mp4`);
      await renderMedia({...options,composition,inputProps:props,codec:'h264',pixelFormat:'yuv420p',outputLocation:video,concurrency:1});
      execFileSync(ffmpegPath(),['-v','error','-i',video,'-f','null','-'],{windowsHide:true});
      const stream=JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','v:0','-show_entries','stream=width,height,nb_frames,r_frame_rate','-of','json',video],{encoding:'utf8',windowsHide:true})).streams[0];
      assert.equal(stream.width,aspect==='9:16'?1080:1920); assert.equal(stream.height,aspect==='9:16'?1920:1080);
      assert.equal(Number(stream.nb_frames),180); assert.equal(stream.r_frame_rate,'30/1');
      const samples=[];
      for(const frame of item.inspectFrames){
        const file=path.join(output,`${name}-f${frame}.png`);
        await renderStill({...options,composition,inputProps:props,frame,scale:0.5,output:file});
        samples.push({frame,file:relative(file),sha256:hash(file)});
      }
      const propsFile=path.join(output,`${name}-props.json`);
      const componentFile=path.join(output,`${name}-component-props.json`);
      fs.writeFileSync(propsFile,JSON.stringify(props,null,2)+'\n');
      fs.writeFileSync(componentFile,JSON.stringify({componentId:item.id,componentFile:registration.file,componentExport:registration.export,componentSha256:hash(registration.file),adapterProps:componentProps},null,2)+'\n');
      report.cases.push({card:item.id,aspect,params:item.templateParams,frames:180,fps:30,componentId:item.id,
        selectedProps:{shotCard:shot.shotCard,durationInFrames:shot.durationInFrames,templateParams:shot.templateParams,displayLines:shot.displayLines},
        adapterProps:componentProps,propsFile:relative(propsFile),componentPropsFile:relative(componentFile),
        video:relative(video),sha256:hash(video),stream,fullDecodePassed:true,samples});
      save(); console.log(`REVALIDATED_LONG ${name}`);
    }
  }
} finally {
  save();
  await browser.close({silent:true});
}
if(report.cases.length!==4) throw new Error(`长版数值案例未完整复验：${report.cases.length}/4`);
for(const [file,expected] of Object.entries(sourceHashes)) if(hash(file)!==expected) throw new Error(`复验期间源码变化：${file}`);
report.localVisualReview='passed-current-runtime-180-frame';
report.completedAt=new Date().toISOString();
save();
console.log(JSON.stringify({output:outputRelative,cases:report.cases.length,cards:report.cards,localVisualReview:report.localVisualReview}));
