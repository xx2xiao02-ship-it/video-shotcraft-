import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {aModeRuntimeConfig} from './a-mode-provider-config.mjs';
import {targetFingerprint} from './talkcraft-editorial-fallback.mjs';

export const ACCTOKEN_BASE_URL='https://www.acctoken.com/v1';
export const ACCTOKEN_MODEL='deepseek-v4.1-flash';
const directory=env=>env.SHOTCRAFT_CONFIG_DIR||path.join(env.LOCALAPPDATA||path.join(env.USERPROFILE||'.','AppData','Local'),'VideoShotCraft');
export function editorialProviderSelection(runId,{env=process.env}={}){
 if(!/^[a-zA-Z0-9-]+$/u.test(runId))throw Error('编导任务ID无效');
 const file=path.join(directory(env),'b-mode-editorial-providers',`${runId}.json`);
 if(!fs.existsSync(file))return null;
 const r=JSON.parse(fs.readFileSync(file,'utf8'));
 if(r.schema!=='talkcraft-editorial-provider-v1'||r.runId!==runId||r.provider!=='acctoken'||r.model!==ACCTOKEN_MODEL||
    r.baseUrl!==ACCTOKEN_BASE_URL||r.wireApi!=='responses'||Object.keys(r).some(k=>!['schema','runId','provider','model','baseUrl','wireApi'].includes(k)))
  throw Error('当前任务编导供应商配置无效，禁止回退到旧供应商');
 return r;
}
function localSecret(env){
 const file=path.join(directory(env),'acctoken-api-key.clixml');
 if(!fs.existsSync(file))throw Error('未找到AccToken本机加密Key');
 try{return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
  '$p=[Console]::In.ReadToEnd(); $s=Import-Clixml -LiteralPath $p; if($s -isnot [Security.SecureString]){exit 2}; $b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($b))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}'],
  {input:file,encoding:'utf8',timeout:10000,windowsHide:true,stdio:['pipe','pipe','pipe']});}
 catch{throw Error('AccToken本机Key无法解密，请用当前Windows账户重新保存');}
}
export function talkcraftEditorialConfig(runId,{env=process.env,readSecret=localSecret,legacyConfig=aModeRuntimeConfig}={}){
 const selected=editorialProviderSelection(runId,{env});
 if(!selected)return legacyConfig(env);
 const apiKey=env.ACCTOKEN_API_KEY||readSecret(env);
 if(typeof apiKey!=='string'||!apiKey||/[\s"']/u.test(apiKey))throw Error('AccToken Key为空或含空格、引号，未发请求');
 return {provider:'acctoken',responsesUrl:`${selected.baseUrl}/responses`,apiKey,globalModel:'pro',shotModel:'pro',
  proEndpoint:selected.model,turboEndpoint:selected.model};
}
export function editorialProviderBinding(runId,options={}){
 if(!editorialProviderSelection(runId,options))return null;
 const c=talkcraftEditorialConfig(runId,options);
 return {provider:c.provider,responsesUrl:c.responsesUrl,model:c.proEndpoint,wireApi:'responses',
  targetFingerprint:targetFingerprint({provider:c.provider,responsesUrl:c.responsesUrl,endpoint:c.proEndpoint,apiKey:c.apiKey})};
}
