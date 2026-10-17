import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {assertWordReveals,wordRevealSourceBinding,wordRevealUnits} from './talkcraft-word-reveal.mjs';
import {isNativePresentation} from './talkcraft-native-governance.mjs';
import {validateWordRuntime,validateTextBindings} from './talkcraft-word-runtime-validation.mjs';
import {nativeBridgeAuditPoints} from './talkcraft-native-bridge-audit.mjs';
import {loadProjectBundleOptions,projectRenderOptions} from '../_audit/video-talkcraft/scripts/remotion_project_config.mjs';
const project=path.resolve(process.argv[2]),work=path.resolve(process.argv[3]);
fs.mkdirSync(work,{recursive:true});const run=path.dirname(project);
const reveal=assertWordReveals(run),beats=wordRevealUnits(run),native=isNativePresentation(run);
const initialBinding=wordRevealSourceBinding(run);
const only=process.argv.find(s=>s.startsWith('--only='))?.slice(7).split(',');
const bindingOnly=process.argv.includes('--binding-only');
const events=reveal.events.filter(e=>!only||only.includes(e.beatId));
if(!events.length)throw Error('指定范围没有任何文字事件');
const runtimeFrames=[...new Set([...events.filter(e=>!e.deferredTo).flatMap(e=>{
 const b=beats.find(b=>b.id===e.beatId);return [Math.max(b.startFrame,e.globalFrame-1),Math.min(b.endFrame-1,Math.max(b.startFrame,e.globalFrame)+3)];
}),...(native?beats.filter(b=>!only||only.includes(b.id)).flatMap(b=>{const frames=[];for(let f=b.startFrame+15;f<b.endFrame-15;f+=30)frames.push(f);return frames;}):[]),
 ...(native?nativeBridgeAuditPoints(run).filter(p=>!only||only.includes(p.shotId)).map(p=>p.frame):[])])].sort((a,b)=>a-b);
const frames=bindingOnly?[...new Set([...events.filter(e=>!e.deferredTo).map(e=>{
 const beat=beats.find(b=>b.id===e.beatId);return Math.min(beat.endFrame-1,Math.max(beat.startFrame,e.globalFrame)+12);
}),...beats.filter(b=>!only||only.includes(b.id)).flatMap(b=>[Math.round((b.startFrame+b.endFrame)/2),b.endFrame-1])])].sort((a,b)=>a-b):runtimeFrames;
const require=createRequire(path.join(project,'package.json'));
const {bundle}=require('@remotion/bundler');const {renderStill,selectComposition,openBrowser}=require('@remotion/renderer');
const propsFile=path.join(project,'qa-repair-props.json');
const inputProps={...(fs.existsSync(propsFile)?JSON.parse(fs.readFileSync(propsFile)):{bgm:null,keyedHumans:{}}),auditWordReveal:true};
const bundleOptions=await loadProjectBundleOptions(require,project),renderOptions=projectRenderOptions(require,{browser:process.env.TALKCRAFT_BROWSER});
const serveUrl=await bundle({entryPoint:path.join(project,'src/index.ts'),publicDir:path.join(project,'public'),...bundleOptions,outDir:path.join(work,'render-bundle')});
const browser=await openBrowser('chrome',renderOptions);const rows=[];
try{
 const composition=await selectComposition({serveUrl,id:'Main',inputProps,puppeteerInstance:browser});
 for(const frame of frames){
  await renderStill({serveUrl,composition,inputProps,puppeteerInstance:browser,frame,logLevel:'error',output:path.join(work,'frame-'+frame+'.png'),
   onBrowserLog:e=>{const prefix='TALKCRAFT_WORD_REVEAL_AUDIT:';if(e.text?.includes(prefix))rows.push(JSON.parse(e.text.slice(e.text.indexOf(prefix)+prefix.length)));}});
  console.log('word frame',frame);
 }
}finally{await browser.close({silent:true});}
const failures=(bindingOnly?validateTextBindings:validateWordRuntime)({frames,rows,events,beats,native});
const binding=wordRevealSourceBinding(run);
if(JSON.stringify(binding)!==JSON.stringify(initialBinding))failures.push({reason:'source changed during runtime audit'});
const result={schema:bindingOnly?'talkcraft-text-binding-v1':'talkcraft-word-runtime-v2',scope:only?[...only].sort():null,native,passed:!failures.length,events:events.length,frames:frames.length,failures,binding,planBinding:reveal.binding,rows,userAcceptance:false};
fs.writeFileSync(path.join(work,bindingOnly?'text-binding-audit.json':'word-reveal-audit.json'),JSON.stringify(result,null,2)+'\n');
const suffix=only?'-'+[...only].sort().join('-'):'';
fs.writeFileSync(path.join(run,'qa/'+(bindingOnly?'text-binding-runtime':'word-reveal-runtime')+suffix+'.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,events:events.length,frames:frames.length,failures}));if(failures.length)process.exitCode=1;
