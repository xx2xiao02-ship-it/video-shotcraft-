import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function classifyRecognizedSourceText(result){
 const text=String(result?.text||'').trim(),han=(text.match(/\p{Script=Han}/gu)||[]).length;
 const latin=(text.match(/[a-z]{3,}/giu)||[]).length;
 // An empty OCR result is not proof that an image contains no text.
 if(han>=12&&/[\p{Script=Han}]{4}/u.test(text)&&han/(han+latin*5)>=0.6)return {contentLanguage:'zh-CN',recognizedText:text};
 const english=new Set((text.toLowerCase().match(/\b(?:the|and|with|from|this|that|for|are|was|have|which)\b/gu)||[]));
 if(latin>=8&&english.size>=3&&han<8)return {contentLanguage:'en',recognizedText:text};
 return null;
}
export function inspectSourceContent(project,source,{recognize}={}){
 const root=fs.realpathSync(path.join(project,'remotion/public'));
 const file=fs.realpathSync(path.join(root,source.localPath)),rel=path.relative(root,file);
 if(!rel||rel.startsWith('..')||path.isAbsolute(rel)||sha(fs.readFileSync(file))!==source.sha256)throw Error('内容核验文件或哈希不匹配');
 const script=fileURLToPath(new URL('./talkcraft-source-ocr.ps1',import.meta.url));
 const engineSha=sha(fs.readFileSync(script)),key=sha(source.sha256+engineSha),name='qa/source-content/'+key+'.json';
 const evidence=path.join(project,name);
 let result;
 if(fs.existsSync(evidence)){
  const cached=JSON.parse(fs.readFileSync(evidence));
  if(cached.sha256!==source.sha256||cached.engineSha!==engineSha)throw Error('内容核验缓存不匹配');
  result={...cached.result,classification:classifyRecognizedSourceText(cached.result)};
 }else{
  if(!recognize&&process.platform!=='win32')return null;
  const raw=recognize?recognize(file):JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-ImagePath',file],{windowsHide:true,timeout:60000,encoding:'utf8'}).replace(/^\uFEFF/u,''));
  result={...raw,classification:classifyRecognizedSourceText(raw)};
  fs.mkdirSync(path.dirname(evidence),{recursive:true});fs.writeFileSync(evidence,JSON.stringify({sha256:source.sha256,engineSha,result},null,2),{flag:'wx'});
 }
 if(!result.classification)return null;
 return {...result.classification,contentReview:{method:'local-ocr-language-only',evidence:name,sha256:sha(fs.readFileSync(evidence)),mediaSha256:source.sha256},
  ...(result.classification.contentLanguage==='en'?{languageReason:'已先执行中文检索；本候选实际图片经本机OCR识别为英文，保留原始内容及来源署名，不改写图片冒充中文版。'}:{})};
}
