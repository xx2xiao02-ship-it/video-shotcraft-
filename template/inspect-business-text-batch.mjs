import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import {ffmpegPath} from '../director/packaging-media.mjs';
import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'..'),batch=process.argv[2];
if(!/^card-business-text-batch\d+(?:-v\d+|-media-v\d+)?$/.test(batch || '')) throw new Error('Isolated batch required');
const out=path.join(root,'template/out',batch),report=JSON.parse(fs.readFileSync(path.join(out,'acceptance.json'),'utf8'));
const cards=[...new Set(report.cases.map(item=>item.card))];
const videos=process.argv.includes('--videos');
const nativeCard=process.argv.find(arg=>arg.startsWith('--native-card='))?.slice('--native-card='.length);
if(nativeCard){
  const frame=Number(process.argv.find(arg=>arg.startsWith('--native-frame='))?.slice('--native-frame='.length));
  assert.ok(Number.isInteger(frame)&&frame>=0&&frame<180);
  const cases=report.cases.filter(item=>item.card===nativeCard);assert.equal(cases.length,2);
  const browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
  try{
    for(const item of cases){
      const inputProps={card:item.card,injected:false};
      const selected=await selectComposition({serveUrl:path.join(out,'bundle'),id:'CardAcceptance',inputProps,puppeteerInstance:browser});
      assert.equal(selected.props.card,item.card);
      const composition={...selected,width:item.aspect==='9:16'?1080:1920,height:item.aspect==='9:16'?1920:1080};
      const target=path.join(out,`native-${cards.indexOf(item.card)}-${item.aspect==='9:16'?'portrait':'landscape'}-f${frame}.png`);
      await renderStill({serveUrl:path.join(out,'bundle'),composition,inputProps,puppeteerInstance:browser,frame,scale:0.5,output:target});
      item.nativeDefaultPrevious=item.nativeDefault;
      item.nativeDefault={file:path.relative(root,target).replaceAll('\\','/'),frame,resolvedCard:selected.props.card,
        sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')};
    }
  }finally{await browser.close({silent:true});}
  fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
}
for(const [index,card] of cards.entries()){
  const cases=report.cases.filter(item=>item.card===card);
  if(cases.length!==2 || cases.some(item=>item.error)) continue;
  if(videos && cases.some(item=>!item.video)) continue;
  const samples=[];
  for(const item of cases){
    const selected=[item.samples[1],item.samples.at(-1)];
    if(!videos){samples.push(...selected);continue;}
    item.decodedVideoReview=[];
    for(const sample of selected){
      const target=path.join(out,`decoded-${index}-${item.aspect==='9:16'?'portrait':'landscape'}-f${sample.frame}.png`);
      execFileSync(ffmpegPath(),['-y','-v','error','-i',path.join(root,item.video.file),'-vf',`select=eq(n\\,${sample.frame})`,
        '-frames:v','1',target],{windowsHide:true});
      const record={file:path.relative(root,target).replaceAll('\\','/'),frame:sample.frame,
        sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')};
      samples.push(record);item.decodedVideoReview.push(record);
    }
  }
  const filters=samples.map((_,i)=>`[${i}:v]scale=480:480:force_original_aspect_ratio=decrease,pad=480:480:(ow-iw)/2:(oh-ih)/2:color=white[s${i}]`);
  filters.push('[s0][s1][s2][s3]xstack=inputs=4:layout=0_0|0_480|480_0|480_480[out]');
  execFileSync(ffmpegPath(),['-y','-v','error',...samples.flatMap(sample=>['-i',path.join(root,sample.file)]),
    '-filter_complex',filters.join(';'),'-map','[out]','-frames:v','1',path.join(out,`${videos?'video-review':'review'}-${index}.png`)],{windowsHide:true});
}
if(videos) fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({reviewSheets:cards.length}));
