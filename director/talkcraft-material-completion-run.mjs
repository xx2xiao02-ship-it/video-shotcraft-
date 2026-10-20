import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {executeApprovedMaterialCompletion} from './talkcraft-material-completion.mjs';
import {runTalkcraftStage} from './talkcraft-stages.mjs';

// Keep the command entry outside either dependency: stages imports the material
// library, so importing stages from that library's own top-level await deadlocks.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const project=path.resolve(process.argv[2]);
 const catalog=loadTalkcraftGovernedCatalog(JSON.parse(fs.readFileSync(path.resolve(process.argv[3]),'utf8')));
 const result=await executeApprovedMaterialCompletion(project,catalog,{stage:runTalkcraftStage});
 console.log(JSON.stringify({planId:result.planId,applied:result.operations.length,
  unresolved:result.unresolved.map(n=>({shotId:n.shotId,field:n.field,code:n.code})),paidCalls:0,productionAdmitted:false}));
}
