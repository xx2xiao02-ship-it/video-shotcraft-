import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Recover the exact pre-submission base, never turn a rejected or out-of-scope
// provider repair into an admitted storyboard. No external service is used.
export function restoreRejectedRevisionBase(project){
  const cache=path.join(project,'qa/ark-editorial-response.json');
  let result=read(cache),rejectedBytes=fs.readFileSync(cache);
  const reportFile=path.join(project,'qa/editorial-cache-recovery.json');
  if(!result.editorialSelectionRejection){
    if(!fs.existsSync(reportFile))return null;
    const saved=read(reportFile);
    if(saved.schema!=='talkcraft-editorial-cache-recovery-v1'||saved.responseSha256!==sha(cache))return null;
    const rejected=path.resolve(project,saved.rejectedCache||'.');
    const rel=path.relative(path.join(project,'qa/editorial-cache-recovery-history'),rejected);
    if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('恢复记录的归档路径无效');
    result=read(rejected);rejectedBytes=fs.readFileSync(rejected);
  }
  // Legacy rejections without immutable provider evidence stay rejected.
  if(!result.editorialSelectionRejection.rawResponse||
    !fs.existsSync(path.join(project,'qa/editorial-revision-authorization.json')))return null;
  for(const name of ['SHOTBOOK.md','remotion/shots.json'])
    if(fs.existsSync(path.join(project,name)))throw Error('已有正式分镜，禁止恢复覆盖');
  const auth=read(path.join(project,'qa/editorial-revision-authorization.json'));
  if(auth.schema!=='talkcraft-editorial-revision-authorization-v1'||!auth.startedAt||auth.maxTasks!==1)
    throw Error('缺少可核验的已消费修订授权，不能恢复旧稿');
  for(const name of ['input.txt','aligned-sentences.json','audio/full.mp3','qa/storyboard-adjustment-request.json'])
    if(!auth.inputs?.[name]||sha(path.join(project,name))!==auth.inputs[name])
      throw Error('恢复输入与本次授权不一致：'+name);
  const base=path.join(project,'qa/storyboard-revisions');
  const names=['qa/ark-editorial-response.json','qa/editorial-repair-feedback.json','semantics.json'];
  const snapshots=fs.readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()&&!d.isSymbolicLink())
    .map(d=>path.join(base,d.name)).filter(dir=>names.every(name=>{
      const f=path.join(dir,name);return fs.existsSync(f)&&auth.inputs[name]&&sha(f)===auth.inputs[name];
    }));
  if(snapshots.length!==1)throw Error('无法唯一核对本次授权的原分镜快照，停止恢复');
  const snapshot=snapshots[0],feedback=read(path.join(snapshot,'qa/editorial-repair-feedback.json'));
  const original=read(path.join(snapshot,'qa/ark-editorial-response.json'));
  if(feedback.schema!=='talkcraft-editorial-repair-feedback-v1'||!feedback.failedChecks?.length||
    feedback.responseSha256!==sha(path.join(snapshot,'qa/ark-editorial-response.json'))||
    JSON.stringify(feedback.proposal)!==JSON.stringify(original)||original.editorialSelectionRejection)
    throw Error('原分镜与失败清单不一致，停止恢复');
  const rawBase=path.join(project,'qa/editorial-provider-responses');
  const raw=path.resolve(project,result.editorialSelectionRejection.rawResponse||'.');
  const relative=path.relative(rawBase,raw);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(raw))
    throw Error('未找到本次拒绝结果的原始模型返回，停止恢复');
  const payload=read(raw),request=read(path.join(project,'qa/editorial-selection-request.json'));
  if(payload.requestId!==request.requestId||request.requestId!==result.editorialSelectionRejection.requestId)
    throw Error('模型返回与选择请求指纹不一致，停止恢复');
  const targetIds=[...new Set(feedback.failedChecks.flatMap(i=>[i.shotId,i.displayShotId]).filter(Boolean))];
  const archive=path.join(project,'qa/editorial-cache-recovery-history',
    createHash('sha256').update(rejectedBytes).digest('hex')+'.json');
  fs.mkdirSync(path.dirname(archive),{recursive:true});
  if(fs.existsSync(archive)){if(JSON.stringify(read(archive))!==JSON.stringify(result))throw Error('恢复归档发生冲突');}
  else fs.writeFileSync(archive,rejectedBytes,{flag:'wx'});
  const restored=[];
  for(const name of ['SHOTBOOK.md','remotion/shots.json','material-research-plan.json','material-binding-plan.json']){
    const file=path.join(snapshot,name),target=path.join(project,name);
    if(!fs.existsSync(file))continue;
    if(!auth.inputs[name]||sha(file)!==auth.inputs[name])throw Error('本轮原产物指纹失效：'+name);
    if(fs.existsSync(target)&&sha(target)!==sha(file))throw Error('当前产物已变化，禁止恢复覆盖：'+name);
    restored.push(name);
  }
  const report={schema:'talkcraft-editorial-cache-recovery-v1',recoveredBase:true,
    snapshot:path.relative(project,snapshot),responseSha256:sha(path.join(snapshot,'qa/ark-editorial-response.json')),
    rejectedCache:path.relative(project,archive),rawResponse:path.relative(project,raw),
    expectedShotIds:targetIds,returnedShotIds:(payload.repairs||[]).map(r=>r.shotId),
    unexpectedFields:Object.keys(payload).filter(k=>!['schema','requestId','repairs','materialResearchUpdates'].includes(k)),
    restoredArtifacts:restored,paidCalls:0,productionAdmitted:false,userAcceptance:false};
  for(const name of restored){const target=path.join(project,name);fs.mkdirSync(path.dirname(target),{recursive:true});
    if(!fs.existsSync(target))fs.copyFileSync(path.join(snapshot,name),target,fs.constants.COPYFILE_EXCL);}
  fs.writeFileSync(cache,fs.readFileSync(path.join(snapshot,'qa/ark-editorial-response.json')));
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
  return report;
}
