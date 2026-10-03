import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {admittedTextCards,readTextCardAdmission} from './text-card-admission.mjs';
import {bindTextCardSources,sourceHash} from './text-card-source-binding.mjs';

const root=path.resolve(import.meta.dirname,'..');
const file=path.join(root,'director/text-card-production-admission.json');
const record=readTextCardAdmission(root),before=admittedTextCards(root);
assert.ok(record&&before.length,'No current verified admissions');
const valid=new Set(before),original=fs.readFileSync(file);
const backup=path.join(root,'docs/audits/text-admission-before-scoped-sources-'+sourceHash(original).slice(0,12)+'.json');
if(fs.existsSync(backup)) assert.deepEqual(fs.readFileSync(backup),original);
else fs.writeFileSync(backup,original,{flag:'wx'});
let migrated=0;
for(const item of record.cards){
  if(!valid.has(item.id)||item.sourceBinding) continue;
  // Upgrade only evidence whose complete original source hashes still match.
  for(const [source,expected] of Object.entries(item.sourceHashes))
    assert.equal(sourceHash(fs.readFileSync(path.resolve(root,source))),expected,'Legacy source changed: '+source);
  item.sourceBinding=bindTextCardSources(root,item.id,item.sourceHashes);
  migrated++;
}
fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');
assert.deepEqual(admittedTextCards(root),before,'Admission changed during policy binding');
console.log(JSON.stringify({migrated,validVariants:before.length,backup:path.relative(root,backup).replaceAll('\\','/'),videosRendered:0}));
