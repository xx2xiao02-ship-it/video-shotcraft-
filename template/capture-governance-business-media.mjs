import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {openBrowser} from '@remotion/renderer';

const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'template/out/card-governance-progress');
const version=process.argv[2] || 'v1';
if(!/^v\d+$/.test(version)) throw new Error('Expected capture version vN.');
const output=path.join(root,'template/out/card-business-media-batch013-'+version);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(fs.existsSync(output)) throw new Error('Frozen capture output already exists; use a new version.');
const html=fs.readFileSync(path.join(source,'index.html'));
const data=fs.readFileSync(path.join(source,'progress.json'));
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'source.html'),html);
fs.writeFileSync(path.join(output,'source.json'),data);
const browser=await openBrowser('chrome',{logLevel:'error'});
const captures=[];
try {
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,
    pageIndex:0,onBrowserLog:null,onLog:()=>{}});
  for(const state of [
    {name:'all',width:1920,height:1080,gaps:false},
    {name:'gaps',width:1920,height:1080,gaps:true},
    {name:'all-portrait',width:900,height:1568,gaps:false},
    {name:'gaps-portrait',width:900,height:1568,gaps:true},
    {name:'list-detail',width:1920,height:1080,gaps:false,query:'data/scroll-brake-moves'},
    {name:'phone',width:540,height:2000,gaps:false},
  ]) {
    await page.setViewport({width:state.width,height:state.height,deviceScaleFactor:1});
    await page.goto({url:pathToFileURL(path.join(source,'index.html')).href,timeout:30000});
    const dom=await page.evaluate(async (gaps,focused,query)=>{
      await document.fonts.ready;
      const checkbox=document.querySelector('#gaps');
      checkbox.checked=gaps;
      const search=document.querySelector('#search');
      search.value=query;
      search.dispatchEvent(new Event('input',{bubbles:true}));
      checkbox.dispatchEvent(new Event('change',{bubbles:true}));
      if(focused) {
        const first=[...document.querySelectorAll('main>details')].find(row=>!row.hidden);
        first.open=true;
        window.scrollTo(0,first.getBoundingClientRect().top+window.scrollY-80);
      }
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const rect=element=>{
        const r=element.getBoundingClientRect();
        return {x:r.x,y:r.y,width:r.width,height:r.height};
      };
      const rows=[...document.querySelectorAll('main>details')].filter(row=>!row.hidden);
      return {title:document.title,heading:document.querySelector('h1').textContent,
        countText:document.querySelector('h1+p').textContent,
        searchRect:rect(document.querySelector('#search')),
        targetRect:rect(rows[0].querySelector(focused ? 'tbody td:last-child' : 'summary')),
        scrollY:window.scrollY,
        rows:rows.map(row=>({text:row.querySelector('summary').textContent,
          gaps:row.dataset.gaps==='true',rect:rect(row.querySelector('summary'))})),
        viewport:{width:innerWidth,height:innerHeight},
        pageHeight:document.documentElement.scrollHeight};
    },state.gaps,state.name!=='phone',state.query || '');
    if(!dom.rows.length || !dom.heading.includes('157')) throw new Error('Actual governance page is missing.');
    const response=await page._client().send('Page.captureScreenshot',{
      format:'png',fromSurface:true,captureBeyondViewport:false});
    const image=Buffer.from(response.value.data,'base64');
    const filename=state.name+'.png';
    fs.writeFileSync(path.join(output,filename),image);
    captures.push({...state,file:filename,sha256:sha(image),bytes:image.length,dom});
  }
  if(captures[0].sha256===captures[1].sha256) throw new Error('Different filter states must have different actual pixels.');
  if(sha(fs.readFileSync(path.join(source,'index.html')))!==sha(html) ||
    sha(fs.readFileSync(path.join(source,'progress.json')))!==sha(data)) {
    throw new Error('Source changed during capture.');
  }
  fs.writeFileSync(path.join(output,'capture.json'),JSON.stringify({
    capturedAt:new Date().toISOString(),sourceUrl:pathToFileURL(path.join(source,'index.html')).href,
    sourceHtmlSha256:sha(html),sourceJsonSha256:sha(data),
    counts:JSON.parse(data).counts,captures,status:'captured-not-admitted',
  },null,2)+'\n');
  console.log(JSON.stringify({output,captures:captures.map(c=>({file:c.file,
    bytes:c.bytes,visibleRecords:c.dom.rows.length,targetRect:c.dom.targetRect}))}));
} finally {
  await browser.close({silent:true});
}
