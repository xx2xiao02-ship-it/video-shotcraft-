import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';

// Run the original, synchronous checks off the HTTP/stream event loop. There
// is deliberately no completed-result cache: the next request validates again.
export function createTalkcraftStatusReader(root, {moduleUrl=new URL('./talkcraft-status.mjs', import.meta.url).href}={}) {
  let worker, closed=false, sequence=0;
  const pending=new Map(), inFlight=new Map();
  function start() {
    if(worker)return worker;
    const current=new Worker(new URL(import.meta.url), {workerData:{talkcraftStatusReader:true,root,moduleUrl}});
    worker=current;
    const fail=error=>{
      if(worker!==current)return;
      worker=null;
      for(const job of pending.values())job.reject(error);
      pending.clear();inFlight.clear();
    };
    current.on('error', fail);
    current.on('exit',code=>fail(Error(`状态核验线程退出 (${code})`)));
    current.on('message',({id,result,error})=>{
      const job=pending.get(id);if(!job)return;
      pending.delete(id);inFlight.delete(job.runId);
      if(error)job.reject(Error(error));else job.resolve(result);
      if(!pending.size)current.unref();
    });
    return current;
  }
  return {
    read(runId) {
      if(closed)return Promise.reject(Error('状态核验线程已关闭'));
      if(inFlight.has(runId))return inFlight.get(runId);
      const current=start(),id=++sequence;
      current.ref();
      const promise=new Promise((resolve,reject)=>pending.set(id,{runId,resolve,reject}));
      inFlight.set(runId,promise);
      current.postMessage({id,runId});
      return promise;
    },
    async close() {
      closed=true;
      for(const job of pending.values())job.reject(Error('状态核验线程已关闭'));
      pending.clear();inFlight.clear();
      const current=worker;worker=null;
      if(current)await current.terminate();
    },
  };
}

if(!isMainThread&&workerData?.talkcraftStatusReader){
  const {readTalkcraftStatus}=await import(workerData.moduleUrl);
  parentPort.on('message',({id,runId})=>{
    try{parentPort.postMessage({id,result:readTalkcraftStatus(workerData.root,runId)});}
    catch(error){parentPort.postMessage({id,error:String(error.message||error)});}
  });
}
