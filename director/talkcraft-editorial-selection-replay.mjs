import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {recoverBoundEditorialSelectionResponse} from './talkcraft-editorial-response.mjs';
import {compileEditorialSelection,auditEditorialSelectionRequest,prepareEditorialMaterialUpdates} from './talkcraft-editorial-selection.mjs';

const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const fail=message=>Object.assign(Error(message),{code:'EDITORIAL_SELECTION_REPLAY_INVALID'});

// This operation has no provider callback, config, authorization reservation or
// directory scan. It accepts only this transaction's explicitly rejected result.
export function recompileRetainedEditorialSelection(project,{runId,aligned,catalog,personWindows}){
  const qa=path.join(project,'qa'),request=read(path.join(qa,'editorial-selection-request.json'));
  const audit=read(path.join(qa,'editorial-selection-audit.json'));
  const cache=read(path.join(qa,'ark-editorial-response.json'));
  const {editorialSelectionRejection,...base}=cache;
  const rejected=audit.passed===false&&audit.compiled===false&&
    isDeepStrictEqual(editorialSelectionRejection,audit)&&isDeepStrictEqual(base,request.baseProposal);
  const replayFile=path.join(qa,'editorial-free-selection-replay.json');
  const prior=fs.existsSync(replayFile)?read(replayFile):null;
  // A successful local compile is not production admission. Re-check its bound
  // raw response after a later strict gate rejected it, without editing cache.
  const compiled=audit.passed===true&&audit.compiled===true&&
    audit.productionAdmitted===false&&!editorialSelectionRejection&&
    audit.compiledSha256===createHash('sha256').update(JSON.stringify(cache)).digest('hex')&&
    (audit.rawResponse||!prior||prior.schema==='talkcraft-editorial-free-selection-replay-v1'&&prior.runId===runId&&
    prior.requestId===request.requestId&&prior.externalRequests===0&&prior.productionAdmitted===false);
  if(audit.requestId!==request.requestId||(!rejected&&!compiled))
    throw fail('仅能重编译本次明确拒绝且基稿一致或哈希核验一致的局部返回');
  const response=recoverBoundEditorialSelectionResponse(project,{runId,request});
  let relative=String(compiled?(audit.rawResponse||prior?.rawResponse||''):audit.rawResponse||'').replaceAll('\\','/');
  // Legacy successful compiles did not retain the parsed-file pointer. Recover
  // from this submission's hash-verified envelope only; never scan history.
  if(compiled&&!relative){
    const receipt=read(path.join(qa,'editorial-provider-receipt.json'));
    const name=String(receipt.submittedAt).replace(/[:.]/g,'-');
    if(!/^[\dTZ-]+$/u.test(name))throw fail('本次提交时间无效');
    relative=`qa/editorial-provider-responses/${name}.json`;
    const target=path.join(project,relative),bytes=JSON.stringify(response,null,2);
    if(!fs.existsSync(target))fs.writeFileSync(target,bytes,{flag:'wx'});
  }
  if(!/^qa\/editorial-provider-responses\/[\dTZ-]+\.json$/u.test(relative))throw fail('原始解析结果路径不属于本次事务');
  const rawFile=path.join(project,relative);
  if(fs.lstatSync(rawFile).isSymbolicLink())throw fail('原始解析结果不能是链接');
  if(!isDeepStrictEqual(response,read(rawFile)))throw fail('解析缓存与本次完整原始响应不一致');
  // Reconstruct the immutable contract version actually submitted. New senders
  // always include real clocks; a bound older response may still be recompiled
  // under every CURRENT content/timing gate without re-signing its anchor IDs.
  const inputs={proposal:request.baseProposal,failedChecks:request.failedChecks,aligned,catalog,personWindows,projectRoot:project,
    anchorTiming:request.windows.some(w=>w.anchorScope?.sentences.some(s=>Array.isArray(s.clock))),
    ...(request.batch?{repairBatch:{maxShots:request.batch.maxShots}}:{})};
  const outdated=auditEditorialSelectionRequest(request,inputs);
  if(outdated.length)throw fail(outdated.join('；'));
  const material=prepareEditorialMaterialUpdates(response,request);
  const report={schema:'talkcraft-editorial-free-selection-replay-v1',runId,requestId:request.requestId,
    rawResponse:relative,externalRequests:0,restored:material.restored,productionAdmitted:false};
  const file=path.join(qa,'editorial-free-selection-replay.json');
  try{
    const result=compileEditorialSelection(response,request,inputs);
    fs.writeFileSync(file,JSON.stringify({...report,passed:true,issues:[]},null,2));
    return {result,request};
  }catch(error){
    fs.writeFileSync(file,JSON.stringify({...report,passed:false,issues:error.issues||[{code:error.code||'EDITORIAL_SELECTION_REPLAY_INVALID',message:error.message}]},null,2));
    throw error;
  }
}
