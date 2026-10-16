import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');

export function findApprovedFactRevision(root,sourceText){
 const originalText=String(sourceText||'').trim(),originalScriptSha256=sha(originalText);
 const runsRoot=path.join(root,'director','b-mode-runs');
 if(!originalText||!fs.existsSync(runsRoot))return null;
 const matches=[];
 for(const entry of fs.readdirSync(runsRoot,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  const project=path.join(runsRoot,entry.name,'talkcraft');
  const recordFile=path.join(project,'qa/fact-script-approval.json');
  const scriptFile=path.join(project,'qa/fact-approved-script.txt');
  if(!fs.existsSync(recordFile)||!fs.existsSync(scriptFile))continue;
  try{
   const record=JSON.parse(fs.readFileSync(recordFile,'utf8'));
   const text=fs.readFileSync(scriptFile,'utf8').trim();
   if(record.schema==='talkcraft-fact-script-approval-v1'&&record.approved===true&&
      record.originalScriptSha256===originalScriptSha256&&record.approvedScriptSha256===sha(text)){
    matches.push({text,record,approvalRunId:entry.name});
   }
  }catch{}
 }
 if(!matches.length)return null;
 const approvedHashes=new Set(matches.map(item=>item.record.approvedScriptSha256));
 if(approvedHashes.size!==1)throw Error('同一原稿存在冲突的事实校正版，请先治理批准记录');
 return matches[0];
}
export function readApprovedFactScript(project){
 const recordFile=path.join(project,'qa/fact-script-approval.json'),file=path.join(project,'qa/fact-approved-script.txt');
 const record=JSON.parse(fs.readFileSync(recordFile,'utf8')),text=fs.readFileSync(file,'utf8').trim();
 if(record.schema!=='talkcraft-fact-script-approval-v1'||record.approved!==true||sha(text)!==record.approvedScriptSha256)throw Error('事实校正版缺少当前批准记录或文案已改变');
 return {text,record};
}
export function factReviewStatus(project){
 if(!fs.existsSync(path.join(project,'qa/fact-script-approval.json')))return {required:false,passed:true,issues:[]};
 try{const {text}=readApprovedFactScript(project),current=fs.readFileSync(path.join(project,'input.txt'),'utf8').trim();
  const passed=current===text;return {required:true,passed,revisionPending:!passed,issues:passed?[]:['FACT_SCRIPT_REVISION_REQUIRED：已批准审慎文案，需在校正版中同步稿、配音与字幕；原片保留']};
 }catch(error){return {required:true,passed:false,issues:['FACT_APPROVAL_INVALID：'+error.message]};}
}
