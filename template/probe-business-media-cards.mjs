import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition} from '@remotion/renderer';
import {cachedStillRenderer} from './cached-still-renderer.mjs';

const root=path.resolve(import.meta.dirname,'..');
const group=process.argv.includes('--group');
const captureDir=path.join(root,'template/out/card-business-media-batch013-'+(group ? 'v6' : 'v3'));
const version=process.argv[2] || 'v1';
if(!/^v\d+$/.test(version)) throw new Error('Expected probe version vN.');
const out=path.join(root,'template/out/card-business-media-probe-batch013-'+version);
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if(fs.existsSync(out)) throw new Error('Probe output is immutable; use a new output version.');
const capture=JSON.parse(fs.readFileSync(path.join(captureDir,'capture.json'),'utf8'));
const record=capture.captures.find(item=>item.name==='all');
const screenFile=path.join(captureDir,record.file);
if(sha(screenFile)!==record.sha256) throw new Error('Frozen screenshot hash mismatch.');
const props={screen:{src:'data:image/png;base64,'+fs.readFileSync(screenFile).toString('base64'),
  kind:'image',width:record.width,height:record.height},targetRect:record.dom.targetRect,
  focusLabel:'尚未准入',durationInFrames:180,
  skin:{bg:'#f4f7f8',surface:'#ffffff',text:'#ffffff',muted:'#54666b',accent:'#116e79',
    fontFamily:'Microsoft YaHei',transparentBackground:true}};
const screen=name=>{
  const item=capture.captures.find(item=>item.name===name);
  const file=path.join(captureDir,item.file);
  if(sha(file)!==item.sha256) throw new Error('Frozen media changed: '+name);
  return {src:'data:image/png;base64,'+fs.readFileSync(file).toString('base64'),kind:'image',width:item.width,height:item.height};
};
const darkSkin={bg:'#101820',surface:'#202c35',text:'#ffffff',muted:'#cf5b4d',accent:'#66d2cc',
  fontFamily:'Microsoft YaHei',transparentBackground:true};
const lightSkin={bg:'#f4f7f8',surface:'#ffffff',text:'#18272b',muted:'#cad5d7',accent:'#116e79',
  fontFamily:'Microsoft YaHei',transparentBackground:true};
const definitions=group ? [
  {id:'ReticleMediaProbe',runtimeId:'effects/fui-hud-moves/reticle-lock-on',
    file:'demos/effects/fui-hud-moves/ReticleLockOn.tsx',props:{...props,screen:screen('all')},frames:[20,46,56,100,179]},
  {id:'BrandFrameMediaProbe',runtimeId:'effects/brand-frame-snap',
    file:'demos/effects/brand-frame-snap/BrandFrameSnap.tsx',props:{screens:[screen('all'),screen('gaps')],
      portraitScreens:[screen('all-portrait'),screen('gaps-portrait')],
      words:['全部卡片','仅看缺口'],skin:darkSkin,durationInFrames:180},frames:[40,77,78,100,179]},
  {id:'GlowPanelMediaProbe',runtimeId:'effects/spotlight-sweep-moves/glow-wake-sleep-panel',
    file:'demos/effects/spotlight-sweep-moves/GlowWakeSleepPanel.tsx',props:{screen:screen('all'),
      words:['镜头卡清单'],skin:darkSkin,durationInFrames:180},frames:[20,60,100,132,179]},
  {id:'SlideSpotlightMediaProbe',runtimeId:'effects/spotlight-sweep-moves/slide-spotlight-pan',
    file:'demos/effects/spotlight-sweep-moves/SlideSpotlightPan.tsx',props:{screen:screen('all'),
      words:['镜头卡清单'],skin:darkSkin,durationInFrames:180},frames:[0,32,100,132,179]},
  {id:'CornerSpotlightMediaProbe',runtimeId:'effects/spotlight-sweep-moves/corner-spotlight-reveal',
    file:'demos/effects/spotlight-sweep-moves/CornerSpotlightReveal.tsx',props:{screen:screen('all'),
      words:['镜头卡清单'],skin:darkSkin,durationInFrames:180},frames:[20,60,100,132,179]},
  {id:'PhoneMediaProbe',runtimeId:'effects/radial-ripple-phone-chips',
    file:'demos/effects/radial-ripple-phone-chips/RadialRipplePhoneChips.tsx',props:{screen:screen('phone'),
      words:['卡片检索','缺口筛选'],skin:lightSkin,durationInFrames:180},frames:[0,40,80,140,179]},
  {id:'LogoButtonMediaProbe',runtimeId:'outro/edit-hook-moves/logo-sting-button',
    file:'demos/outro/edit-hook-moves/LogoStingButton.tsx',props:{screens:[screen('all'),screen('list-detail')],
      targetRect:capture.captures.find(item=>item.name==='list-detail').dom.targetRect,
      words:['镜头卡治理'],skin:darkSkin,durationInFrames:180},frames:[10,40,74,82,179]},
] : [{id:'ReticleMediaProbe',runtimeId:'effects/fui-hud-moves/reticle-lock-on',
  file:'demos/effects/fui-hud-moves/ReticleLockOn.tsx',props,frames:[20,46,56,100]}];
fs.mkdirSync(out,{recursive:true});
const sources=[...definitions.map(item=>item.file),'demos/_fixtures/BusinessScreen.tsx','demos/_fixtures/Fixtures.tsx','demos/_fixtures/Motion.tsx',
  'demos/_fixtures/BusinessTextStage.tsx','demos/_fixtures/TemplateSkin.ts',
  'template/media-card-component-probe.tsx','template/probe-business-media-cards.mjs'];
const sourceHashes=Object.fromEntries(sources.map(file=>[file,sha(path.join(root,file))]));
const serveUrl=await bundle({entryPoint:path.join(root,'template/media-card-component-probe.tsx'),outDir:path.join(out,'bundle')});
const browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
const still=await cachedStillRenderer(serveUrl,path.join(root,'template'));
const samples=[];
const compatibility=[];
try {
  for(const item of definitions) for(const aspect of ['landscape','portrait']) {
    const selected=await selectComposition({serveUrl,id:item.id,inputProps:item.props,puppeteerInstance:browser});
    if(JSON.stringify(selected.props)!==JSON.stringify(item.props)) throw new Error('Actual component props changed.');
    const composition={...selected,width:aspect==='landscape'?1920:1080,height:aspect==='landscape'?1080:1920};
    for(const frame of item.frames) {
      const file=`${item.id}-${aspect}-${frame}.png`;
      await still.render({composition,inputProps:item.props,puppeteerInstance:browser,frame,
        output:path.join(out,file),scale:0.5});
      samples.push({id:item.id,runtimeId:item.runtimeId,aspect,frame,file,sha256:sha(path.join(out,file)),business:true});
    }
    console.log(item.runtimeId+' '+aspect+' samples complete');
  }
  fs.writeFileSync(path.join(out,'samples-pending.json'),JSON.stringify({
    status:'business-samples-generated-default-compatibility-pending',sourceHashes,
    captureReportSha256:sha(path.join(captureDir,'capture.json')),samples},null,2)+'\n');
  if(group && process.argv.includes('--baseline')) {
    const audit=JSON.parse(fs.readFileSync(path.join(root,'template/out/card-variant-smoke-batch003-v2/acceptance.json'),'utf8'));
    const records=Object.values(audit).find(Array.isArray);
    const snapshots={};
    for(const item of definitions) {
      let baseline=execFileSync('git',['show','HEAD:'+item.file],{cwd:root});
      const expected=records.find(record=>record.runtimeId===item.runtimeId)?.component?.sha256;
      const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
      if(digest(baseline)!==expected) {
        const crlf=Buffer.from(baseline.toString('utf8').replaceAll('\r\n','\n').replaceAll('\n','\r\n'));
        if(digest(crlf)===expected) baseline=crlf;
      }
      const baselineSha256=digest(baseline);
      if(expected!==baselineSha256)
        throw new Error('Original source differs from audit: '+item.runtimeId);
      const snapshot=path.join(out,item.id+'-original.txt');
      fs.writeFileSync(snapshot,baseline);snapshots[path.join(root,item.file)]=snapshot;
      compatibility.push({id:item.id,runtimeId:item.runtimeId,baselineSha256,aspects:[]});
    }
    const baselineUrl=await bundle({entryPoint:path.join(root,'template/media-card-component-probe.tsx'),
      outDir:path.join(out,'baseline-bundle'),webpackOverride:config=>({...config,module:{...config.module,
        rules:[...(config.module?.rules || []),{test:/\.tsx$/,enforce:'pre',
          use:[{loader:path.join(root,'template/governance-baseline-loader.cjs'),options:{snapshots}}]}]}})});
    const baselineStill=await cachedStillRenderer(baselineUrl,path.join(root,'template'));
    try {
      for(const item of definitions) for(const aspect of ['landscape','portrait']) {
        const current=await selectComposition({serveUrl,id:item.id,inputProps:{},puppeteerInstance:browser});
        const original=await selectComposition({serveUrl:baselineUrl,id:item.id,inputProps:{},puppeteerInstance:browser});
        const dimensions={width:aspect==='landscape'?1920:1080,height:aspect==='landscape'?1080:1920};
        const currentFile=path.join(out,item.id+'-'+aspect+'-default-100.png');
        const originalFile=path.join(out,item.id+'-'+aspect+'-original-100.png');
        await still.render({composition:{...current,...dimensions},inputProps:{},puppeteerInstance:browser,frame:100,output:currentFile,scale:0.5});
        await baselineStill.render({composition:{...original,...dimensions},inputProps:{},puppeteerInstance:browser,frame:100,output:originalFile,scale:0.5});
        const currentSha256=sha(currentFile),originalSha256=sha(originalFile);
        if(currentSha256!==originalSha256) throw new Error('Original pixels changed: '+item.id+' '+aspect);
        compatibility.find(record=>record.id===item.id).aspects.push({aspect,currentSha256,originalSha256,samePixels:true});
      }
    } finally {await baselineStill.close();}
  }
  const composition=await selectComposition({serveUrl,id:'ReticleMediaProbe',inputProps:{},puppeteerInstance:browser});
  const file='default-100.png';
  await still.render({composition,inputProps:{},puppeteerInstance:browser,frame:100,output:path.join(out,file),scale:0.5});
  samples.push({id:composition.id,frame:100,file,sha256:sha(path.join(out,file)),business:false});
  let defaultCompatibility;
  if(!group && process.argv.includes('--baseline')) {
    const component='demos/effects/fui-hud-moves/ReticleLockOn.tsx';
    const baseline=execFileSync('git',['show','HEAD:'+component],{cwd:root});
    const baselineSha256=crypto.createHash('sha256').update(baseline).digest('hex');
    const audit=JSON.parse(fs.readFileSync(path.join(root,'template/out/card-variant-smoke-batch003-v2/acceptance.json'),'utf8'));
    const item=Object.values(audit).find(Array.isArray)?.find(item=>item.runtimeId==='effects/fui-hud-moves/reticle-lock-on');
    if(item?.component?.sha256!==baselineSha256) throw new Error('Git baseline does not match audited original source.');
    const snapshot=path.join(out,'original-component.txt');
    fs.writeFileSync(snapshot,baseline);
    const baselineUrl=await bundle({entryPoint:path.join(root,'template/media-card-component-probe.tsx'),
      outDir:path.join(out,'baseline-bundle'),webpackOverride:config=>({...config,module:{...config.module,
        rules:[...(config.module?.rules || []),{test:/ReticleLockOn\.tsx$/,enforce:'pre',
          use:[{loader:path.join(root,'template/governance-baseline-loader.cjs'),
            options:{snapshots:{[path.join(root,component)]:snapshot}}}]}]}})});
    const baselineStill=await cachedStillRenderer(baselineUrl,path.join(root,'template'));
    try {
      const original=await selectComposition({serveUrl:baselineUrl,id:'ReticleMediaProbe',inputProps:{},puppeteerInstance:browser});
      const baselineFile=path.join(out,'original-default-100.png');
      await baselineStill.render({composition:original,inputProps:{},puppeteerInstance:browser,frame:100,output:baselineFile,scale:0.5});
      const originalImageSha256=sha(baselineFile);
      if(originalImageSha256!==sha(path.join(out,file))) throw new Error('Original default pixels changed.');
      defaultCompatibility={baselineSha256,originalImageSha256,currentImageSha256:sha(path.join(out,file)),samePixels:true};
    } finally {await baselineStill.close();}
  }
  for(const [file,hash] of Object.entries(sourceHashes)) if(sha(path.join(root,file))!==hash) throw new Error('Source changed during probe.');
  fs.writeFileSync(path.join(out,'probe.json'),JSON.stringify({status:'component-samples-only-not-admitted',
    captureReport:path.relative(root,path.join(captureDir,'capture.json')).replaceAll('\\','/'),
    captureReportSha256:sha(path.join(captureDir,'capture.json')),sourceHashes,
    businessInput:{...props,screen:{...props.screen,src:record.file}},
    groupDefinitions:group ? definitions.map(item=>({...item,props:undefined})) : undefined,
    defaultCompatibility,compatibility,samples},null,2)+'\n');
  console.log(JSON.stringify({out,samples:samples.length,status:'not-admitted'}));
} finally {
  await still.close();
  await browser.close({silent:true});
}
