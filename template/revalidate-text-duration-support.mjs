import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition} from '@remotion/renderer';
import {admittedTextCards,readTextCardAdmission} from '../director/text-card-admission.mjs';
import {registryBinding,bindTextCardSources,textCardSourcesCurrent,sourceHash} from '../director/text-card-source-binding.mjs';
import {validateGlobalPlan,validateShotPlan,buildStoryboard} from '../director/a-mode-run.mjs';
import {fitVideoPlayback} from '../director/video-material-policy.mjs';
import {KARAOKE_CARD} from '../director/karaoke-timing.mjs';

const root=path.resolve(import.meta.dirname,'..');
const karaoke=process.argv.includes('--karaoke');
const list=process.argv.includes('--list');
const screen=process.argv.includes('--screen');
assert.ok([karaoke,list,screen].filter(Boolean).length<=1,'Choose one compatibility mode');
const dir=screen ? 'template/out/card-screen-compatibility-20261002' : list ? 'template/out/card-list-compatibility-20261002' : karaoke ? 'template/out/card-karaoke-compatibility-20261002' : 'template/out/card-duration-compatibility-20261002';
const absolute=file=>path.resolve(root,file);
const read=file=>JSON.parse(fs.readFileSync(absolute(file),'utf8'));
const hash=file=>sourceHash(fs.readFileSync(absolute(file)));
const recordFile='director/text-card-production-admission.json';
const sources=['director/text-card-contracts.mjs','director/text-card-source-binding.mjs',
  'director/text-card-admission.mjs','director/a-mode-run.mjs','template/src/TemplateAdapter.tsx'];
if(list || screen) sources.push('director/a-mode-render-preflight.mjs');
if(process.argv.includes('--capture-preflight')){
  const snapshot=read(dir+'/snapshot.json'),prior=read(snapshot.record),file='director/a-mode-render-preflight.mjs';
  assert.ok(!snapshot.snapshots[file]);
  assert.ok(prior.cards.every(card=>card.sourceHashes[file]===hash(file)),'Original preflight is not current');
  const target=dir+'/source-preflight.txt';fs.copyFileSync(absolute(file),absolute(target));
  snapshot.snapshots[file]={file:target,sha256:hash(target)};
  fs.writeFileSync(absolute(dir+'/snapshot.json'),JSON.stringify(snapshot,null,2)+'\n');
  console.log('Original preflight captured before mutation');
}else if(process.argv.includes('--snapshot')){
  assert.ok(!fs.existsSync(absolute(dir)),'Snapshot already exists; do not overwrite evidence');
  const record=readTextCardAdmission(root),valid=admittedTextCards(root);
  assert.equal(valid.length,record.cards.length,'Resolve stale admissions before migration');
  fs.mkdirSync(absolute(dir),{recursive:true});
  fs.copyFileSync(absolute(recordFile),absolute(dir+'/admission-before.json'));
  const snapshots=Object.fromEntries(sources.map((file,index)=>{
    const target=dir+`/source-${index}.txt`;
    fs.copyFileSync(absolute(file),absolute(target));
    return [file,{file:target,sha256:hash(target)}];
  }));
  fs.writeFileSync(absolute(dir+'/snapshot.json'),JSON.stringify({record:dir+'/admission-before.json',
    recordSha256:hash(dir+'/admission-before.json'),snapshots,validIds:valid},null,2)+'\n');
  console.log(JSON.stringify({snapshotted:valid.length}));
}else{
  const snapshot=read(dir+'/snapshot.json'),prior=read(snapshot.record),current=read(recordFile);
  assert.equal(hash(snapshot.record),snapshot.recordSha256);
  assert.deepEqual(current,prior,'Admission changed during migration');
  for(const item of Object.values(snapshot.snapshots)) assert.equal(hash(item.file),item.sha256);
  const oldText=file=>fs.readFileSync(absolute(snapshot.snapshots[file].file),'utf8');
  const currentText=file=>fs.readFileSync(absolute(file),'utf8');
  // Compatibility is limited to this additive duration extension, not arbitrary planner changes.
  let expectedPlanner=oldText('director/a-mode-run.mjs').replace(
    'admittedTextCards(root).includes(id)?[180]:[]',
    'admittedTextCards(root).includes(id)?TEXT_CARD_CONTRACTS[id].acceptedFrames:[]');
  if(karaoke) expectedPlanner=expectedPlanner
    .replace("import {admittedTextCards} from './text-card-admission.mjs';","import {admittedTextCards} from './text-card-admission.mjs';\nimport {KARAOKE_CARD,deriveKaraokeTimings} from './karaoke-timing.mjs';")
    .replace("} else validateGraphicParams(globals[i].card,shot.templateParams,narration);","} else if(globals[i].card===KARAOKE_CARD){\n      deriveKaraokeTimings(segments.slice(globals[i].fromSegment,globals[i].toSegment),shot.displayLines,frames);\n      if(shot.templateParams) throw new Error('卡拉OK时间戳来自配音时间轴，不能由模型编造');\n    } else validateGraphicParams(globals[i].card,shot.templateParams,narration);")
    .replace('if (narration.length > 12 && normalize(shot.displayLines.join(\'\')) === narration)',"if (globals[i].card!==KARAOKE_CARD && narration.length > 12 && normalize(shot.displayLines.join('')) === narration)")
    .replace("if (normalize(narration).length > 12 && normalize(detail.displayLines.join('')) === normalize(narration))","if (global.card!==KARAOKE_CARD && normalize(narration).length > 12 && normalize(detail.displayLines.join('')) === normalize(narration))")
    .replace('        durationInFrames:frames,',"        ...(global.card===KARAOKE_CARD ? {templateParams:{timedWords:deriveKaraokeTimings(covered,detail.displayLines,frames)}} : {}),\n        durationInFrames:frames,")
    .replace('    const cardGuides = Object.entries(CARDS)','    const cardGuides = Object.entries(CARDS)\n      .filter(([id]) => id!==KARAOKE_CARD || segments.some(segment=>Array.isArray(segment.words)&&segment.words.length))');
  if(list) expectedPlanner=expectedPlanner
    .replace("import {KARAOKE_CARD,deriveKaraokeTimings} from './karaoke-timing.mjs';","import {KARAOKE_CARD,deriveKaraokeTimings} from './karaoke-timing.mjs';\nimport {LIST_CARD_IDS,LIST_CARD_FIELDS,validateListCardParams} from './list-card-contracts.mjs';")
    .replace('    } else if(globals[i].card===KARAOKE_CARD){','    } else if(LIST_CARD_IDS.has(globals[i].card)){\n      validateListCardParams(globals[i].card,shot.templateParams);\n    } else if(globals[i].card===KARAOKE_CARD){')
    .replace('        ...(global.card===KARAOKE_CARD ?','        ...(LIST_CARD_IDS.has(global.card) ? {templateParams:validateListCardParams(global.card,detail.templateParams)} : {}),\n        ...(global.card===KARAOKE_CARD ?')
    .replace('        ...(GRAPHIC_CONTRACTS[id] ? {graphicParams:GRAPHIC_CONTRACTS[id].fields} : {}),',"        ...(GRAPHIC_CONTRACTS[id] ? {graphicParams:GRAPHIC_CONTRACTS[id].fields} : {}),\n        ...(LIST_CARD_IDS.has(id) ? {graphicParams:LIST_CARD_FIELDS,listRules:'只用已提供的真实完整记录，禁止捏造版本、日期或状态；8至40行，停点至少第五行且不是末行，没有足够真实记录就改用其他卡'} : {}),");
  if(screen) expectedPlanner=expectedPlanner
    .replace("import {LIST_CARD_IDS,LIST_CARD_FIELDS,validateListCardParams} from './list-card-contracts.mjs';","import {LIST_CARD_IDS,LIST_CARD_FIELDS,validateListCardParams} from './list-card-contracts.mjs';\nimport {SCREEN_CARD_IDS,SCREEN_CARD_FIELDS,validateScreenCardParams} from './screen-card-contracts.mjs';")
    .replace("  ...Object.fromEntries(Object.entries(TEXT_CARD_CONTRACTS).map(([id,contract]) => [id,contract.summary])),",
      "  ...Object.fromEntries(Object.entries(TEXT_CARD_CONTRACTS).map(([id,contract]) => [id,contract.summary])),\n  'effects/fui-hud-moves/reticle-lock-on': '真实页面目标框锁定与状态标签',\n  'effects/brand-frame-snap': '真实页面设计/开发模式切换',\n  'effects/spotlight-sweep-moves/glow-wake-sleep-panel': '真实页面由暗至亮的聚光扫显',\n  'effects/spotlight-sweep-moves/slide-spotlight-pan': '真实宽面板横向聚光巡览',\n  'effects/spotlight-sweep-moves/corner-spotlight-reveal': '真实页面从角落聚光显影',\n  'effects/radial-ripple-phone-chips': '真实手机长截图配合两项功能标签',\n  'outro/edit-hook-moves/logo-sting-button': '真实前镜与彩蛋详情的片尾钩子',")
    .replace('  ...Object.keys(TEXT_CARD_CONTRACTS),','  ...Object.keys(TEXT_CARD_CONTRACTS),\n  ...SCREEN_CARD_IDS,')
    .replace('    } else if(globals[i].card===KARAOKE_CARD){','    } else if(SCREEN_CARD_IDS.has(globals[i].card)){\n      validateScreenCardParams(globals[i].card,shot.templateParams);\n    } else if(globals[i].card===KARAOKE_CARD){')
    .replace('        ...(global.card===KARAOKE_CARD ?','        ...(SCREEN_CARD_IDS.has(global.card) ? {templateParams:validateScreenCardParams(global.card,detail.templateParams)} : {}),\n        ...(global.card===KARAOKE_CARD ?')
    .replace('        motion:indexed?',"        ...(SCREEN_CARD_IDS.has(id) ? {graphicParams:SCREEN_CARD_FIELDS[id],screenRules:'PNG路径、尺寸和SHA必须逐项来自真实素材清单；目标框必须来自同会话DOM测量。缺数据就改用其他卡，禁止编造；竖屏必须提供本卡要求的真实竖向截图，不得把横版整镜缩小。'} : {}),\n        motion:indexed?")
    .replace("mediaSlots:id === MEDIA_CARD ? ['组件内部视频'] : contract?.params?.图片视频 || [],","mediaSlots:SCREEN_CARD_IDS.has(id) ? ['真实本地PNG页面截图'] : id === MEDIA_CARD ? ['组件内部视频'] : contract?.params?.图片视频 || [],");
  assert.equal(currentText('director/a-mode-run.mjs').replaceAll('\r\n','\n'),expectedPlanner.replaceAll('\r\n','\n'));
  if(screen){
    const expectedAdapter=oldText('template/src/TemplateAdapter.tsx')
      .replace("import {LIST_CARD_IDS,validateListCardParams} from '../../director/list-card-contracts.mjs';","import {LIST_CARD_IDS,validateListCardParams} from '../../director/list-card-contracts.mjs';\nimport {SCREEN_CARD_IDS,validateScreenCardParams} from '../../director/screen-card-contracts.mjs';")
      .replace('  const props: Record<string, unknown> = {};','  const props: Record<string, unknown> = {};\n  if (SCREEN_CARD_IDS.has(shotCard) && (shot.skin || shot.templateParams)) {\n    Object.assign(props,validateScreenCardParams(shotCard,shot.templateParams));\n  }');
    const id=prior.cards[0].id;
    assert.equal(registryBinding('template/src/TemplateAdapter.tsx',currentText('template/src/TemplateAdapter.tsx'),id).sharedSha256,
      registryBinding('template/src/TemplateAdapter.tsx',expectedAdapter,id).sharedSha256,'Unexpected shared media adapter change');
    const expectedPreflight=oldText('director/a-mode-render-preflight.mjs')
      .replace("import {LIST_CARD_IDS,validateListCardParams} from './list-card-contracts.mjs';","import {LIST_CARD_IDS,validateListCardParams} from './list-card-contracts.mjs';\nimport {SCREEN_CARD_IDS} from './screen-card-contracts.mjs';\nimport {assertScreenCardAssets} from './screen-card-assets.mjs';")
      .replace('      else if(shot.shotCard===KARAOKE_CARD)', '      else if(SCREEN_CARD_IDS.has(shot.shotCard)) assertScreenCardAssets(root,shot.shotCard,shot.templateParams);\n      else if(shot.shotCard===KARAOKE_CARD)');
    assert.equal(currentText('director/a-mode-render-preflight.mjs').replaceAll('\r\n','\n'),expectedPreflight.replaceAll('\r\n','\n'));
  }
  if(karaoke){
    const expectedAdapter=oldText('template/src/TemplateAdapter.tsx')
      .replace("import {NUMERIC_CARD_CONTRACTS,validateNumericCardParams,assertNumericCardDuration} from '../../director/numeric-card-contracts.mjs';","import {NUMERIC_CARD_CONTRACTS,validateNumericCardParams,assertNumericCardDuration} from '../../director/numeric-card-contracts.mjs';\nimport {KARAOKE_CARD,validateKaraokeTimings} from '../../director/karaoke-timing.mjs';")
      .replace('  const lines = shot.lines?.map(line => line.trim()).filter(Boolean);',"  const lines = shot.lines?.map(line => line.trim()).filter(Boolean);\n  if(shotCard===KARAOKE_CARD && shot.skin){\n    props.timedWords=validateKaraokeTimings(shot.templateParams?.timedWords,lines,shot.durationInFrames);\n  }");
    assert.equal(currentText('template/src/TemplateAdapter.tsx').replaceAll('\r\n','\n'),expectedAdapter.replaceAll('\r\n','\n'));
  }
  if(list){
    const expectedAdapter=oldText('template/src/TemplateAdapter.tsx')
      .replace("import {KARAOKE_CARD,validateKaraokeTimings} from '../../director/karaoke-timing.mjs';","import {KARAOKE_CARD,validateKaraokeTimings} from '../../director/karaoke-timing.mjs';\nimport {LIST_CARD_IDS,validateListCardParams} from '../../director/list-card-contracts.mjs';")
      .replace('  const props: Record<string, unknown> = {};','  const props: Record<string, unknown> = {};\n  if (LIST_CARD_IDS.has(shotCard) && (shot.skin || shot.templateParams)) {\n    Object.assign(props,validateListCardParams(shotCard,shot.templateParams));\n  }');
    const id=prior.cards[0].id;
    assert.equal(registryBinding('template/src/TemplateAdapter.tsx',currentText('template/src/TemplateAdapter.tsx'),id).sharedSha256,
      registryBinding('template/src/TemplateAdapter.tsx',expectedAdapter,id).sharedSha256,'Unexpected adapter shared changes');
    const expectedPreflight=oldText('director/a-mode-render-preflight.mjs')
      .replace("import {KARAOKE_CARD,validateKaraokeTimings} from './karaoke-timing.mjs';","import {KARAOKE_CARD,validateKaraokeTimings} from './karaoke-timing.mjs';\nimport {LIST_CARD_IDS,validateListCardParams} from './list-card-contracts.mjs';")
      .replace('      } else if(shot.shotCard===KARAOKE_CARD)', '      } else if(LIST_CARD_IDS.has(shot.shotCard)) validateListCardParams(shot.shotCard,shot.templateParams);\n      else if(shot.shotCard===KARAOKE_CARD)');
    assert.equal(currentText('director/a-mode-render-preflight.mjs').replaceAll('\r\n','\n'),expectedPreflight.replaceAll('\r\n','\n'));
  }
  if(karaoke){
    const expectedPreflight=oldText('director/a-mode-render-preflight.mjs')
      .replace("import {admittedTextCards} from './text-card-admission.mjs';","import {admittedTextCards} from './text-card-admission.mjs';\nimport {KARAOKE_CARD,validateKaraokeTimings} from './karaoke-timing.mjs';")
      .replace('      } else validateGraphicParams(shot.shotCard,shot.templateParams,shot.text);',"      } else if(shot.shotCard===KARAOKE_CARD) validateKaraokeTimings(shot.templateParams?.timedWords,shot.displayLines,shot.durationInFrames);\n      else validateGraphicParams(shot.shotCard,shot.templateParams,shot.text);");
    assert.equal(currentText('director/a-mode-render-preflight.mjs').replaceAll('\r\n','\n'),expectedPreflight.replaceAll('\r\n','\n'));
  }
  const changedSources=Object.keys(snapshot.snapshots).filter(file=>hash(file)!==snapshot.snapshots[file].sha256);
  const serveUrl=await bundle({entryPoint:absolute('template/src/index.ts'),publicDir:absolute('template/public'),
    outDir:absolute(dir+'/bundle')});
  const browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
  const checks=[];
  try{
    for(const card of prior.cards){
      const report=read(card.report);
      assert.equal(hash(card.report),card.reportSha256);
      const adapted={...card,sourceHashes:{...card.sourceHashes}};
      for(const file of changedSources) if(Object.hasOwn(adapted.sourceHashes,file)) adapted.sourceHashes[file]=hash(file);
      for(const file of ['template/src/TemplateAdapter.tsx','director/text-card-contracts.mjs']){
        const before=registryBinding(file,oldText(file),card.id),after=registryBinding(file,currentText(file),card.id);
        assert.equal(before.entrySha256,after.entrySha256,'Old card entry changed: '+card.id);
        if(file.endsWith('text-card-contracts.mjs') || (file.endsWith('TemplateAdapter.tsx')&&!karaoke&&!list&&!screen)) assert.equal(before.sharedSha256,after.sharedSha256);
      }
      adapted.sourceBinding=bindTextCardSources(root,card.id,adapted.sourceHashes);
      assert.ok(textCardSourcesCurrent(root,adapted),'Unrelated runtime dependency changed: '+card.id);
      const cases=report.cases.filter(item=>item.card===card.id);
      assert.equal(cases.length,2);
      for(const item of cases){
        assert.equal(hash(item.propsFile),item.propsSha256);assert.equal(hash(item.video.file),item.video.sha256);
        for(const sample of item.samples) assert.equal(hash(sample.file),sample.sha256);
        const previous=read(item.propsFile),shot=previous.storyboard.shots[0],frames=shot.durationInFrames;
        const input=shot.shotCard===KARAOKE_CARD ? read(report.fixtureFile).cards.find(input=>input.id===card.id) : null;
        if(shot.shotCard===KARAOKE_CARD) assert.ok(input?.words?.length,'Real prior Karaoke words required');
        const segments=[{text:shot.text,fromFrame:0,durationInFrames:frames,...(input ? {words:input.words} : {})}];
        const globals=validateGlobalPlan({shots:[{fromSegment:0,toSegment:1,type:shot.type,card:shot.shotCard,
          material:shot.material,materialRole:shot.materialRole,reason:shot.direction}]},segments,
          [{path:shot.material,duration_sec:report.media.durationSeconds}],{requireBackground:true,availableCards:[card.id]});
        const details=validateShotPlan({shots:[{index:0,displayLines:shot.displayLines,
          elementPlan:shot.elementPlan,captionHighlights:[''],
          ...(shot.templateParams && shot.shotCard!==KARAOKE_CARD ? {templateParams:shot.templateParams} : {})}]},globals,segments);
        const storyboard=buildStoryboard(root,'00000000-0000-4000-8000-000000000004',
          {fps:30,totalFrames:frames,segments},globals,details,{...read('director/current-theme.json'),aspectRatio:item.aspect});
        storyboard.shots[0].materialPlayback=fitVideoPlayback(report.media.durationSeconds,frames,30);
        if(shot.audio) storyboard.shots[0].audio=shot.audio;
        const props={...previous,storyboard:{...storyboard,style:previous.storyboard.style,theme:previous.storyboard.theme,
          audio:undefined,subtitleHighlights:undefined,subtitleV1:undefined}};
        assert.deepEqual(JSON.parse(JSON.stringify(props)),previous,'Actual planner props changed: '+card.id);
        const selected=await selectComposition({serveUrl,id:'DynamicVideo',inputProps:props,puppeteerInstance:browser});
        assert.deepEqual(selected.props,previous,'Resolved props changed: '+card.id);
        assert.equal(selected.durationInFrames,frames);assert.equal(selected.fps,30);
        assert.equal(selected.width,item.aspect==='9:16'?1080:1920);assert.equal(selected.height,item.aspect==='9:16'?1920:1080);
        checks.push({id:card.id,aspect:item.aspect,propsSha256:item.propsSha256,videoSha256:item.video.sha256,
          durationInFrames:frames,actualPropsIdentical:true});
      }
      if(checks.length%20===0 || checks.length===prior.cards.length*2) console.log(JSON.stringify({checkedCompositions:checks.length,total:prior.cards.length*2}));
    }
  }finally{await browser.close({silent:true});}
  const proofFile=dir+'/compatibility.json';
  assert.ok(!fs.existsSync(absolute(proofFile)),'Do not overwrite a completed compatibility proof');
  fs.writeFileSync(absolute(proofFile),JSON.stringify({schema:'text-duration-compatibility-v1',
    snapshot:dir+'/snapshot.json',snapshotSha256:hash(dir+'/snapshot.json'),
    changedSources:Object.fromEntries(changedSources.map(file=>[file,hash(file)])),
    checker:'template/revalidate-text-duration-support.mjs',checkerSha256:hash('template/revalidate-text-duration-support.mjs'),
    checks,renderedVideos:0,actualModelValidated:false},null,2)+'\n');
  const cards=prior.cards.map(card=>{
    const sourceHashes={...card.sourceHashes,[proofFile]:hash(proofFile)};
    for(const file of changedSources) sourceHashes[file]=hash(file);
    if(karaoke) sourceHashes['director/karaoke-timing.mjs']=hash('director/karaoke-timing.mjs');
    if(list) sourceHashes['director/list-card-contracts.mjs']=hash('director/list-card-contracts.mjs');
    if(screen) for(const file of ['director/screen-card-contracts.mjs','director/screen-card-assets.mjs']) sourceHashes[file]=hash(file);
    return {...card,sourceHashes,sourceBinding:bindTextCardSources(root,card.id,sourceHashes),
      durationCompatibility:{proof:proofFile,sha256:hash(proofFile)}};
  });
  fs.writeFileSync(absolute(recordFile),JSON.stringify({...prior,cards,
    history:[...(prior.history||[]),{snapshot:snapshot.record,sha256:snapshot.recordSha256,
      reason:screen ? 'Full old business props and resolved compositions revalidated for actual screen media support' : list ? 'Full old business props and resolved compositions revalidated for structured list support' : 'Full old business props and resolved compositions revalidated for duration extension'}]},null,2)+'\n');
  assert.deepEqual(admittedTextCards(root),snapshot.validIds);
  console.log(JSON.stringify({restoredCards:cards.length,actualCompositions:checks.length,reRenderedVideos:0}));
}
