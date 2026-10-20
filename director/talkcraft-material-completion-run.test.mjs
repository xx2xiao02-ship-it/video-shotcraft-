import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('正式素材命令完整加载工作流后校验审批，不因循环依赖退出或执行无批准绑定',t=>{
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'material-command-'));
 t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 fs.mkdirSync(path.join(p,'qa'));fs.writeFileSync(path.join(p,'qa/correction-center.json'),JSON.stringify({approved:false}));
 const result=spawnSync(process.execPath,['director/talkcraft-material-completion-run.mjs',p,'_audit/video-talkcraft/references/cards-index.json'],
  {encoding:'utf8',timeout:30000});
 assert.ifError(result.error);assert.equal(result.status,1);
 assert.doesNotMatch(result.stderr,/unsettled top-level await/u);
 assert.match(result.stderr,/素材补全没有当前中心终审方案/u);
 assert.equal(fs.existsSync(path.join(p,'qa/node-repair.json')),false);
 assert.equal(fs.existsSync(path.join(p,'qa/material-completion.json')),false);
});
