import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition, renderStill} from '@remotion/renderer';
import {ffmpegPath} from '../director/packaging-media.mjs';

const root=path.resolve(import.meta.dirname,'..');
const shortGraphics=process.argv.includes('--short-graphics');
const out=path.join(root,shortGraphics?'tmp/short-graphics-qa/compatibility':'tmp/video-material-qa/compatibility');
fs.mkdirSync(out,{recursive:true});
const admissionFile=path.join(root,'director/card-production-admission.json');
const prior=fs.readFileSync(admissionFile);
const admission=JSON.parse(prior);
const report=JSON.parse(fs.readFileSync(path.join(root,'template/out/card-acceptance-20260930-v3/acceptance.json')));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const sourceHashes=Object.fromEntries(Object.keys(admission.sourceHashes).map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
const allowed=new Set(['template/src/DynamicVideo.tsx','template/src/TemplateAdapter.tsx']);
if(shortGraphics) {
  allowed.add('demos/data/hatch-depth/HatchDepth.tsx');
  allowed.add('demos/ui-entrance/bezier-source-converge-merge/BezierSourceConvergeMerge.tsx');
}
for(const file of Object.keys(sourceHashes))
  if(sourceHashes[file]!==admission.sourceHashes[file]&&!allowed.has(file))throw new Error(`存在范围外的源码变化：${file}`);
const serveUrl=await bundle({entryPoint:path.join(root,'template/src/index.ts'),publicDir:path.join(root,'template/public')});
const browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
const results=[];
const pixels=file=>execFileSync(ffmpegPath(),['-v','error','-i',file,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,maxBuffer:16*1024*1024});
try{
  const base=await selectComposition({serveUrl,id:'CardAcceptance',puppeteerInstance:browser,inputProps:{card:admission.cards[0]}});
  for(const [i,card] of admission.cards.entries()){
    const fixture=report.businessCases.find(item=>item.card===card);
    if(!fixture)throw new Error(`缺少原业务验收样板：${card}`);
    const props={card,lines:fixture.lines,templateParams:fixture.templateParams,injected:true};
    for(const old of fixture.results){
      const output=path.join(out,`card-${i}-${old.aspect}-${old.frame}.png`);
      await renderStill({serveUrl,composition:{...base,width:old.aspect==='portrait'?1080:1920,
        height:old.aspect==='portrait'?1920:1080,props},inputProps:props,puppeteerInstance:browser,
        frame:old.frame,scale:0.5,output,timeoutInMilliseconds:15000,logLevel:'error'});
      const same=pixels(output).equals(pixels(old.file));
      if(!same)throw new Error(`图形卡画面发生变化，需要重新人工审核：${card}/${old.aspect}/${old.frame}`);
      results.push({card,aspect:old.aspect,frame:old.frame,output,pixelIdentical:true});
      console.log(`像素一致：${card}/${old.aspect}/${old.frame}`);
    }
  }
}finally{await browser.close({silent:true});}
fs.writeFileSync(path.join(out,'admission-before.json'),prior);
fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify({sourceHashes,priorAdmissionSha256:hash(prior),
  scope:'two previously admitted graphic cards, identical pixels across six samples each',results},null,2));
console.log(JSON.stringify({sourceHashes,passed:results.length},null,2));
