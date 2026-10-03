import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {RenderInternals} from '@remotion/renderer';
import {NoReactInternals} from 'remotion/no-react';

// Match the installed renderStill wrapper, retaining one server/download cache
// across the batch. Inputs, scale, composition and PNG encoding are unchanged.
export async function cachedStillRenderer(serveUrl, remotionRoot) {
  const server=await RenderInternals.prepareServer({webpackConfigOrServeUrl:serveUrl,port:null,
    remotionRoot,offthreadVideoThreads:1,logLevel:'error',indent:false,
    offthreadVideoCacheSizeInBytes:128*1024*1024,binariesDirectory:null,forceIPv4:true,sampleRate:48000});
  const serialize=data=>NoReactInternals.serializeJSONWithSpecialTypes({staticBase:null,indent:undefined,data}).serializedString;
  return {
    render:options=>RenderInternals.internalRenderStill({
      composition:options.composition,output:options.output,frame:options.frame ?? 0,
      serializedInputPropsWithCustomSchema:serialize(options.inputProps || {}),
      serializedResolvedPropsWithCustomSchema:serialize(options.composition.props || {}),
      imageFormat:'png',jpegQuality:80,puppeteerInstance:options.puppeteerInstance || null,
      envVariables:{},overwrite:true,browserExecutable:null,onBrowserLog:null,
      chromiumOptions:{},scale:options.scale ?? 1,onDownload:null,cancelSignal:null,
      indent:false,server,serveUrl,port:null,onArtifact:null,onLog:()=>{},isProduction:null,
      timeoutInMilliseconds:Math.max(60000,options.timeoutInMilliseconds || 0),logLevel:'error',
      offthreadVideoCacheSizeInBytes:128*1024*1024,binariesDirectory:null,
      onBrowserDownload:()=>{},chromeMode:'headless-shell',offthreadVideoThreads:1,
      mediaCacheSizeInBytes:null,licenseKey:null,
    }),
    preserveDownloads:out=>{
      const records=[];
      for(const [url,downloads] of Object.entries(server.downloadMap.hasBeenDownloadedMap)){
        for(const file of Object.values(downloads || {})){
          if(!file || !fs.existsSync(file)) continue;
          const sha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
          const target=path.join(out,`frozen-media-${sha256}${path.extname(file) || '.mp4'}`);
          if(!fs.existsSync(target)) fs.copyFileSync(file,target);
          records.push({url,file:target,sha256,bytes:fs.statSync(target).size});
        }
      }
      return records;
    },
    close:()=>server.closeServer(),
  };
}
