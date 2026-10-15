import fs from 'node:fs';
import path from 'node:path';
export function nativeBridgeAuditPoints(project) {
 const file=path.join(project,'qa/visual-timeline-bridges.json');if(!fs.existsSync(file))return [];
 const proof=JSON.parse(fs.readFileSync(file,'utf8'));
 if(proof.schema!=='talkcraft-visual-timeline-bridges-v1'||proof.source!=='remotion/shots.json'||!Array.isArray(proof.bridges))
  throw Error('视觉停顿桥接审计缺少有效来源');
 const shots=JSON.parse(fs.readFileSync(path.join(project,'remotion/shots.json'),'utf8')),seen=new Set();
 return proof.bridges.flatMap(b=>{
  const i=shots.findIndex(s=>s.id===b.shotId),shot=shots[i],next=shots[i+1];
  const from=Math.round(b.fromSec*30),to=Math.round(b.toSec*30);
  if(!shot||!next||seen.has(b.shotId)||!Number.isInteger(from)||!Number.isInteger(to)||
    from!==Math.round(shot.end*30)||to!==Math.round(next.start*30)||to<=from)
   throw Error('视觉停顿桥接审计与正式分镜边界不一致：'+b.shotId);
  seen.add(b.shotId);
  return [...new Set([from,Math.floor((from+to-1)/2),to-1])].map(frame=>({shotId:b.shotId,frame}));
 });
}
