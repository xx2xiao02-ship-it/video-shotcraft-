import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function installHostContextRuntime(project){
  const src=path.join(project,'remotion/src'),file=path.join(src,'Main.tsx');
  const before=fs.readFileSync(file,'utf8');let code=before;
  const oldImport="import {hostStageStyle} from './talkcraft-host-context.mjs';";
  const newImport="import {hostStageStyle,shouldRenderHost} from './talkcraft-host-context.mjs';";
  if(!code.includes(oldImport)&&!code.includes(newImport)){
    const old="style={{position:'absolute', right:'2%', bottom:'8%', width:'38%', height:'84%', overflow:'hidden', borderRadius:6}}";
    if(!code.includes("shot.subject === 'person'")||!code.includes(old))throw Error('人物轨道不是已知生成实现，拒绝覆盖自定义布局');
    code=oldImport+'\n'+code.replace(old,'style={hostStageStyle(shot.shotCard) as React.CSSProperties}');
  }
  if(code.includes(oldImport)){
    const old="{shot.subject === 'person' && <div style={hostStageStyle(shot.shotCard) as React.CSSProperties}>";
    if(!code.includes(old))throw Error('人物挂载不是已知生成实现，拒绝覆盖自定义轨道');
    code=code.replace(oldImport,newImport).replace(old,'{shouldRenderHost(shot) && <div style={hostStageStyle(shot.shotCard) as React.CSSProperties}>');
  }
  if(!code.includes('{shouldRenderHost(shot) && <div'))throw Error('人物挂载修正合同缺失');
  if(code!==before){
    const snapshot=path.join(project,'qa/host-mount-repair/Main.before.tsx');fs.mkdirSync(path.dirname(snapshot),{recursive:true});
    if(!fs.existsSync(snapshot))fs.writeFileSync(snapshot,before);
    fs.writeFileSync(file,code);
  }
  fs.copyFileSync(fileURLToPath(new URL('./talkcraft-host-context.mjs',import.meta.url)),path.join(src,'talkcraft-host-context.mjs'));
}
