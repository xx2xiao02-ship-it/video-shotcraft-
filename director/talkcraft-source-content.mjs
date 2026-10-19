import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import nspell from 'nspell';
import englishDictionary from 'dictionary-en';
const sha=x=>createHash('sha256').update(x).digest('hex');
const englishSpelling=nspell(englishDictionary);
const lexiconSha256=sha(Buffer.concat([englishDictionary.aff,englishDictionary.dic]));
const classifierSha256=sha(fs.readFileSync(fileURLToPath(import.meta.url)));
export function classifyRecognizedSourceText(result){
 const text=String(result?.text||'').trim(),han=(text.match(/\p{Script=Han}/gu)||[]).length;
 const latin=(text.match(/[a-z]{3,}/giu)||[]).length;
 // An empty OCR result is not proof that an image contains no text.
 if(han>=12&&/[\p{Script=Han}]{4}/u.test(text)&&han/(han+latin*5)>=0.6)return {contentLanguage:'zh-CN',recognizedText:text};
 const english=new Set((text.toLowerCase().match(/\b(?:the|and|with|from|this|that|for|are|was|have|which)\b/gu)||[]));
 const words=text.toLowerCase().match(/[a-z]{3,}/gu)||[],known=words.filter(w=>englishSpelling.correct(w));
 const distinctKnownWords=new Set(known).size,coverage=known.length/Math.max(words.length,1);
 // Diagrams commonly contain labels rather than sentences. Corroborate the
 // actual OCR words with a pinned dictionary; never infer language from a URL,
 // source title, OCR engine locale, empty output or a repeated English token.
 const sentence=latin>=8&&english.size>=3&&han<8;
 const labels=words.length>=16&&distinctKnownWords>=12&&(text.match(/[a-z]/giu)||[]).length>=120&&han<3;
 if((sentence||labels)&&coverage>=0.9)return {contentLanguage:'en',recognizedText:text,
  languageEvidence:{method:'ocr-english-spelling',dictionary:'dictionary-en@4.0.0',lexiconSha256,words:words.length,knownWords:known.length,distinctKnownWords,coverage}};
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
 const rawSha256=sha(fs.readFileSync(evidence)),reviewName='qa/source-content/'+sha(rawSha256+classifierSha256+lexiconSha256)+'.language.json';
 const reviewFile=path.join(project,reviewName);
 const review=JSON.stringify({mediaSha256:source.sha256,ocrEvidence:name,ocrSha256:rawSha256,engineSha256:engineSha,classifierSha256,lexiconSha256,classification:result.classification},null,2);
 if(!fs.existsSync(reviewFile))fs.writeFileSync(reviewFile,review,{flag:'wx'});
 else if(fs.readFileSync(reviewFile,'utf8')!==review)throw Error('语言核验证据与当前OCR或识别器不一致');
 return {...result.classification,contentReview:{method:'local-ocr-language-only',evidence:reviewName,sha256:sha(fs.readFileSync(reviewFile)),mediaSha256:source.sha256},
  ...(result.classification.contentLanguage==='en'?{languageReason:'已先执行中文检索；本候选实际图片经本机OCR识别为英文，保留原始内容及来源署名，不改写图片冒充中文版。'}:{})};
}
