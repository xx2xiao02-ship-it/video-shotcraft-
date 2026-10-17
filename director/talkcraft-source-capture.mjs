import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export function validateCaptureSource(source){
 const url=new URL(source.url);
 if(url.protocol!=='https:'||url.username||url.password)throw Error('来源必须为无凭据的公开HTTPS页面');
 if(!/^[a-z0-9][a-z0-9-]{0,80}$/u.test(source.slug||''))throw Error('来源slug无效');
 if(!source.expected)throw Error('必须声明来源身份/正文核对表达式');
 new RegExp(source.expected,'iu');return source;
}
export function detailBounds(metadata,source){
 const chosen=metadata.headings.find(h=>new RegExp(source.clipMatch||source.expected,'iu').test(h.text));
 if(!chosen)throw Error('真实页面没有匹配的取景目标');
 const x=Math.max(0,chosen.x-28),y=Math.max(0,chosen.y-28);
 return {x,y,width:Math.min(metadata.width-x,Math.max(chosen.width+56,1000)),height:Math.min(metadata.height-y,Math.max(chosen.height+56,source.clipHeight||560))};
}
// Capture is independent of Remotion's render browser: that browser explicitly
// disables proxies. Never change render flags or rewrite remote HTML as a page.
export async function captureSourcePages({skillRoot,publicRoot,work,sources,env=process.env}){
 sources.forEach(validateCaptureSource);fs.mkdirSync(work,{recursive:true});
 const require=createRequire(path.join(skillRoot,'runtime/package.json'));
 const {HeadlessBrowser}=require(path.join(skillRoot,'runtime/node_modules/@remotion/renderer/dist/browser/Browser.js'));
 const profile=fs.mkdtempSync(path.join(work,'source-browser-')),proxy=env.HTTPS_PROXY||env.HTTP_PROXY;
 const args=['--headless','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,...(proxy?['--proxy-server='+proxy]:[]),'about:blank'];
 const browser=await HeadlessBrowser.create({defaultViewport:{width:1920,height:1080,deviceScaleFactor:2},timeout:20000,userDataDir:profile,args,executablePath:path.join(skillRoot,'runtime/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe'),logLevel:'error',indent:false});
 const results=[];
 try{for(const source of sources){
  const output=path.join(publicRoot,'pages',source.slug);
  if(fs.existsSync(output)){results.push({slug:source.slug,captured:false,error:'OUTPUT_EXISTS: 使用新版本slug保留旧素材'});continue;}
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
  try{
   let status=null;page.on('response',r=>{if(r.url().split('#')[0]===source.url)status=r.status();});
   try{const response=await page.goto({url:source.url,timeout:20000,options:{waitUntil:'load'}});status=response?.status()??status;}catch(e){if(!/Navigation timeout/u.test(e.message)||status!==200)throw e;}
   if(status!==200)throw Error('SOURCE_HTTP_'+status);
   await page.evaluate(()=>{const b=[...document.querySelectorAll('button,input[type=button],a')].find(e=>/^(no,? i do not accept|reject all|reject optional cookies)$/i.test(e.textContent?.trim()||e.value||''));if(b)b.click();});
   const metadata=await page.evaluate(()=>({url:location.href,title:document.title,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,text:document.body.innerText,headings:[...document.querySelectorAll('h1,h2,h3,p')].map(e=>{const r=e.getBoundingClientRect();return{text:e.textContent,x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height};}).filter(r=>r.width>0&&r.height>0)}));
   if(!new RegExp(source.expected,'iu').test(metadata.text)||/just a moment|access denied/iu.test(metadata.title))throw Error('SOURCE_CONTENT_NOT_VERIFIED');
   if(metadata.height<500||metadata.height>24000)throw Error('SOURCE_PAGE_GEOMETRY_INVALID');
   const bounds=detailBounds(metadata,source);fs.mkdirSync(output,{recursive:true});
   for(const [name,clip] of [['page',{x:0,y:0,width:metadata.width,height:metadata.height}],['detail',bounds]]){
    const {value}=await page._client().send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{...clip,scale:1}});
    fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(value.data,'base64'),{flag:'wx'});
   }
   fs.writeFileSync(path.join(output,'targets.json'),JSON.stringify({...metadata,detailBounds:bounds,deviceScaleFactor:2},null,2),{flag:'wx'});
   const sha256=createHash('sha256').update(fs.readFileSync(path.join(output,'detail.png'))).digest('hex');
   results.push({slug:source.slug,sourceUrl:source.url,captured:true,status,localPath:'pages/'+source.slug+'/detail.png',sha256,sourceCoordinates:'pages/'+source.slug+'/targets.json',licenseVerified:false,accepted:false});
  }catch(e){results.push({slug:source.slug,captured:false,error:String(e.message).replace(/https?:\/\/\S+/gu,'[url]')});}finally{await page.close();}
 }}finally{await browser.close({silent:true});}
 const report=path.join(work,'source-capture-'+Date.now()+'.json');fs.writeFileSync(report,JSON.stringify({sources:results,accepted:false},null,2),{flag:'wx'});return {report,sources:results};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const result=await captureSourcePages(config);
 console.log(JSON.stringify({report:result.report,sources:result.sources.map(s=>({slug:s.slug,captured:s.captured,error:s.error}))}));
 if(result.sources.some(s=>!s.captured))process.exitCode=1;
}
