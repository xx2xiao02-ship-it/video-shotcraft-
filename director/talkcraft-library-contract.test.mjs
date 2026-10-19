import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {recordLibraryRightsConfirmation} from './talkcraft-library-rights.mjs';
import {normalizeLibraryIndex,loadLibraryContract,resolveLibrarySource,traceLegacyLibrarySource,libraryContractSnapshot} from './talkcraft-library-contract.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-library-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const write=(name,value)=>{fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),typeof value==='string'?value:JSON.stringify(value));};
 const item={path:'bank/saving-Scene-001.mp4',tags:['银行','存款'],duration_sec:5};
 write('materials/_scenes/'+item.path,'actual bytes');write('materials/_index.json',[item]);
 const probeMedia=file=>({kind:'video',durationSeconds:5,sha256:hash(fs.readFileSync(file))});
 const rights={path:item.path,sha256:hash('actual bytes'),sourceUrl:'https://stock.example/item/1',license:'Purchased editorial footage',
  licenseUrl:'https://stock.example/terms',licenseVerified:true,evidence:[{path:'rights/receipt.txt',sha256:hash('verified usage grant fixture')} ]};
 write('materials/rights/receipt.txt','verified usage grant fixture');
 const record=()=>write('materials/_source-records.json',{schema:'talkcraft-library-sources-v1',records:[rights]});
 return {root,item,write,probeMedia,rights,record};
}
test('兼容旧数组、带items的列表和按文件名索引，保留原字段且不生成授权',()=>{
 for(const input of [[{path:'a\\b.mp4',tags:['银行'],source:'user_upload'}],{items:[{path:'a\\b.mp4',source:'user_upload'}]}, {'a\\b.mp4':{source:'user_upload'}}]){
  const [item]=normalizeLibraryIndex(input);assert.equal(item.path,'a/b.mp4');assert.equal(item.source,'user_upload');
  assert.equal(item.licenseVerified,undefined);assert.equal(item.sha256,undefined);
 }
});
test('旧库可读不等于授权，来源提示和原件候选不会被标为已核验派生',t=>{
 const f=fixture(t),original=path.join(f.root,'original');
 f.write('original/bank/saving.mp4','original bytes');f.write('original/bank/NOTICE.txt','版权提示不是使用许可');
 f.write('director/scripts/batch-scene-split.py',`INPUT_ROOT = r"${original}"\n`);
 const before=fs.readFileSync(path.join(f.root,'materials/_index.json'),'utf8');
 const result=resolveLibrarySource(loadLibraryContract(f.root),f.item,{probeMedia:f.probeMedia});
 assert.equal(result.accepted,false);assert.equal(result.code,'LOCAL_RIGHTS_UNVERIFIED');
 assert.equal(result.trace.originalCandidates.length,1);assert.equal(result.trace.notices.length,1);
 assert.equal(result.trace.derivationVerified,false);assert.equal(result.trace.licenseVerified,false);
 assert.equal(fs.readFileSync(path.join(f.root,'materials/_index.json'),'utf8'),before);
});
test('读取与旧素材路径、当前哈希绑定的许可档案，无需重连或覆盖旧索引',t=>{
 const f=fixture(t),before=libraryContractSnapshot(f.root);f.record();
 const contract=loadLibraryContract(f.root),result=resolveLibrarySource(contract,f.item,{probeMedia:f.probeMedia});
 assert.equal(result.accepted,true);assert.equal(result.rights.license,f.rights.license);assert.equal(result.evidence.length,1);
 assert.equal(before['_index.json'],libraryContractSnapshot(f.root)['_index.json']);
 assert.notEqual(before['_source-records.json'],libraryContractSnapshot(f.root)['_source-records.json']);
});
test('许可仍存旧索引时兼容原字段，不擅自要求重新录入相同证明',t=>{
 const f=fixture(t);f.write('materials/_index.json',[{...f.item,...f.rights}]);
 const c=loadLibraryContract(f.root);assert.equal(resolveLibrarySource(c,c.items[0],{probeMedia:f.probeMedia}).accepted,true);
});
test('拒绝重复来源、文件变化、证据变化、证据越界和新旧声明冲突',t=>{
 const f=fixture(t);
 for(const mutate of [()=>f.rights.sha256='0'.repeat(64),()=>f.rights.evidence[0].sha256='0'.repeat(64),
  ()=>f.rights.evidence[0].path='../outside.txt',()=>f.rights.evidence=[]]){
  const old=structuredClone(f.rights);mutate();f.record();
  assert.throws(()=>resolveLibrarySource(loadLibraryContract(f.root),f.item,{probeMedia:f.probeMedia}));Object.assign(f.rights,old);
 }
 f.record();f.write('materials/_source-records.json',{schema:'talkcraft-library-sources-v1',records:[f.rights,f.rights]});
 assert.throws(()=>resolveLibrarySource(loadLibraryContract(f.root),f.item,{probeMedia:f.probeMedia}),/多条来源/);
 f.record();assert.throws(()=>resolveLibrarySource(loadLibraryContract(f.root),{...f.item,sourceUrl:'https://different.example'},{probeMedia:f.probeMedia}),/声明冲突/);
 f.write('materials/_scenes/'+f.item.path,'changed');
 assert.throws(()=>resolveLibrarySource(loadLibraryContract(f.root),f.item,{probeMedia:f.probeMedia}),/哈希冲突/);
});
test('拒绝库路径越界；未登记历史导入根时不生成来源提示',t=>{
 const f=fixture(t);assert.throws(()=>resolveLibrarySource(loadLibraryContract(f.root),{...f.item,path:'../outside.mp4'},{probeMedia:f.probeMedia}));
 assert.deepEqual(traceLegacyLibrarySource(f.root,f.item).notices,[]);
});


test('用户确认作为独立使用依据，精确绑定本文件；不能伪称平台许可或扩大范围',t=>{
 const f=fixture(t),options={paths:[f.item.path],statement:'版权的事不用管 已经解决了',runId:'current',requestId:'explicit-user-reply'};
 const result=recordLibraryRightsConfirmation(f.root,options);assert.equal(result.registered,1);
 const c=loadLibraryContract(f.root),resolved=resolveLibrarySource(c,f.item,{probeMedia:f.probeMedia});
 assert.equal(resolved.accepted,true);assert.equal(resolved.rights.rightsBasis,'user-confirmed-existing-library');
 assert.equal(resolved.rights.licenseUrl,undefined);assert.equal(resolved.rights.sourceKind,'existing-user-library');
 assert.equal(recordLibraryRightsConfirmation(f.root,options).registered,1); // repeated action does not duplicate records
 assert.equal(loadLibraryContract(f.root).records.length,1);
 assert.throws(()=>recordLibraryRightsConfirmation(f.root,{...options,paths:['not-approved.mp4']}),/未登记/);
 const evidence=JSON.parse(fs.readFileSync(result.evidenceFile,'utf8'));evidence.files=[];f.write('materials/'+c.records[0].evidence[0].path,evidence);
 assert.throws(()=>resolveLibrarySource(loadLibraryContract(f.root),f.item,{probeMedia:f.probeMedia}),/哈希冲突/);
});
