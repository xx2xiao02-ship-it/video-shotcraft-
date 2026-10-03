import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import {buildSourceAudit} from '../director/card-source-audit.mjs';
import {validateGlobalPlan,validateShotPlan,buildStoryboard} from '../director/a-mode-run.mjs';
import {fitVideoPlayback} from '../director/video-material-policy.mjs';
import {ffmpegPath,ffprobePath} from '../director/packaging-media.mjs';
import {cachedStillRenderer} from './cached-still-renderer.mjs';
import {LIST_CARD_IDS,validateListCardParams} from '../director/list-card-contracts.mjs';
import {SCREEN_CARD_IDS} from '../director/screen-card-contracts.mjs';
import {assertScreenCardAssets} from '../director/screen-card-assets.mjs';
import {assertTextCardDuration,validateTextCardLines} from '../director/text-card-contracts.mjs';
import {GRAPHIC_CONTRACTS,validateGraphicParams,BUSINESS_CARD_CONTRACTS,validateBusinessCardParams} from '../director/graphic-contracts.mjs';
import {NUMERIC_CARD_CONTRACTS,validateNumericCardParams,assertNumericCardDuration} from '../director/numeric-card-contracts.mjs';
import {resolveRuntimeCardId} from '../director/card-runtime-choice.mjs';

const root=path.resolve(import.meta.dirname,'..');
const templateRequire=createRequire(path.join(root,'template/package.json'));
const typescript=templateRequire('typescript');
const adapterSource=fs.readFileSync(path.join(root,'template/src/TemplateAdapter.tsx'),'utf8');
const adapterJs=typescript.transpileModule(adapterSource,{compilerOptions:{module:typescript.ModuleKind.CommonJS,target:typescript.ScriptTarget.ES2022}}).outputText;
const adapterExports={};
new Function('require','exports',adapterJs)(createRequire(path.join(root,'template/src/TemplateAdapter.tsx')),adapterExports);
if(typeof adapterExports.translateShot!=='function') throw new Error('TemplateAdapter.translateShot is unavailable');
const batch=process.argv.find(arg=>arg.startsWith('--batch='))?.slice(8) || 'card-business-text-batch004';
if(!/^card-business-(?:text|data)-batch\d+(?:-v\d+|-media-v\d+)?$/.test(batch)) throw new Error('Invalid isolated evidence batch');
const out=path.join(root,'template/out',batch);
const read=file=>JSON.parse(fs.readFileSync(path.resolve(root,file),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex');
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const fixtureFile=`template/fixtures/${batch}.json`;
const fixture=read(fixtureFile);
const additionalSourceFiles=fixture.additionalSourceFiles ?? [];
if(!Array.isArray(additionalSourceFiles)) throw new Error('additionalSourceFiles must be an array');
const additionalSources=additionalSourceFiles.map(file=>{
  if(typeof file!=='string' || !file.trim()) throw new Error('Invalid additional source path');
  const absolute=path.resolve(root,file),relativePath=path.relative(root,absolute);
  if(relativePath.startsWith('..') || path.isAbsolute(relativePath) || !fs.statSync(absolute).isFile())
    throw new Error('Additional source must be an existing project file: '+file);
  return relativePath.replaceAll('\\','/');
});
const backgroundRole=item=>item.backgroundPolicy?.role || (SCREEN_CARD_IDS.has(item.id)?'none':'backdrop');
const backgroundReason=item=>item.backgroundPolicy?.reason ||
  (SCREEN_CARD_IDS.has(item.id)?'特殊强调免背景：真实业务截图是本镜主体素材，叠加无关视频会损害界面可读性':'用原卡动效呈现业务文字，真实城市视频透底');
for(const item of fixture.cards) if(!['none','backdrop'].includes(backgroundRole(item))) throw new Error('Unsupported background role: '+item.id);
if(fixture.mediaSource){
  assert.equal(hash(fixture.mediaSource),fixture.mediaSourceSha256,'Frozen screen capture changed');
  for(const file of fixture.mediaSources || []) assert.ok(fs.existsSync(path.resolve(root,file)),'Missing frozen screen asset: '+file);
}
if(fixture.baselineFixture) fixture.cards=[...read(fixture.baselineFixture).cards,...fixture.cards];
for(const item of fixture.cards){
  if(NUMERIC_CARD_CONTRACTS[item.id]){
    assert.equal(item.kind,'numeric');
    validateTextCardLines(item.id,item.lines);
    assert.equal(item.lines.length,1);
    validateNumericCardParams(item.id,item.templateParams,item.narration);
    assertNumericCardDuration(item.id,fixture.durationInFrames,fixture.fps);
  }else if(GRAPHIC_CONTRACTS[item.id]){
    assert.equal(item.kind,'graphic');
    validateTextCardLines(item.id,item.lines);
    validateGraphicParams(item.id,item.templateParams,item.narration);
  }else if(BUSINESS_CARD_CONTRACTS[item.id]){
    assert.equal(item.kind,'business');
    validateTextCardLines(item.id,item.lines);
    validateBusinessCardParams(item.id,item.templateParams,item.narration);
    assertTextCardDuration(item.id,fixture.durationInFrames);
  }else{
    validateTextCardLines(item.id,item.lines);
    assertTextCardDuration(item.id,fixture.durationInFrames);
  }
  if(SCREEN_CARD_IDS.has(item.id)) assert.deepEqual(assertScreenCardAssets(root,item.id,item.templateParams),item.templateParams);
}
const metricsSource=fixture.metricsSource ? read(fixture.metricsSource.file) : null;
const metricsSourceFiles=[];
const metricContexts={snapshot:metricsSource};
if(fixture.metricsSource){
  assert.equal(hash(fixture.metricsSource.file),fixture.metricsSource.sha256,'Frozen business metrics changed');
  assert.equal(metricsSource.schema,'card-governance-progress-source-snapshot-v1');
  assert.equal(metricsSource.asOf,fixture.asOf);
  metricsSourceFiles.push(fixture.metricsSource.file);
  for(const [name,source] of Object.entries(metricsSource.sources || {})){
    assert.equal(hash(source.file),source.sha256,'Frozen metric dependency changed: '+source.file);
    metricsSourceFiles.push(source.file);
    const value=read(source.file);
    metricContexts[name]=value;
    if(name==='currentProgress') metricContexts.progress=value;
    if(name==='previousProgressSnapshot') metricContexts.previous=value;
  }
  for(const item of fixture.cards){
    if(!NUMERIC_CARD_CONTRACTS[item.id]&&!GRAPHIC_CONTRACTS[item.id]) continue;
    assert.ok(item.sourceBindings,'Structured business data needs source-field bindings');
    if(NUMERIC_CARD_CONTRACTS[item.id]){
      if(item.sourceBindings.value.includes('.')){
        const [context,...parts]=item.sourceBindings.value.split('.');
        const expected=parts.reduce((value,key)=>value?.[key],metricContexts[context]);
        assert.deepEqual(item.templateParams.value,expected,item.id+' value differs from measured source');
      }else assert.equal(item.templateParams.value,metricsSource.counts[item.sourceBindings.value],item.id+' value differs from measured source');
    }else if(Array.isArray(item.sourceBindings.rows)){
      assert.equal(item.sourceBindings.rows.length,item.templateParams.rows.length);
      item.templateParams.rows.forEach((row,index)=>
        assert.equal(row.value,metricsSource.counts[item.sourceBindings.rows[index]],item.id+' row differs from measured source'));
    }else{
      for(const [field,expression] of Object.entries(item.sourceBindings)){
        const [context,...sourcePath]=expression.split('.');
        assert.ok(Object.hasOwn(metricContexts,context),item.id+' uses unknown source context '+context);
        const expected=sourcePath.reduce((value,key)=>value?.[key],metricContexts[context]);
        const actual=field.split('.').reduce((value,key)=>value?.[key],item);
        assert.deepEqual(actual,expected,item.id+' differs from measured source at '+field);
      }
    }
  }
}
if(fixture.dataSource){
  assert.equal(hash(fixture.dataSource),fixture.dataSourceSha256,'Frozen data source changed');
  const source=read(fixture.dataSource);
  assert.equal(source.schema,'frozen-local-admission-list-v1');
  for(const item of fixture.cards){
    assert.ok(LIST_CARD_IDS.has(item.id),'Unknown structured list');
    validateListCardParams(item.id,item.templateParams);
    item.templateParams.rows.forEach((row,i)=>{
      const original=source.records.find(record=>record.id===row.id);
      assert.ok(original?.locallyTested,'List row has no source validation');
      assert.equal(row.title,original.title);assert.equal(row.detail,original.detail);assert.equal(row.tag,String(i+1));
    });
  }
}
const audioSources=[];
const timingSources=[];
for(const item of fixture.cards){
  if(item.words){
    assert.equal(typeof item.wordSource,'string','Real word timing provenance is required');
    const source=read(item.wordSource);assert.deepEqual(source.words,item.words);
    assert.equal(source.schema,'local-asr-karaoke-source-v1');assert.ok(source.asrAnchorCoverage>=0.9);
    for(const [file,sha] of Object.entries(source.sourceHashes)) assert.equal(hash(file),sha,'Word source changed: '+file);
    assert.equal(hash(source.outputAudio),source.outputAudioSha256);
    assert.equal(relative(path.resolve(root,'template/public',item.audio.src)),source.outputAudio);
    timingSources.push(item.wordSource,...Object.keys(source.sourceHashes));
  }
  if(!item.audio) continue;
  const {src,volume}=item.audio;
  assert.equal(typeof src,'string','Audio requires a local public path');
  const audioFile=path.resolve(root,'template/public',src);
  const publicRoot=path.resolve(root,'template/public')+path.sep;
  assert.ok(audioFile.startsWith(publicRoot) && !path.isAbsolute(src),'Audio must stay inside template/public');
  assert.ok(Number.isFinite(volume) && volume>=0 && volume<=1,'Audio volume must be explicit');
  const probe=JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','a:0','-show_entries','stream=codec_type:format=duration','-of','json',audioFile],{encoding:'utf8',windowsHide:true}));
  assert.equal(probe.streams?.[0]?.codec_type,'audio','Local audio stream required');
  assert.ok(Number(probe.format?.duration)>=fixture.durationInFrames/fixture.fps,'Audio must cover the full shot');
  audioSources.push(relative(audioFile));
}
const originalFile='director/a-mode-runs/f4f78a6c-aa2b-4917-9bed-66398863f3f9/props.json';
const original=read(originalFile);
const material=original.storyboard.shots[0].material;
const requiresBackdrop=fixture.cards.some(item=>backgroundRole(item)==='backdrop');
const mediaUrl=requiresBackdrop ? original.materialApiBaseUrl+'/api/library/video?path='+encodeURIComponent(material) : null;
const mediaSeconds=requiresBackdrop ? Number(execFileSync(ffprobePath(),['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',mediaUrl],{encoding:'utf8',windowsHide:true,timeout:20000}).trim()) : null;
if(requiresBackdrop&&(!Number.isFinite(mediaSeconds)||mediaSeconds<=0)) throw new Error('Real background video has no verified duration');
const audit=buildSourceAudit(root);
const runtimeCardIds=audit.registrations.map(reg=>reg.id);
const sources=[...new Set(['template/accept-business-text-batch004.mjs','template/cached-still-renderer.mjs','template/package.json','package-lock.json',fixtureFile,originalFile,...metricsSourceFiles,
  ...(fixture.baselineFixture ? [fixture.baselineFixture] : []),...audioSources,...timingSources,
  ...(fixture.dataSource ? [fixture.dataSource,'director/list-card-contracts.mjs','demos/data/scroll-brake-moves/BusinessRowContent.tsx'] : []),
  ...(fixture.mediaSource ? [fixture.mediaSource,...(fixture.mediaSources || []),'director/screen-card-contracts.mjs','director/screen-card-assets.mjs'] : []),
  'template/src/Root.tsx','template/src/DynamicVideo.tsx','template/src/CardAcceptance.tsx','template/src/TemplateAdapter.tsx',
  'director/card-source-audit.mjs','director/card-runtime-choice.mjs','director/a-mode-run.mjs','director/theme-contract.mjs','director/background-policy.mjs','director/video-material-policy.mjs',
  'director/numeric-card-contracts.mjs','director/graphic-contracts.mjs','director/current-theme.json','director/admission-source-policy.mjs',
  'director/text-card-contracts.mjs','director/karaoke-timing.mjs','director/a-mode-render-preflight.mjs','demos/_fixtures/BusinessTextStage.tsx',
  'demos/_fixtures/Motion.tsx','demos/_fixtures/Fixtures.tsx','demos/_fixtures/TemplateSkin.ts',
  'demos/_fixtures/PageCam2D.tsx','demos/_textures/live-layout.json',
  ...additionalSources,
  ...fixture.cards.map(item=>{
    const source=audit.registrations.find(reg=>reg.id===item.id);
    if(!source?.skinDeclared || !source.adapter) throw new Error('Missing real parameterized source: '+item.id);
    return source.file;
  })])];
const reportFile=path.join(out,'acceptance.json');
const videos=process.argv.includes('--videos');
if(!videos && fs.existsSync(reportFile)) throw new Error('Existing evidence is preserved; use a fresh batch for another source revision');
const batchNumber=Number(batch.match(/batch([0-9]+)/)[1]);
const dataBatch=fixture.schema==='business-card-data-batch-v1';
const title='第'+batchNumber+'批'+(dataBatch?'数据与图形':'文字')+'卡业务验收';
const report=videos ? read(reportFile) : {schema:dataBatch?'business-data-card-batch-acceptance-v1':'business-text-card-batch-v1',fps:30,durationInFrames:fixture.durationInFrames,
  sourceHashes:Object.fromEntries(sources.map(file=>[file,hash(file)])),fixtureFile,baselineFixture:fixture.baselineFixture || null,
  media:requiresBackdrop?{path:material,url:mediaUrl,durationSeconds:mediaSeconds}:null,
  scope:'real original component + actual director plan validation/buildStoryboard + DynamicVideo; synthetic authored plan, no paid model/production run',
  actualModelValidated:false,userAcceptance:'pending',localVisualReview:'pending',productionAdmission:'not-recorded',cases:[]};
const assertSources=()=>{for(const [file,sha] of Object.entries(report.sourceHashes)){
  if(file==='template/accept-business-text-batch004.mjs')continue;
  if(hash(file)!==sha)throw new Error('Source changed: '+file);
}};
assertSources();fs.mkdirSync(out,{recursive:true});
const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
const url=videos ? path.join(out,'bundle') : await bundle({entryPoint:path.join(root,'template/src/index.ts'),publicDir:path.join(root,'template/public'),outDir:path.join(out,'bundle')});
const browserExecutable=process.env.SHOTCRAFT_BROWSER_EXECUTABLE ||
  path.join(root,'template/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const chromeMode=process.env.SHOTCRAFT_CHROME_MODE || 'chrome-for-testing';
const browser=await openBrowser('chrome',{browserExecutable,chromeMode});
const options={serveUrl:url,puppeteerInstance:browser,logLevel:'error',offthreadVideoCacheSizeInBytes:32*1024*1024,offthreadVideoThreads:1};
const stillSession=videos ? null : await cachedStillRenderer(url,path.join(root,'template'));
const renderBusinessStill=stillSession?.render || renderStill;
const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=()=>fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{margin:24px;font:14px/1.6 'Microsoft YaHei';background:#f4f7f8;color:#18272b}h1{font-size:24px}h2{font-size:18px}section{border-top:1px solid #cad5d7;padding:16px 0}img{height:220px;max-width:100%;object-fit:contain}video{width:320px;max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>${escape(title)}</h1><p>真实原组件、编导计划、DynamicVideo 实际参数及横竖合成；收费模型、生产任务与用户验收未执行。</p>${report.cases.map(item=>`<section><h2>${escape(item.card)} · ${item.aspect}</h2><p>${escape(item.lines.join(' / '))}</p>${item.video ? `<video controls preload="metadata" src="${path.basename(item.video.file)}"></video>` : ''}${item.samples.map(sample=>`<img src="${path.basename(sample.file)}" alt="${sample.frame}帧">`).join('')}<pre>${escape(item.error || '')}</pre></section>`).join('')}</html>`);
try {
  if(!videos) for(const [index,item] of fixture.cards.entries()) for(const aspect of fixture.aspects){
    const screenMedia=SCREEN_CARD_IDS.has(item.id);
    const registration=audit.registrations.find(reg=>reg.id===item.id);
    if(!registration?.skinDeclared || registration.adapter?.shotCard!==item.id) throw new Error('Missing exact themed component adapter: '+item.id);
    const resolvedCard=resolveRuntimeCardId(item.id,runtimeCardIds);
    assert.equal(resolvedCard,item.id,'Runtime resolver changed the exact card ID');
    const materialRole=backgroundRole(item);
    const caseMaterial=materialRole==='backdrop'?material:null;
    const result={card:item.id,aspect,lines:item.lines,source:registration.file,componentId:resolvedCard,
      componentFile:registration.file,componentExport:registration.export,materialRole,material:caseMaterial,
      ...(materialRole==='none'?{backgroundReason:backgroundReason(item)}:{}),samples:[],directorConsumption:'pending'};
    try {
      const narration=item.words || item.sourceBindings ? item.narration : '面对收入变化，'+item.narration+'这样才能保留应对风险的余地。';
      const segments=[{text:narration,fromFrame:0,durationInFrames:fixture.durationInFrames,...(item.words ? {words:item.words} : {})}];
      const global={fromSegment:0,toSegment:1,type:'claim',card:resolvedCard,material:caseMaterial,materialRole,reason:backgroundReason(item)};
      const detail={index:0,displayLines:item.lines,
        elementPlan:NUMERIC_CARD_CONTRACTS[item.id]?'数值原组件接收本镜真实数值、单位、标签、主题和完整时长，标题取真实业务夹具':
          GRAPHIC_CONTRACTS[item.id]?'图表原组件接收真实来源绑定的各行数值、单位、主题和完整时长，标题取真实业务夹具':
            screenMedia?'原组件接收真实业务截图、实测目标或模式数据与主题；截图是本镜主体，不叠加背景视频':'原组件接收逐行中文观点、主题字色与强调色及真实背景视频',
        captionHighlights:[''],...(item.templateParams ? {templateParams:item.templateParams} : {})};
      const globals=validateGlobalPlan({shots:[global]},segments,materialRole==='backdrop'?[{path:material,duration_sec:mediaSeconds}]:[],{requireBackground:true,availableCards:fixture.cards.map(card=>card.id)});
      const details=validateShotPlan({shots:[detail]},globals,segments);
      const storyboard=buildStoryboard(root,'00000000-0000-4000-8000-000000000004',{fps:30,totalFrames:fixture.durationInFrames,segments},globals,details,{...read('director/current-theme.json'),aspectRatio:aspect});
      assert.equal(storyboard.shots[0].shotCard,item.id);assert.deepEqual(storyboard.shots[0].displayLines,item.lines);
      assert.equal(storyboard.shots[0].material,caseMaterial||undefined);
      assert.equal(storyboard.shots[0].materialRole,materialRole);
      if(item.templateParams) assert.deepEqual(storyboard.shots[0].templateParams,item.templateParams,'Director lost structured data');
      if(storyboard.shots[0].material) storyboard.shots[0].materialPlayback=fitVideoPlayback(mediaSeconds,fixture.durationInFrames,30);
      if(item.audio) storyboard.shots[0].audio={src:item.audio.src,volume:item.audio.volume};
      const disableSubtitles=screenMedia||Boolean(item.sourceBindings)||Boolean(NUMERIC_CARD_CONTRACTS[item.id])||Boolean(GRAPHIC_CONTRACTS[item.id]);
      const subtitleV1=disableSubtitles?{settings:{...original.storyboard.subtitleV1.settings,enabled:false},captions:[],wordTimed:false,warnings:[]}:undefined;
      const props={...original,bgm:null,storyboard:{...storyboard,style:original.storyboard.style,theme:original.storyboard.theme,audio:undefined,subtitleHighlights:undefined,subtitleV1}};
      const composition=await selectComposition({...options,id:'DynamicVideo',inputProps:props});
      const resolvedShot=composition.props.storyboard.shots[0];
      assert.equal(resolveRuntimeCardId(resolvedShot.shotCard,runtimeCardIds),item.id);
      assert.deepEqual(resolvedShot.displayLines,item.lines);
      assert.equal(resolvedShot.material,caseMaterial||undefined);
      assert.equal(resolvedShot.materialRole,materialRole);
      if(disableSubtitles){assert.equal(composition.props.storyboard.subtitleV1.settings.enabled,false);assert.deepEqual(composition.props.storyboard.subtitleV1.captions,[]);}
      if(item.templateParams){
        assert.deepEqual(resolvedShot.templateParams,item.templateParams,'Resolved structured data changed');
        result.templateParams=resolvedShot.templateParams;
      }
      if(item.audio){
        assert.deepEqual(composition.props.storyboard.shots[0].audio,storyboard.shots[0].audio);
        result.audio={...storyboard.shots[0].audio,file:relative(path.resolve(root,'template/public',item.audio.src)),sha256:hash(path.resolve(root,'template/public',item.audio.src))};
      }
      assert.equal(composition.durationInFrames,fixture.durationInFrames);
      assert.equal(composition.fps,fixture.fps);
      const style=composition.props.storyboard.style,theme=composition.props.storyboard.theme;
      const backdrop=Boolean(resolvedShot.material)&&resolvedShot.materialRole!=='none'&&resolvedShot.materialRole!=='inline-element';
      const skin=composition.props.storyboard.mode==='A'?{bg:style.bg,text:style.text,muted:style.sub,accent:style.accent,
        surface:theme?.surface||style.bg,fontFamily:style.fontFamily||"'Noto Sans SC','Microsoft YaHei',sans-serif",transparentBackground:backdrop}:undefined;
      const shotData={text:resolvedShot.displayText||resolvedShot.text,lines:resolvedShot.displayLines,templateParams:resolvedShot.templateParams,
        narration:resolvedShot.text,subText:resolvedShot.subText,accent:style.accent,bg:style.bg,durationInFrames:resolvedShot.durationInFrames,
        media:resolvedShot.media?original.materialApiBaseUrl+'/api/library/video?path='+encodeURIComponent(resolvedShot.media):undefined,
        mediaPlaybackRate:resolvedShot.mediaPlayback?.playbackRate??1,skin};
      const componentProps=adapterExports.translateShot(item.id,shotData);
      assert.ok(componentProps,'Selected component adapter returned no props');
      assert.deepEqual(componentProps.skin,skin,'Theme props differ from DynamicVideo shot rendering');
      assert.equal(componentProps.durationInFrames,fixture.durationInFrames,'Actual component duration differs');
      const componentContract=adapterExports.COMPONENT_CONTRACTS?.[item.id];
      if(BUSINESS_CARD_CONTRACTS[item.id]){
        assert.ok(componentContract?.paramsMap,'Business card adapter must declare structured params: '+item.id);
        for(const [source,target] of Object.entries(componentContract.paramsMap))
          assert.deepEqual(componentProps[target],item.templateParams[source],`${item.id} did not consume ${source}`);
      }else if(componentContract?.propsMap?.text){
        const textTarget=componentContract.propsMap.text;
        if(componentContract.textAs==='raw') assert.equal(componentProps[textTarget],item.lines.join('\n'),'Actual component text differs from business input');
        else assert.deepEqual(componentProps[textTarget],item.lines,'Actual component text differs from business input');
      }
      if(NUMERIC_CARD_CONTRACTS[item.id]) for(const key of ['value','unit','label']) assert.deepEqual(componentProps[key],item.templateParams[key],key+' did not reach the numeric component');
      if(GRAPHIC_CONTRACTS[item.id]){
        assert.ok(componentContract?.paramsMap,'Graphic card adapter must declare structured params: '+item.id);
        for(const [source,target] of Object.entries(componentContract.paramsMap))
          assert.deepEqual(componentProps[target],item.templateParams[source],`${item.id} did not consume ${source}`);
      }
      result.directorConsumption='passed-authored-plan';result.resolvedCard=item.id;result.componentProps=componentProps;
      const componentPropsFile=path.join(out,'case-'+index+'-'+(aspect==='9:16'?'portrait':'landscape')+'-component-props.json');
      const componentPropsEvidence={componentId:item.id,componentFile:registration.file,componentExport:registration.export,
        componentSha256:hash(path.resolve(root,registration.file)),adapterProps:componentProps};
      fs.writeFileSync(componentPropsFile,JSON.stringify(componentPropsEvidence,null,2)+'\n');
      result.componentPropsFile=relative(componentPropsFile);result.componentPropsSha256=hash(componentPropsFile);
      const propsFile=path.join(out,`case-${index}-${aspect==='9:16'?'portrait':'landscape'}-props.json`);
      fs.writeFileSync(propsFile,JSON.stringify(props,null,2)+'\n');result.propsFile=relative(propsFile);result.propsSha256=hash(propsFile);
      for(const frame of item.inspectFrames){
        const file=path.join(out,`case-${index}-${aspect==='9:16'?'portrait':'landscape'}-f${frame}.png`);
        await renderBusinessStill({...options,composition,inputProps:props,frame,scale:0.5,output:file,timeoutInMilliseconds:20000});
        result.samples.push({file:relative(file),frame,sha256:hash(file)});
      }
      const nativeProps={card:item.id,injected:false};
      const native=await selectComposition({...options,id:'CardAcceptance',inputProps:nativeProps});
      assert.equal(native.props.card,item.id);
      const nativeFile=path.join(out,`case-${index}-${aspect==='9:16'?'portrait':'landscape'}-native.png`);
      await renderBusinessStill({...options,composition:{...native,width:composition.width,height:composition.height},inputProps:nativeProps,frame:item.nativeFrame ?? 100,scale:0.5,output:nativeFile,timeoutInMilliseconds:20000});
      result.nativeDefault={file:relative(nativeFile),sha256:hash(nativeFile),resolvedCard:native.props.card};
    }catch(error){result.error=String(error.stack || error.message).slice(0,1800);}
    report.cases.push(result);save();page();console.log(`BUSINESS ${item.id} ${aspect}: ${result.error ? 'FAIL '+result.error : 'stills-complete'}`);
  }
  if(videos) for(const item of report.cases){
    if(item.error || item.video) continue;
    if(hash(item.propsFile)!==item.propsSha256) throw new Error('Saved business props changed');
    const props=read(item.propsFile),composition=await selectComposition({...options,id:'DynamicVideo',inputProps:props});
    assert.equal(composition.props.storyboard.shots[0].shotCard,item.card);
    const file=path.join(out,path.basename(item.propsFile).replace('-props.json','.mp4'));
    await renderMedia({...options,composition,inputProps:props,codec:'h264',pixelFormat:'yuv420p',outputLocation:file,concurrency:1});
    execFileSync(ffmpegPath(),['-v','error','-i',file,'-f','null','-'],{windowsHide:true});
    const stream=JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','v:0','-show_entries','stream=width,height,nb_frames,r_frame_rate','-of','json',file],{windowsHide:true,encoding:'utf8'})).streams[0];
    assert.equal(Number(stream.nb_frames),fixture.durationInFrames);assert.equal(stream.r_frame_rate,'30/1');assert.equal(stream.width,composition.width);assert.equal(stream.height,composition.height);
    item.video={file:relative(file),sha256:hash(file),stream,fullDecodePassed:true};save();page();console.log(`VIDEO ${item.card} ${item.aspect}`);
  }
  assertSources();report.sourceConsistency=true;save();page();
  console.log(JSON.stringify({cases:report.cases.length,errors:report.cases.filter(item=>item.error).length,videos:report.cases.filter(item=>item.video).length}));
}finally{
  if(stillSession){
    report.frozenMedia=stillSession.preserveDownloads(out).map(item=>({...item,file:relative(item.file)}));
    await stillSession.close();
  }
  save();page();await browser.close({silent:true});
}
