import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Upgrade only recognized generated statements. Preserve user scene code,
// shot/card parameters, timing, theme settings and upstream card sources.
export function installPresentationSkin(project){
  const source=path.dirname(fileURLToPath(import.meta.url)),src=path.join(project,'remotion/src');
  for(const name of ['talkcraft-presentation-skin.mjs','talkcraft-color-contrast.mjs','talkcraft-caption-style.mjs','talkcraft-caption-layer.mjs'])
    fs.copyFileSync(path.join(source,name),path.join(src,name));
  fs.copyFileSync(path.join(source,'talkcraft-keyword-caption.tsx'),path.join(src,'KeywordCaption.tsx'));
  const adapter=path.join(src,'talkcraft-template-adapter.tsx');
  if(fs.existsSync(adapter)){
    let code=fs.readFileSync(adapter,'utf8');
    if(!code.includes("from './talkcraft-caption-layer.mjs'")){
      const render='return React.createElement(Card,props);';
      if(!code.includes(render))throw Error('模板适配器已变化，不能安全安装字幕屏蔽');
      code="import {assertCaptionScene,templateCaptionMask} from './talkcraft-caption-layer.mjs';\n"+code;
      code=code.replace('const params = shot.templateParams || {};','const params = shot.templateParams || {};\n  assertCaptionScene(shot);');
      code=code.replace(render,'const mask=templateCaptionMask(shot.shotCard);\n  return <>{mask && <style data-template-caption-mask>{mask}</style>}{React.createElement(Card,props)}</>;');
      fs.writeFileSync(adapter,code);
    }
    const old='const props = {...params.cardProps as Record<string,unknown>};';
    if(code.includes(old)){
      code="import {captionCardProps} from './talkcraft-caption-style.mjs';\nimport {THEME} from './theme';\n"+code;
      code=code.replace(old,'const props = captionCardProps(shot.shotCard,params.cardProps as Record<string,unknown>,THEME);');
      fs.writeFileSync(adapter,code);
    }
  }
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
    const styledReturn='return line && !cardOwnsNarrationCaption(shot,line.text) ? <SubtitleLine text={line.text} /> : null;';
    const captionReturn='return line ? <SubtitleLine text={line.text} /> : null;';
    if(code.includes(captionReturn)&&code.includes('const now=frame/fps;')){
      code="import {cardOwnsNarrationCaption} from './talkcraft-presentation-skin.mjs';\nimport {SHOTS} from './shots';\n"+code;
      code=code.replace(captionReturn,"const shot=SHOTS.find(s=>now>=s.startSec&&now<s.startSec+s.durationSec);\n  return line && !cardOwnsNarrationCaption(shot,line.text) ? <SubtitleLine text={line.text} /> : null;");
      fs.writeFileSync(subtitles,code);
    }
    if(code.includes(styledReturn)){
      code="import {KeywordCaption} from './KeywordCaption';\n"+code;
      code=code.replace(styledReturn,'return line && !cardOwnsNarrationCaption(shot,line.text) ? <KeywordCaption line={line} /> : null;');
      fs.writeFileSync(subtitles,code);
    }
    code=code.replace("import {KeywordCaption,CaptionTheme} from './KeywordCaption';","import {KeywordCaption} from './KeywordCaption';")
      .replace('return <><CaptionTheme />{line && !cardOwnsNarrationCaption(shot,line.text) ? <KeywordCaption line={line} /> : null}</>;','return line && !cardOwnsNarrationCaption(shot,line.text) ? <KeywordCaption line={line} /> : null;');
    if(code.includes('export const phrases ='))
      code=code.replace('cardOwnsNarrationCaption(shot,line.text)','cardOwnsNarrationCaption(shot,line.text,phrases())');
    // The only narration caption owner is the final, camera-independent layer.
    code=code.replace(/line && !cardOwnsNarrationCaption\(shot,line.text(?:,phrases\(\))?\)/g,'line');
    fs.writeFileSync(subtitles,code);
    const old="color:'var(--sc-caption-color, var(--sc-text))', background:'color-mix(in srgb, var(--sc-surface) 76%, transparent)'";
    if(code.includes(old)){
      code="import {subtitleSkin} from './talkcraft-presentation-skin.mjs';\nimport {THEME} from './theme';\n"+code;
      code=code.replace(old,'...subtitleSkin(THEME)');
      code=code.replace('>{text}</div>','><span data-readable-caption="true">{text}</span></div>');
      fs.writeFileSync(subtitles,code);
    }
  }
  const main=path.join(src,'Main.tsx');
  if(fs.existsSync(main)){
    let code=fs.readFileSync(main,'utf8');
    if(!code.includes('data-final-caption-layer')){
      if((code.match(/<Subtitles\s*\/>/g)||[]).length!==1)throw Error('必须只有一个独立字幕入口');
      const end=code.lastIndexOf('</AbsoluteFill>');
      if(end<0)throw Error('缺少合成根节点，不能安装顶层字幕');
      code=code.replace(/<Subtitles\s*\/>/,'');
      const last=code.lastIndexOf('</AbsoluteFill>');
      code=code.slice(0,last)+'<AbsoluteFill data-final-caption-layer style={{zIndex:1000,pointerEvents:"none"}}><Subtitles /></AbsoluteFill>\n'+code.slice(last);
      fs.writeFileSync(main,code);
    }
  }
}
