import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function installHostContextRuntime(project){
  const src=path.join(project,'remotion/src'),file=path.join(src,'Main.tsx');
  let code=fs.readFileSync(file,'utf8');
  if(!code.includes("import {hostStageStyle} from './talkcraft-host-context.mjs';")){
    const old="style={{position:'absolute', right:'2%', bottom:'8%', width:'38%', height:'84%', overflow:'hidden', borderRadius:6}}";
    if(!code.includes("shot.subject === 'person'")||!code.includes(old))throw Error('人物轨道不是已知生成实现，拒绝覆盖自定义布局');
    code="import {hostStageStyle} from './talkcraft-host-context.mjs';\n"+code.replace(old,'style={hostStageStyle(shot.shotCard) as React.CSSProperties}');
    fs.writeFileSync(file,code);
  }
  fs.copyFileSync(fileURLToPath(new URL('./talkcraft-host-context.mjs',import.meta.url)),path.join(src,'talkcraft-host-context.mjs'));
}
