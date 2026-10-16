import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');

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
