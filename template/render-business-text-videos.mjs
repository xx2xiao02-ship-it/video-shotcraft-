import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {openBrowser,selectComposition,renderMedia} from '@remotion/renderer';
import {ffmpegPath,ffprobePath} from '../director/packaging-media.mjs';

const root=path.resolve(import.meta.dirname,'..'),batch=process.argv[2];
if(!/^card-business-text-batch\d+(?:-v\d+|-media-v\d+)?$/.test(batch || '')) throw new Error('Isolated batch required');
const out=path.join(root,'template/out',batch),reportFile=path.join(out,'acceptance.json');
const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
assert.ok(Number.isInteger(report.durationInFrames) && report.durationInFrames>0,'Invalid report duration');
assert.equal(report.fps,30,'Unsupported report fps');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex');
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const assertSources=()=>{for(const [file,sha] of Object.entries(report.sourceHashes)) assert.equal(hash(file),sha,'Source changed: '+file);};
assertSources();assert.equal(report.sourceConsistency,true);
report.sourceHashes['template/render-business-text-videos.mjs']=hash('template/render-business-text-videos.mjs');
const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title=`第${Number(batch.match(/batch(\d+)/)[1])}批：${new Set(report.cases.map(item=>item.card)).size}个变体业务验收`;
const page=()=>fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{margin:24px;font:14px/1.6 'Microsoft YaHei';background:#f4f7f8;color:#18272b}h1{font-size:24px}h2{font-size:18px}section{border-top:1px solid #cad5d7;padding:16px 0}img{height:220px;max-width:100%;object-fit:contain}video{width:320px;max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>${escape(title)}</h1><p>本批共${report.cases.length}个横竖案例，${report.cases.filter(x=>x.video).length}/${report.cases.length}条视频通过完整解码。最终准入以进度报告为准。</p>${report.cases.map(item=>`<section><h2>${escape(item.card)} · ${item.aspect}</h2><p>${escape(item.lines.join(' / '))}</p>${item.video?`<video controls preload="metadata" src="${path.basename(item.video.file)}"></video>`:''}${item.samples.map(s=>`<img src="${path.basename(s.file)}" alt="${s.frame}帧">`).join('')}<pre>${escape(item.error || '')}</pre></section>`).join('')}</html>`);
const save=()=>{fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');page();};
const browser=await openBrowser('chrome',{browserExecutable:'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'});
const config={frameConcurrency:2,offthreadVideoThreads:2,offthreadVideoCacheSizeInBytes:128*1024*1024};
const options={serveUrl:path.join(out,'bundle'),puppeteerInstance:browser,logLevel:'error',
  offthreadVideoThreads:config.offthreadVideoThreads,offthreadVideoCacheSizeInBytes:config.offthreadVideoCacheSizeInBytes};
try {
  for(const item of report.cases){
    assert.equal(item.error,undefined);
    if(item.video){assert.equal(hash(item.video.file),item.video.sha256);assert.equal(item.video.fullDecodePassed,true);continue;}
    assertSources();assert.equal(hash(item.propsFile),item.propsSha256);
    const props=JSON.parse(fs.readFileSync(path.join(root,item.propsFile),'utf8'));
    const composition=await selectComposition({...options,id:'DynamicVideo',inputProps:props});
    assert.equal(composition.props.storyboard.shots[0].shotCard,item.card);
    assert.deepEqual(composition.props.storyboard.shots[0].displayLines,item.lines);
    assert.equal(composition.durationInFrames,report.durationInFrames,'Resolved duration differs from evidence');
    assert.equal(composition.fps,report.fps,'Resolved fps differs from evidence');
    if(item.audio){
      assert.equal(hash(item.audio.file),item.audio.sha256,'Audio asset changed');
      assert.deepEqual(composition.props.storyboard.shots[0].audio,{src:item.audio.src,volume:item.audio.volume});
      assert.equal(composition.props.storyboard.shots.length,1,'Audio alignment only supports a single-shot fixture');
      assert.ok(!props.bgm && !props.storyboard.audio,'Do not replace additional audio tracks');
    }
    // A new filename preserves interrupted, unrecorded outputs from the prior run.
    let file=path.join(out,'final-'+path.basename(item.propsFile).replace('-props.json','.mp4'));
    if(fs.existsSync(file)) throw new Error('Unrecorded output already exists; preserve and inspect before retry: '+file);
    const started=Date.now();
    await renderMedia({...options,composition,inputProps:props,codec:'h264',pixelFormat:'yuv420p',
      outputLocation:file,concurrency:config.frameConcurrency});
    let audioRemux;
    if(item.audio){
      const originalFile=file,originalSha256=hash(file);
      file=originalFile.replace(/\.mp4$/,'-audio-aligned.mp4');
      // Re-encoding the resolved local track retains AAC priming metadata lost in renderer output.
      const args=['-n','-v','error','-i',originalFile,'-i',path.resolve(root,item.audio.file),
        '-map','0:v:0','-map','1:a:0','-c:v','copy','-af',`volume=${item.audio.volume}`,
        '-c:a','aac','-ar','48000','-ac','2','-t',String(report.durationInFrames/report.fps),
        '-movflags','+faststart',file];
      execFileSync(ffmpegPath(),args,{windowsHide:true});
      audioRemux={originalFile:relative(originalFile),originalSha256,source:item.audio.file,
        sourceSha256:item.audio.sha256,volume:item.audio.volume,videoStreamCopy:true,commandArgs:args};
    }
    execFileSync(ffmpegPath(),['-v','error','-i',file,'-f','null','-'],{windowsHide:true});
    const stream=JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','v:0','-show_entries',
      'stream=width,height,nb_frames,r_frame_rate','-of','json',file],{windowsHide:true,encoding:'utf8'})).streams[0];
    assert.equal(Number(stream.nb_frames),report.durationInFrames);assert.equal(stream.r_frame_rate,`${report.fps}/1`);
    assert.equal(stream.width,item.aspect==='9:16'?1080:1920);assert.equal(stream.height,item.aspect==='9:16'?1920:1080);
    const audioStreams=item.audio ? JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','a:0','-show_entries',
      'stream=codec_type,sample_rate,channels,duration','-of','json',file],{windowsHide:true,encoding:'utf8'})).streams : [];
    if(item.audio){
      assert.equal(audioStreams.length,1,'Encoded audio stream missing');
      assert.equal(audioStreams[0].codec_type,'audio');
      assert.ok(Math.abs(Number(audioStreams[0].duration)-report.durationInFrames/report.fps)<0.001,'Encoded audio duration mismatch');
    }
    assertSources();item.video={file:relative(file),sha256:hash(file),stream,fullDecodePassed:true,
      ...(item.audio ? {audioStream:audioStreams[0],audioRemux} : {}),rendererConfig:config,elapsedSeconds:(Date.now()-started)/1000};save();
    console.log(`VIDEO ${item.card} ${item.aspect}: ${item.video.elapsedSeconds}s`);
  }
}finally{save();await browser.close({silent:true});}
