import {AsyncLocalStorage} from 'node:async_hooks';
import path from 'node:path';
import fs from 'node:fs';

const context=new AsyncLocalStorage();
export function contextualTalkcraftProject(root,runId){
  const value=context.getStore();
  return value?.root===path.resolve(root)&&value.runId===runId?value.project:null;
}
// A node-local transaction has the same run identity, but writes into its own
// workspace. It cannot redirect another run or use a historical run as state.
export function withTalkcraftProject(root,runId,project,operation){
  const owner=path.resolve(root,'director/b-mode-runs',runId,'talkcraft');
  const base=path.join(owner,'qa/node-repairs'),resolved=path.resolve(project),rel=path.relative(base,resolved);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel)||
    !fs.readFileSync(path.join(owner,'source-run.json')).equals(fs.readFileSync(path.join(resolved,'source-run.json'))))
    throw Error('节点补全工作区必须属于本次任务且来源身份完全一致');
  return context.run({root:path.resolve(root),runId,project:resolved},operation);
}
