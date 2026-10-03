import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateScreenCardParams} from './screen-card-contracts.mjs';

export function assertScreenCardAssets(root,id,params){
  const validated=validateScreenCardParams(id,params);
  if(!validated) return undefined;
  const publicRoot=path.resolve(root,'template/public');
  const screens=[...(validated.screens || [validated.screen]),...(validated.portraitScreens || [])];
  for(const screen of screens){
    const file=path.resolve(publicRoot,screen.src);
    if(!file.startsWith(publicRoot+path.sep)) throw new Error('Screen asset escaped public directory');
    const bytes=fs.readFileSync(file);
    if(bytes.length<24 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
      bytes.toString('ascii',12,16)!=='IHDR') throw new Error('Screen asset is not an actual PNG');
    if(bytes.readUInt32BE(16)!==screen.width || bytes.readUInt32BE(20)!==screen.height)
      throw new Error('Screen dimensions do not match actual PNG');
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==screen.sha256)
      throw new Error('Screen asset SHA differs from frozen source');
  }
  return validated;
}
