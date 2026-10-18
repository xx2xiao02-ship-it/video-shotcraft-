import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {prepareFilmBackground,saveFilmBackground} from './talkcraft-film-background.mjs';
import {runMediaPreflight,readMediaPreflightStatus} from './talkcraft-media-preflight.mjs';
import {pythonExecutable} from './portable-runtime.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'film-prepare-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const project=path.join(root,'task');fs.mkdirSync(project);fs.writeFileSync(path.join(project,'source-run.json'),JSON.stringify({isDigitalHuman:false,fps:30}));return {root,project};}
test('背景在素材体检前落盘；工程再次消费同一快照不使体检失效，改变图片仍失效',t=>{
 const {root,project}=fixture(t),skill=path.join(root,'skill');fs.mkdirSync(path.join(skill,'scripts'),{recursive:true});
 // CLI fixture verifies ordering and cache invalidation, not a real media PASS.
 fs.writeFileSync(path.join(skill,'scripts/preflight.py'),'def check_host():\n    # A2 源片重复帧签名\n    pass\n    # A3 metadata\n    pass\nprint("fixture PASS")\n');
 runMediaPreflight(project,skill,{python:pythonExecutable(),env:{...process.env,PYTHONUTF8:'1'},backgroundRoot:root});
 const prepared=prepareFilmBackground(root,project),report=JSON.parse(fs.readFileSync(path.join(project,'qa/media-preflight-result.json')));
 assert.equal(report.inputs['remotion/public/'+prepared.src],prepared.sha256);
 assert.equal(readMediaPreflightStatus(project).mediaPreflightPassed,true);
 saveFilmBackground(root,{kind:'solid',color:'#000000'});
 assert.deepEqual(prepareFilmBackground(root,project),prepared);
 assert.equal(readMediaPreflightStatus(project).mediaPreflightPassed,true);
 fs.writeFileSync(path.join(project,'remotion/public',prepared.src),'changed');
 assert.equal(readMediaPreflightStatus(project).mediaPreflightPassed,false);
 assert.throws(()=>prepareFilmBackground(root,project),/快照缺失或已改变/);
});
test('当前任务输入改变时不串用背景准备记录；现有显式任务快照仍须真实存在',t=>{
 const {root,project}=fixture(t);prepareFilmBackground(root,project);
 fs.writeFileSync(path.join(project,'source-run.json'),JSON.stringify({isDigitalHuman:false,fps:60}));
 assert.throws(()=>prepareFilmBackground(root,project),/当前输入不一致/);
 const second=path.join(root,'second');fs.mkdirSync(second);fs.writeFileSync(path.join(second,'source-run.json'),JSON.stringify({backgroundSnapshot:{kind:'paper',src:'missing.png'}}));
 assert.throws(()=>prepareFilmBackground(root,second),/任务背景路径无效/);
});
