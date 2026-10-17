import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {pythonExecutable,pythonEnvironment} from './portable-runtime.mjs';

// Use the unchanged upstream checker for both scopes. Sentence annotations are
// checked without consulting a later SHOTBOOK; binding checks keep the real files.
export function runTalkcraftSemanticCheck(project,skillRoot,{scope='sentences',
  python=pythonExecutable(),env=pythonEnvironment(),execute=execFileSync}={}) {
  if(!['sentences','shots'].includes(scope))throw Error('未知语义校验范围');
  const args=[path.join(skillRoot,'scripts/semantic_annotate.py'),'--project',project,'--stats'];
  if(scope==='sentences') {
    const absent=path.join(project,'qa',`semantic-scope-${randomUUID()}`);
    args.push('--shots',path.join(absent,'shots.json'),'--shotbook',path.join(absent,'SHOTBOOK.md'));
  } else if(!existsSync(path.join(project,'remotion/shots.json'))&&!existsSync(path.join(project,'SHOTBOOK.md'))) {
    throw Error('镜头归属校验缺少正式分镜，不能视为通过');
  }
  execute(python,args,{cwd:project,stdio:'inherit',env:{...env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
  return {project,status:scope==='sentences'?'semantic_check_passed':'semantic_shot_check_passed'};
}
