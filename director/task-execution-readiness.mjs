import {spawn} from 'node:child_process';

// 验证服务自身能否启动异步任务；同步探针不能代表实际任务启动能力。
export function probeTaskExecution({executable = process.execPath, cwd = process.cwd(), timeoutMs = 5000, spawnProcess = spawn} = {}) {
  return new Promise(resolve => {
    let child, timer, output = '', settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({...result, checkedAt:new Date().toISOString()});
    };
    const fail = error => finish({ok:false, code:error.code || 'TASK_EXECUTION_UNAVAILABLE',
      error:`操作台无法启动任务子进程（${error.code || 'unknown'}）。请通过正常 Windows 启动器重新启动操作台；已有素材已保留。`});
    try {
      child = spawnProcess(executable, ['-e', 'process.stdout.write("shotcraft-child-ready")'],
        {cwd, shell:false, windowsHide:true, stdio:['ignore','pipe','pipe']});
      child.on('error', fail);
      child.stdout.on('data', data => { output += data.toString(); });
      child.on('close', exitCode => {
        if (exitCode === 0 && output === 'shotcraft-child-ready') finish({ok:true, code:null});
        else fail({code:`CHILD_EXIT_${exitCode}`});
      });
      timer = setTimeout(() => {
        fail({code:'CHILD_START_TIMEOUT'});
        child.kill();
      }, timeoutMs);
    } catch (error) { fail(error); }
  });
}
