import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition} from '@remotion/renderer';
import {cachedStillRenderer} from './cached-still-renderer.mjs';
import {validateListCardParams} from '../director/list-card-contracts.mjs';

const root=path.resolve(import.meta.dirname,'..');
const fixtureFile=path.join(root,'template/fixtures/card-business-text-batch013-list.json');
const sourceFile=path.join(root,'template/fixtures/card-business-text-batch013-list-source.json');
const revision=process.argv.find(arg=>arg.startsWith('--revision='))?.slice(11);
assert.ok(!revision || /^\d+$/.test(revision),'Invalid probe revision');
const out=path.join(root,'template/out/card-business-text-batch013-list-probe'+(revision?`-v${revision}`:''));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if(!fs.existsSync(fixtureFile)){
  assert.ok(!fs.existsSync(sourceFile),'Preserve existing frozen list source');
  const progressFile=path.join(root,'template/out/card-governance-progress/progress.json');
  const progress=JSON.parse(fs.readFileSync(progressFile,'utf8'));
  const records=progress.cards.flatMap(card=>card.variants.filter(variant=>variant.status.locallyTested).map(variant=>({
    id:variant.runtimeId,title:variant.label,detail:'本地验证',tag:'',cardId:card.id,
    locallyTested:variant.status.locallyTested,
  })));
  assert.ok(records.length>=38);assert.equal(new Set(records.map(row=>row.id)).size,records.length);
  const source={schema:'frozen-local-admission-list-v1',origin:'template/out/card-governance-progress/progress.json',
    originSha256:hash(progressFile),counts:progress.counts,records};
  fs.writeFileSync(sourceFile,JSON.stringify(source,null,2)+'\n');
  const cards=[['data/scroll-brake-moves/changelog-scroll-brake',34,28],['data/scroll-brake-moves/brake-reticle-lock',38,30]].map(([id,count,target])=>{
    const rows=records.slice(0,count).map((row,i)=>({id:row.id,title:row.title,detail:row.detail,tag:String(i+1)}));
    const templateParams={rows,targetId:rows[target].id,focusLabel:'本地有效'};
    validateListCardParams(id,templateParams);
    return {id,lines:['本地验证清单'],narration:'逐项核对镜头卡的本地验证结果，定位这条已经通过验证的记录。',templateParams,
      inspectFrames:id.endsWith('brake-reticle-lock')?[0,59,68,100,179]:[0,64,82,100,179]};
  });
  fs.writeFileSync(fixtureFile,JSON.stringify({schema:'card-business-text-fixtures-v1',fps:30,durationInFrames:180,
    aspects:['16:9','9:16'],dataSource:'template/fixtures/card-business-text-batch013-list-source.json',dataSourceSha256:hash(sourceFile),cards},null,2)+'\n');
}
const fixture=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));
assert.equal(hash(sourceFile),fixture.dataSourceSha256);
const source=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
for(const item of fixture.cards){
  validateListCardParams(item.id,item.templateParams);
  item.templateParams.rows.forEach((row,i)=>{
    const original=source.records.find(record=>record.id===row.id);
    assert.ok(original?.locallyTested);assert.equal(row.title,original.title);assert.equal(row.detail,original.detail);assert.equal(row.tag,String(i+1));
  });
}
fs.mkdirSync(out,{recursive:true});
const reportFile=path.join(out,'component-probe.json');
assert.ok(!fs.existsSync(reportFile),'Existing probe is preserved; use a separate revision before rerendering');
const sources=['template/list-card-component-probe.tsx','director/list-card-contracts.mjs',
  'demos/data/scroll-brake-moves/BusinessRowContent.tsx','demos/data/scroll-brake-moves/ChangelogScrollBrake.tsx',
  'demos/data/scroll-brake-moves/BrakeReticleLock.tsx','demos/_fixtures/BusinessTextStage.tsx','demos/_fixtures/TemplateSkin.ts','demos/_fixtures/Fixtures.tsx'];
const sourceHashes=Object.fromEntries(sources.map(file=>[file,hash(path.join(root,file))]));
const serveUrl=await bundle({entryPoint:path.join(root,'template/list-card-component-probe.tsx'),outDir:path.join(out,'bundle')});
const browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
const session=await cachedStillRenderer(serveUrl,path.join(root,'template'));
const report={scope:'isolated original component sample frames only; no director consumption, video or admission claim',sourceHashes,
  fixtureFile:path.relative(root,fixtureFile).replaceAll('\\','/'),fixtureSha256:hash(fixtureFile),cases:[]};
try{
  for(const item of fixture.cards)for(const aspect of fixture.aspects){
    const props={words:item.lines,...item.templateParams,skin:{bg:'#101820',text:'#ffffff',muted:'#c4ced5',accent:'#66d2cc',surface:'#202c35',fontFamily:'Microsoft YaHei'}};
    const id=item.id.endsWith('brake-reticle-lock')?'ReticleListProbe':'ChangelogListProbe';
    const selected=await selectComposition({serveUrl,id,inputProps:props,puppeteerInstance:browser,logLevel:'error'});
    for(const key of ['words','rows','targetId','focusLabel','skin'])assert.deepEqual(selected.props[key],props[key]);
    const composition={...selected,width:aspect==='9:16'?1080:1920,height:aspect==='9:16'?1920:1080};
    const result={card:item.id,aspect,props:composition.props,samples:[]};
    for(const frame of item.inspectFrames){
      const file=path.join(out,`${id}-${aspect==='9:16'?'portrait':'landscape'}-${frame}.png`);
      await session.render({serveUrl,composition,inputProps:props,puppeteerInstance:browser,frame,scale:0.5,output:file});
      result.samples.push({frame,file:path.relative(root,file).replaceAll('\\','/'),sha256:hash(file)});
    }
    report.cases.push(result);console.log(item.id+' '+aspect+': 5 samples passed');
  }
  for(const [file,sha]of Object.entries(sourceHashes))assert.equal(hash(path.join(root,file)),sha,'Source changed during probe');
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
}finally{await session.close();await browser.close({silent:true});}
