import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sha256} from './validation.mjs';
import {buildCatalog as build,validateCalls as validate} from './contract.mjs';
import {checkWorkbench as check} from './workbench-check.mjs';
const base=path.dirname(fileURLToPath(import.meta.url));
export const CONTRACT_VERSION='target3-corrected-r2';
export function assertCurrentContract(){
 const lock=JSON.parse(fs.readFileSync(path.join(base,'CURRENT-CONTRACT.json')));
 assert.equal(lock.version,CONTRACT_VERSION);
 for(const item of lock.modules)assert.equal(sha256(fs.readFileSync(path.join(base,item.file))),item.sha256,'Contract changed without version update: '+item.file);
 return lock;
}
export function buildCatalog(){assertCurrentContract();return build();}
export function validateCalls(input,options){assertCurrentContract();return validate(input,options);}
export function checkWorkbench(file,options){assertCurrentContract();return check(file,options);}
