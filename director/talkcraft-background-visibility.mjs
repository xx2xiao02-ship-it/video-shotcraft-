import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

import {DEFAULT_BACKGROUND_VISIBILITY,backgroundVisibility,backgroundBrightness} from './talkcraft-background-visibility-runtime.mjs';
export {DEFAULT_BACKGROUND_VISIBILITY,backgroundVisibility,backgroundBrightness};
export function backgroundVisibilityField(beat) {
  return {key:`${beat.id}__backgroundVisibility`,label:`${beat.id} · 背景可见度（0 黑屏，1 原片）`,
    type:'slider',default:backgroundVisibility(beat.background?.visibility),min:0,max:1,step:0.05};
}
export function backgroundBrightnessField(beat,value=beat.background?.brightness) {
  return {key:`${beat.id}__backgroundBrightness`,label:`${beat.id} · 背景素材亮度倍数`,
    type:'slider',default:backgroundBrightness(value),min:0.5,max:4,step:0.1};
}

// Explicit preparation, never a hidden render-time parameter replacement.
// Existing user overrides and other scene defaults are left intact.
export function installBackgroundVisibility(project) {
  const remotion=path.resolve(project,'remotion'),src=path.join(remotion,'src');
  const beats=JSON.parse(fs.readFileSync(path.join(remotion,'visual-beats.json'),'utf8'));
  const generationFile=path.resolve(project,'qa/background-generation.json');
  const generated=fs.existsSync(generationFile)?JSON.parse(fs.readFileSync(generationFile,'utf8')).records:[];
  const gainFor=beat=>{
    const source=path.resolve(remotion,'public',beat.background.src);
    // Asset hash and beat identity survive moving an EXE project to another path.
    const record=generated.find(r=>r.beatId===beat.id&&r.generator==='ffmpeg-gradients'&&r.sha256===beat.background.sha256);
    if(!record)return beat.background.brightness;
    if(createHash('sha256').update(fs.readFileSync(source)).digest('hex')!==record.sha256)throw Error('背景生成记录与实际素材不一致：'+beat.id);
    return beat.background.brightness??3;
  };
  const visualFile=path.join(src,'scenes/visual-scene.tsx');
  let visual=fs.readFileSync(visualFile,'utf8');
  const marker="opacity:backgroundVisibility(parameterOverrides[b.id+'__backgroundVisibility'] ?? b.background.visibility)";
  if(!visual.includes(marker)) {
    const old='objectFit:\'cover\',opacity:.13';
    if(!visual.includes(old))throw new Error('不支持的背景入口，拒绝猜测性替换');
    visual=visual.replace(old,"objectFit:'cover',"+marker);
    visual="import {backgroundVisibility} from '../background-visibility.mjs';\n"+visual;
  }
  if(!visual.includes('filter:background')) {
    visual=visual.replace('import {backgroundVisibility}', 'import {backgroundVisibility,backgroundBrightness}');
    visual=visual.replace(marker,marker+",filter:backgroundBrightness(parameterOverrides[b.id+'__backgroundBrightness'] ?? b.background.brightness)===1?'none':'brightness('+backgroundBrightness(parameterOverrides[b.id+'__backgroundBrightness'] ?? b.background.brightness)+')'");
  }
  const changes=[];
  for(const shot of new Set(beats.map(b=>b.semanticShot))) {
    const file=path.join(src,'scenes',shot+'.tsx'),code=fs.readFileSync(file,'utf8');
    const match=code.match(/export const PARAMS=(\[[\s\S]*?\]) as const;/);
    if(!match)throw new Error('镜头缺少可保存的参数表：'+shot);
    const fields=JSON.parse(match[1]);
    for(const beat of beats.filter(b=>b.semanticShot===shot)) {
      const field=backgroundVisibilityField(beat);
      if(!fields.some(f=>f.key===field.key))fields.push(field);
      const gain=backgroundBrightnessField(beat,gainFor(beat)),at=fields.findIndex(f=>f.key===gain.key);
      if(at<0)fields.push(gain);else fields[at]=gain;
    }
    changes.push([file,code.replace(match[0],`export const PARAMS=${JSON.stringify(fields)} as const;`)]);
  }
  // Validate all supported entries before writing any of them.
  fs.mkdirSync(path.join(remotion,'qa'),{recursive:true});
  fs.copyFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'talkcraft-background-visibility-runtime.mjs'),path.join(src,'background-visibility.mjs'));
  fs.writeFileSync(visualFile,visual);
  for(const [file,code] of changes)fs.writeFileSync(file,code);
  return {defaultVisibility:DEFAULT_BACKGROUND_VISIBILITY,beats:beats.length,shots:changes.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  console.log(JSON.stringify(installBackgroundVisibility(process.argv[2])));
