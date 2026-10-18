import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {compileCaptionEmphasis,validateCaptionAnnotations} from './talkcraft-caption-emphasis.mjs';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
export function saveEditorialCaptionEmphasis(project,result){
 const file=path.join(project,'remotion/caption-emphasis-plan.json');
 // The render path consumes this independently edited plan. Validate the same
 // plan here; a stale provider draft must neither block nor overwrite it.
 const preservedExisting=fs.existsSync(file);
 const plan=preservedExisting?read(file):result?.captionEmphasis;
 if(!plan)return {prepared:false,reason:'缺少独立逐句字幕重点；旧模型响应保留，渲染前需补齐，不额外调用模型'};
 const issues=validateCaptionAnnotations(plan,result.sentences||[]);
 if(issues.length)throw Error('CAPTION_ANNOTATIONS_INVALID：'+issues.join('；'));
 fs.mkdirSync(path.dirname(file),{recursive:true});
 if(!preservedExisting)fs.writeFileSync(file,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 return {prepared:true,preservedExisting,source:preservedExisting?'saved-independent-plan':'editorial-response',planSha256:sha(file)};
}
export function installCaptionEmphasis(project,{required=false,write=true}={}){
 const base=path.join(project,'remotion'),planFile=path.join(base,'caption-emphasis-plan.json'),timingFile=path.join(base,'timing.json');
 if(!fs.existsSync(timingFile))return {enabled:false};
 fs.mkdirSync(path.join(project,'qa'),{recursive:true});
 if(!fs.existsSync(planFile)){
  const report={passed:false,issues:['缺少独立逐句字幕重点清单；禁止使用镜头keyword充当字幕标注'],userAcceptance:false};
  fs.writeFileSync(path.join(project,'qa/caption-emphasis-coverage.json'),JSON.stringify(report,null,2)+'\n');
  if(required)throw Error('CAPTION_EMPHASIS_REQUIRED：'+report.issues[0]);
  if(write)fs.writeFileSync(path.join(base,'caption-emphasis.json'),JSON.stringify({events:[],passed:false})+'\n');return report;
 }
 const result=compileCaptionEmphasis(read(planFile),read(timingFile));
 result.binding={plan:sha(planFile),timing:sha(timingFile)};
 fs.writeFileSync(path.join(project,'qa/caption-emphasis-coverage.json'),JSON.stringify(result,null,2)+'\n');
 if(!result.passed)throw Error('CAPTION_EMPHASIS_FAILED：'+result.issues.join('；'));
 if(write)fs.writeFileSync(path.join(base,'caption-emphasis.json'),JSON.stringify(result,null,2)+'\n');return result;
}
export function assertCaptionEmphasis(project){
 const file=path.join(project,'remotion/caption-emphasis.json'),saved=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
 const current=installCaptionEmphasis(project,{required:true,write:false});
 if(saved!==JSON.stringify(current,null,2)+'\n')throw Error('CAPTION_EMPHASIS_STALE：独立字幕标注或原时间轴变化，请重新编译后渲染');
 return current;
}
