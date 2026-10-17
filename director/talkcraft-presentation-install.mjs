import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Upgrade only recognized generated statements. Preserve user scene code,
// shot/card parameters, timing, theme settings and upstream card sources.
export function installPresentationSkin(project){
  const source=path.dirname(fileURLToPath(import.meta.url)),src=path.join(project,'remotion/src');
  for(const name of ['talkcraft-presentation-skin.mjs','talkcraft-color-contrast.mjs'])
    fs.copyFileSync(path.join(source,name),path.join(src,name));
  const scene=path.join(src,'scenes/scene-shared.tsx');
  if(fs.existsSync(scene)){
    let code=fs.readFileSync(scene,'utf8');
    const old="const scale = Math.min(width*.90/960,height*(material && p.materialRole !== 'background' ? .36 : .64)/540);";
    const position="left:(width-960*scale)/2,top:material && p.materialRole !== 'background'?height*.55:portrait?height*.27:(height-540*scale)/2";
    if(code.includes(old)){
      if(!code.includes(position))throw Error('公共场景的位置表达式已变化，请核对版式升级');
      code="import {cardStageLayout} from '../talkcraft-presentation-skin.mjs';\n"+code;
      code=code.replace(old,"const layout=cardStageLayout(width,height,{separateMaterial:Boolean(material && p.materialRole !== 'background')});\n  const {scale}=layout;");
      code=code.replace(position,'left:layout.left,top:layout.top');
      fs.writeFileSync(scene,code);
    }
  }
  const subtitles=path.join(src,'Subtitles.tsx');
  if(fs.existsSync(subtitles)){
    let code=fs.readFileSync(subtitles,'utf8');
    const captionReturn='return line ? <SubtitleLine text={line.text} /> : null;';
    if(code.includes(captionReturn)&&code.includes('const now=frame/fps;')){
      code="import {cardOwnsNarrationCaption} from './talkcraft-presentation-skin.mjs';\nimport {SHOTS} from './shots';\n"+code;
      code=code.replace(captionReturn,"const shot=SHOTS.find(s=>now>=s.startSec&&now<s.startSec+s.durationSec);\n  return line && !cardOwnsNarrationCaption(shot,line.text) ? <SubtitleLine text={line.text} /> : null;");
      fs.writeFileSync(subtitles,code);
    }
    const old="color:'var(--sc-caption-color, var(--sc-text))', background:'color-mix(in srgb, var(--sc-surface) 76%, transparent)'";
    if(code.includes(old)){
      code="import {subtitleSkin} from './talkcraft-presentation-skin.mjs';\nimport {THEME} from './theme';\n"+code;
      code=code.replace(old,'...subtitleSkin(THEME)');
      code=code.replace('>{text}</div>','><span data-readable-caption="true">{text}</span></div>');
      fs.writeFileSync(subtitles,code);
    }
  }
}
