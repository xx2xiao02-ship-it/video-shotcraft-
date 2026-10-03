import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildSourceAudit} from './card-source-audit.mjs';
import {resolveRuntimeCardId} from './card-runtime-choice.mjs';
import {ffmpegPath,ffprobePath} from './packaging-media.mjs';

const root=path.resolve(import.meta.dirname,'..');
const evidenceRoot=path.join(root,'.isolated/card-governance-batch-015-worktree');
const previousReportFile='template/out/card-business-data-batch015-v3/acceptance.json';
const outputBase='template/out/card-business-data-batch015-compatibility-20261003';
const attempt=process.argv.find(arg=>arg.startsWith('--attempt='))?.slice('--attempt='.length) || (process.argv.includes('--retry')?'2':'1');
const outputRelative=attempt==='1' ? outputBase : `${outputBase}-r${attempt}`;
const outputRoot=path.join(root,outputRelative);
const readAt=(base,file)=>JSON.parse(fs.readFileSync(path.resolve(base,file),'utf8'));
const read=file=>readAt(root,file);
const hashFile=(base,file)=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(base,file))).digest('hex');
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const fixture=readAt(evidenceRoot,'template/fixtures/card-business-data-batch015-v3.json');
const previousReport=readAt(evidenceRoot,previousReportFile);
const audit=buildSourceAudit(root);
const runtimeIds=audit.registrations.map(item=>item.id);
const templateRequire=createRequire(path.join(root,'template/package.json'));
const moduleUrl=packageName=>pathToFileURL(templateRequire.resolve(packageName)).href;
const {bundle}=await import(moduleUrl('@remotion/bundler'));
const {openBrowser,selectComposition,renderStill}=await import(moduleUrl('@remotion/renderer'));
const typescript=templateRequire('typescript');
const adapterFile=path.join(root,'template/src/TemplateAdapter.tsx');
const adapterJs=typescript.transpileModule(fs.readFileSync(adapterFile,'utf8'),{
  compilerOptions:{module:typescript.ModuleKind.CommonJS,target:typescript.ScriptTarget.ES2022},
}).outputText;
const adapterExports={};
new Function('require','exports',adapterJs)(createRequire(adapterFile),adapterExports);

if(fs.existsSync(outputRoot)) throw new Error(`兼容证据目录已存在，拒绝覆盖：${outputRelative}`);
fs.mkdirSync(outputRoot,{recursive:true});

function evidenceFile(file){
  const resolved=path.resolve(evidenceRoot,file);
  assert.ok(resolved===evidenceRoot || resolved.startsWith(`${evidenceRoot}${path.sep}`),`证据路径越界：${file}`);
  return resolved;
}

function currentFile(file){
  const resolved=path.resolve(root,file);
  assert.ok(resolved===root || resolved.startsWith(`${root}${path.sep}`),`当前路径越界：${file}`);
  return resolved;
}

function assertEvidence(file,expected){
  const absolute=evidenceFile(file);
  assert.ok(fs.existsSync(absolute),`缺少第15批证据：${file}`);
  assert.equal(hashFile(evidenceRoot,file),expected,`第15批证据哈希变化：${file}`);
  return absolute;
}

function skinFromComposition(composition){
  const storyboard=composition.props.storyboard;
  const style=storyboard.style;
  const theme=storyboard.theme;
  const shot=storyboard.shots[0];
  const backdrop=Boolean(shot.material)&&shot.materialRole!=='none'&&shot.materialRole!=='inline-element';
  return storyboard.mode==='A' ? {
    bg:style.bg,
    text:style.text,
    muted:style.sub,
    accent:style.accent,
    surface:theme?.surface||style.bg,
    fontFamily:style.fontFamily||"'Noto Sans SC','Microsoft YaHei',sans-serif",
    transparentBackground:backdrop,
  } : undefined;
}

function shotDataFromComposition(composition){
  const storyboard=composition.props.storyboard;
  const shot=storyboard.shots[0];
  const style=storyboard.style;
  return {
    text:shot.displayText||shot.text,
    lines:shot.displayLines,
    templateParams:shot.templateParams,
    narration:shot.text,
    subText:shot.subText,
    accent:style.accent,
    bg:style.bg,
    durationInFrames:shot.durationInFrames,
    media:shot.media ? `${composition.props.materialApiBaseUrl}/api/library/video?path=${encodeURIComponent(shot.media)}` : undefined,
    mediaPlaybackRate:shot.mediaPlayback?.playbackRate??1,
    skin:skinFromComposition(composition),
  };
}

function rawRgb(file){
  return execFileSync(ffmpegPath(),['-v','error','-i',file,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{
    windowsHide:true,maxBuffer:64*1024*1024,
  });
}

function imageDimensions(file){
  const result=JSON.parse(execFileSync(ffprobePath(),['-v','error','-show_entries','stream=width,height,pix_fmt','-of','json',file],{
    encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024,
  }));
  const stream=result.streams?.[0];
  assert.ok(stream,`图片没有可读视频流：${file}`);
  return {width:Number(stream.width),height:Number(stream.height),pixFmt:stream.pix_fmt};
}

function comparePixels(actualFile,expectedFile){
  const actualInfo=imageDimensions(actualFile);
  const expectedInfo=imageDimensions(expectedFile);
  assert.deepEqual(actualInfo,{...expectedInfo,pixFmt:actualInfo.pixFmt},`抽帧尺寸不同：${actualFile}`);
  const actual=rawRgb(actualFile);
  const expected=rawRgb(expectedFile);
  assert.equal(actual.length,expected.length,`抽帧像素长度不同：${actualFile}`);
  let changedBytes=0,changedPixels=0,maxChannelDiff=0,totalDiff=0;
  for(let index=0;index<actual.length;index++){
    const diff=Math.abs(actual[index]-expected[index]);
    if(diff){changedBytes++;totalDiff+=diff;maxChannelDiff=Math.max(maxChannelDiff,diff);}
  }
  for(let index=0;index<actual.length;index+=3)
    if(actual[index]!==expected[index]||actual[index+1]!==expected[index+1]||actual[index+2]!==expected[index+2]) changedPixels++;
  return {
    width:actualInfo.width,
    height:actualInfo.height,
    totalPixels:actualInfo.width*actualInfo.height,
    changedPixels,
    changedBytes,
    maxChannelDiff,
    meanDiffPerChangedByte:changedBytes ? totalDiff/changedBytes : 0,
    pixelIdentical:changedBytes===0,
  };
}

function verifyVideo(file,expected,composition){
  execFileSync(ffmpegPath(),['-v','error','-i',file,'-f','null','-'],{windowsHide:true,timeout:120000});
  const probe=JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','v:0','-show_entries','stream=width,height,nb_frames,r_frame_rate','-of','json',file],{
    encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024,
  }));
  const stream=probe.streams?.[0];
  assert.ok(stream,`视频没有画面流：${file}`);
  const normalized={width:Number(stream.width),height:Number(stream.height),nb_frames:Number(stream.nb_frames),r_frame_rate:stream.r_frame_rate};
  assert.deepEqual(normalized,{width:composition.width,height:composition.height,nb_frames:fixture.durationInFrames,r_frame_rate:'30/1'},`视频流不符合第15批合同：${file}`);
  assert.equal(hashFile(evidenceRoot,expected.file),expected.sha256,`历史视频哈希变化：${expected.file}`);
  return {file:expected.file,sha256:expected.sha256,fullDecodePassed:true,stream:normalized};
}

async function renderStablePair({options,historicalOptions,composition,historicalComposition,props,frame,currentBase,historicalBase,item}){
  const attempts=[];
  for(let attempt=1;attempt<=3;attempt++){
    const suffix=attempt===1?'':`-retry${attempt}`;
    const current=`${currentBase}${suffix}.png`;
    const historical=`${historicalBase}${suffix}.png`;
    await renderStill({...options,composition,inputProps:props,frame,scale:1,output:current,timeoutInMilliseconds:30000});
    await renderStill({...historicalOptions,composition:historicalComposition,inputProps:props,frame,scale:1,output:historical,timeoutInMilliseconds:30000});
    const comparison=comparePixels(current,historical);
    attempts.push({attempt,currentFile:relative(current),historicalFile:relative(historical),...comparison});
    if(comparison.pixelIdentical) return {current,historical,sourceComparison:comparison,renderAttempts:attempts};
  }
  throw new Error(`${item.card} ${item.aspect} 第${frame}帧当前源码与冻结源码在3次渲染后仍不一致：${JSON.stringify(attempts.at(-1))}`);
}

const sourceFiles=new Set([
  'template/src/Root.tsx','template/src/DynamicVideo.tsx','template/src/TemplateAdapter.tsx',
  'director/card-source-audit.mjs','director/card-runtime-choice.mjs','director/theme-contract.mjs',
  'director/graphic-contracts.mjs','director/current-theme.json','director/a-mode-run.mjs',
  'director/a-mode-render-preflight.mjs','template/package.json','package-lock.json',
  ...previousReport.cases.map(item=>item.componentFile),
]);
const sourceHashes=Object.fromEntries([...sourceFiles].map(file=>[file,hashFile(root,file)]));
const report={
  schema:'card-business-data-batch015-current-runtime-compatibility-v1',
  asOf:'2026-10-03',
  previousReport:previousReportFile,
  previousReportSha256:hashFile(evidenceRoot,previousReportFile),
  previousEvidenceRoot:'.isolated/card-governance-batch-015-worktree',
  videoRerendered:false,
  historicalSourceRendered:true,
  selectCompositionValidated:false,
  sourceHashes,
  cases:[],
  summary:{cases:0,propsExact:0,compositionExact:0,decodedVideos:0,pixelComparisons:0,pixelIdentical:0},
  status:'running',
};

const save=()=>fs.writeFileSync(path.join(outputRoot,'compatibility.json'),JSON.stringify(report,null,2)+'\n');
save();

let browser;
try{
  assert.equal(previousReport.schema,'business-data-card-batch-acceptance-v1');
  assert.equal(previousReport.fixtureFile,'template/fixtures/card-business-data-batch015-v3.json');
  assert.equal(previousReport.fps,fixture.fps);
  assert.equal(previousReport.durationInFrames,fixture.durationInFrames);
  assert.equal(previousReport.cases.length,fixture.cards.length*fixture.aspects.length);

  const bundleUrl=await bundle({
    entryPoint:path.join(root,'template/src/index.ts'),
    publicDir:path.join(root,'template/public'),
    outDir:path.join(outputRoot,'bundle'),
  });
  report.bundle=relative(path.join(outputRoot,'bundle'));
  const historicalBundleUrl=await bundle({
    entryPoint:path.join(evidenceRoot,'template/src/index.ts'),
    publicDir:path.join(evidenceRoot,'template/public'),
    outDir:path.join(outputRoot,'historical-bundle'),
  });
  report.historicalBundle=relative(path.join(outputRoot,'historical-bundle'));
  browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
  const options={serveUrl:bundleUrl,puppeteerInstance:browser,logLevel:'error',offthreadVideoThreads:1,offthreadVideoCacheSizeInBytes:32*1024*1024};
  const historicalOptions={...options,serveUrl:historicalBundleUrl};

  for(const [index,item] of previousReport.cases.entries()){
    const propsFile=evidenceFile(item.propsFile);
    const componentPropsFile=evidenceFile(item.componentPropsFile);
    const videoFile=evidenceFile(item.video.file);
    assert.equal(hashFile(evidenceRoot,item.propsFile),item.propsSha256,`props 哈希变化：${item.propsFile}`);
    assert.equal(hashFile(evidenceRoot,item.componentPropsFile),item.componentPropsSha256,`component props 哈希变化：${item.componentPropsFile}`);
    const props=JSON.parse(fs.readFileSync(propsFile,'utf8'));
    const savedComponent=JSON.parse(fs.readFileSync(componentPropsFile,'utf8'));
    const composition=await selectComposition({...options,id:'DynamicVideo',inputProps:props});
    const historicalComposition=await selectComposition({...historicalOptions,id:'DynamicVideo',inputProps:props});
    const expectedWidth=item.aspect==='16:9'?1920:1080;
    const expectedHeight=item.aspect==='16:9'?1080:1920;
    assert.equal(composition.fps,fixture.fps,`${item.card} ${item.aspect} fps 不一致`);
    assert.equal(composition.durationInFrames,fixture.durationInFrames,`${item.card} ${item.aspect} 时长不一致`);
    assert.equal(composition.width,expectedWidth,`${item.card} ${item.aspect} 宽度不一致`);
    assert.equal(composition.height,expectedHeight,`${item.card} ${item.aspect} 高度不一致`);
    assert.equal(historicalComposition.fps,fixture.fps,`${item.card} ${item.aspect} 历史 fps 不一致`);
    assert.equal(historicalComposition.durationInFrames,fixture.durationInFrames,`${item.card} ${item.aspect} 历史时长不一致`);
    assert.equal(historicalComposition.width,expectedWidth,`${item.card} ${item.aspect} 历史宽度不一致`);
    assert.equal(historicalComposition.height,expectedHeight,`${item.card} ${item.aspect} 历史高度不一致`);
    const shot=composition.props.storyboard.shots[0];
    assert.equal(shot.shotCard,item.card,`${item.card} ${item.aspect} selectComposition 解析了错误卡 ID`);
    assert.equal(resolveRuntimeCardId(shot.shotCard,runtimeIds),item.card,`${item.card} ${item.aspect} 运行 ID 不精确`);
    assert.equal(item.resolvedCard,item.componentId);
    assert.equal(item.componentId,item.card);
    const componentProps=adapterExports.translateShot(item.card,shotDataFromComposition(composition));
    assert.ok(componentProps,`${item.card} ${item.aspect} 当前适配器没有返回 props`);
    assert.deepEqual(componentProps,savedComponent.adapterProps,`${item.card} ${item.aspect} 当前适配器 props 与历史真实 props 不一致`);

    const entry={
      index,card:item.card,aspect:item.aspect,compositionId:'DynamicVideo',resolvedCardId:shot.shotCard,
      durationInFrames:composition.durationInFrames,fps:composition.fps,width:composition.width,height:composition.height,
      actualSelectCompositionPropsExact:true,actualComponentPropsExact:true,
      componentPropsFile:item.componentPropsFile,componentPropsSha256:item.componentPropsSha256,
      propsFile:item.propsFile,propsSha256:item.propsSha256,
      previousVideo:verifyVideo(videoFile,item.video,composition),samples:[],
    };
    for(const sample of item.decodedVideoReview){
      const baseline=evidenceFile(sample.file);
      const frame=Number(sample.file.match(/-f(\d+)\.png$/)?.[1]);
      assert.ok(Number.isInteger(frame),`无法从抽帧文件识别帧号：${sample.file}`);
      const pair=await renderStablePair({
        options,historicalOptions,composition,historicalComposition,props,frame,
        currentBase:path.join(outputRoot,`current-${index}-${item.aspect==='9:16'?'portrait':'landscape'}-f${frame}`),
        historicalBase:path.join(outputRoot,`historical-${index}-${item.aspect==='9:16'?'portrait':'landscape'}-f${frame}`),item,
      });
      const {current,historical,sourceComparison,renderAttempts}=pair;
      const historicalEncodedComparison=comparePixels(historical,baseline);
      const currentEncodedComparison=comparePixels(current,baseline);
      entry.samples.push({
        frame,previousFile:sample.file,previousSha256:sample.sha256,
        currentFile:relative(current),currentSha256:hashFile(root,relative(current)),
        historicalFile:relative(historical),historicalSha256:hashFile(root,relative(historical)),
        sourceComparison,renderAttempts,historicalEncodedComparison,currentEncodedComparison,
      });
      report.summary.pixelComparisons++;
      if(sourceComparison.pixelIdentical) report.summary.pixelIdentical++;
    }
    report.cases.push(entry);
    report.summary.cases++;
    report.summary.propsExact++;
    report.summary.compositionExact++;
    report.summary.decodedVideos++;
    save();
    console.log(`COMPATIBILITY ${index+1}/${previousReport.cases.length} ${item.card} ${item.aspect}`);
  }
  report.selectCompositionValidated=true;
  report.status='passed';
  report.completedAt=new Date().toISOString();
  save();
  if(report.summary.cases!==16 || report.summary.propsExact!==16 || report.summary.compositionExact!==16 ||
      report.summary.decodedVideos!==16 || report.summary.pixelComparisons!==32 || report.summary.pixelIdentical!==32)
    throw new Error(`兼容复验数量不完整：${JSON.stringify(report.summary)}`);
  console.log(JSON.stringify({output:outputRelative,status:report.status,summary:report.summary},null,2));
}catch(error){
  report.status='failed';
  report.error=String(error.stack||error.message).slice(0,4000);
  report.failedAt=new Date().toISOString();
  save();
  throw error;
}finally{
  if(browser) await browser.close({silent:true});
}

