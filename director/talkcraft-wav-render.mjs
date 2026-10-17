import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Match upstream render_shots' audio pass: load bundling/browser configuration,
// but never pass video encoder options (CRF, pixelFormat, JPEG quality) to WAV.
export async function renderTalkcraftWav({project,skillRoot,output,browser,props,concurrency=4}) {
  if(fs.existsSync(output))throw Error('已有音轨，禁止覆盖：'+output);
  const require=createRequire(path.join(project,'package.json'));
  const {loadProjectBundleOptions,projectRenderOptions}=await import(pathToFileURL(path.join(skillRoot,'scripts/remotion_project_config.mjs')).href);
  const {bundle}=require('@remotion/bundler');
  const {selectComposition,renderMedia}=require('@remotion/renderer');
  const bundleOptions=await loadProjectBundleOptions(require,project);
  const renderOptions=projectRenderOptions(require,{browser});
  const serveUrl=await bundle({entryPoint:path.join(project,'src/index.ts'),...bundleOptions,onProgress:()=>{}});
  const inputProps={...props,audioOnly:true};
  const composition=await selectComposition({serveUrl,id:'Main',inputProps,...renderOptions});
  await renderMedia({composition:{...composition,props:{...composition.props,...inputProps}},serveUrl,
    inputProps,...renderOptions,codec:'wav',outputLocation:output,imageFormat:'none',concurrency});
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [project,skillRoot,output,browser]=process.argv.slice(2);
  await renderTalkcraftWav({project,skillRoot,output,browser,props:{sfxSolo:true}});
}
