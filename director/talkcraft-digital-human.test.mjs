import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {generateTalkcraftDigitalHuman,createTransparentDigitalHuman} from './talkcraft-digital-human.mjs';
import {readTalkcraftDigitalHumanStatus} from './talkcraft-digital-human-status.mjs';
import {approveTalkcraftStoryboard, recordPlanningResult, recordSemanticPass} from './talkcraft-status.mjs';
import {recordReviewedCandidates} from './talkcraft-reviewed-templates.mjs';

function approveFixture(root, runId, project) {
  mkdirSync(path.join(project,'qa'),{recursive:true});
  writeFileSync(path.join(project, 'semantics.json'), JSON.stringify({sentences:[{shot:'s01',weight:'main',sem:['钩子']}]}));
  writeFileSync(path.join(project, 'audio/timestamps.json'), JSON.stringify({sentences:[
    {text:'测试',start:0,end:4,ok:true,match:1,words:[{text:'测试',start:0,end:4}]}]}));
  writeFileSync(path.join(project, 'aligned-sentences.json'), '[]');
  writeFileSync(path.join(project, 'SHOTBOOK.md'), '# Test storyboard');
  writeFileSync(path.join(project, 'sources.md'), '# Test sources');
  const cards=['impact-open-title','per-character-rise','keyword-pop-highlight','chapter-title-card'];
  const shots=JSON.parse(readFileSync(path.join(project,'remotion/shots.json'))).map((shot,index)=>({...shot,shotCard:shot.shotCard||cards[index]}));
  writeFileSync(path.join(project,'remotion/shots.json'),JSON.stringify(shots));
  writeFileSync(path.join(project,'qa/card-candidates.json'),JSON.stringify(Object.fromEntries(shots.map(shot=>[shot.id,{candidates:{钩子:[{slug:shot.shotCard}]}}]))));
  writeFileSync(path.join(project,'qa/card-candidates.md'),'# candidates');
  recordReviewedCandidates(project,{skillRoot:path.resolve('_audit/video-talkcraft')});  recordSemanticPass(root, runId);
  recordPlanningResult(root, runId, {passed:true});
  approveTalkcraftStoryboard(root, runId, 'isolated test fixture');
}

test('主体保护抠图去除绿幕、保留主体原色并填补内部小孔',t=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'talkcraft-alpha-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const input=path.join(root,'green.mkv'),output=path.join(root,'alpha.webm');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',
    'color=c=0x00ff00:s=160x90:r=30:d=0.2,drawbox=x=20:y=20:w=30:h=50:color=0x182238:t=fill,drawbox=x=80:y=20:w=50:h=50:color=0xc6906e:t=fill,drawbox=x=104:y=44:w=3:h=3:color=0x00ff00:t=fill',
    '-c:v','ffv1','-pix_fmt','bgr0',input]);
  const result=createTransparentDigitalHuman(input,output);
  assert.equal(result.frames,6,'透明素材必须返回实际帧数');
  assert.equal(result.matting.method,'narrow-aa-despill-v2');
  assert.equal(result.matting.opaqueRgbSource,'original-decoded-rgb');
  const color=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0',
    '-show_entries','stream=color_space,color_range','-of','json',output],{encoding:'utf8'})).streams[0];
  assert.equal(color.color_space,'bt709');assert.equal(color.color_range,'tv');
  assert.equal(result.matting.temporalAveraging,false);
  assert.throws(()=>createTransparentDigitalHuman(input,output),/拒绝覆盖/);
  const rgba=execFileSync('ffmpeg',['-v','error','-c:v','libvpx-vp9','-i',output,
    '-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1']);
  const sourceRgb=execFileSync('ffmpeg',['-v','error','-i',input,
    '-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
  const pixel=(buffer,x,y,channels)=>[...buffer.subarray((y*160+x)*channels,(y*160+x)*channels+channels)];
  const alpha=(x,y)=>pixel(rgba,x,y,4)[3];
  assert.ok(alpha(30,40)>250,'黑衣必须保持实心');
  assert.ok(alpha(5,5)<5,'纯绿幕必须透明');
  assert.ok(alpha(105,45)>250,'主体内部小绿孔必须闭合');
  const originalTan=pixel(sourceRgb,90,40,3);
  const protectedTan=pixel(rgba,90,40,4).slice(0,3);
  assert.ok(protectedTan.every((value,index)=>Math.abs(value-originalTan[index])<=5),
    `主体核心原色必须保留：${originalTan} -> ${protectedTan}`);
});

for (const scenario of ['missing-storyboard','unapproved','changed-shot','failed-preflight','pending-adjustment']) {
  test(`RunningHub rejects ${scenario} before provider calls or output creation`, async t => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'talkcraft-admission-'));
    t.after(() => rmSync(root, {recursive:true, force:true}));
    const runId = '11111111-1111-4111-8111-111111111111';
    const project = path.join(root, 'director/b-mode-runs', runId, 'talkcraft');
    for (const folder of ['audio','remotion','qa']) mkdirSync(path.join(project,folder), {recursive:true});
    writeFileSync(path.join(project,'source-run.json'),JSON.stringify({fps:30,totalFrames:120,digitalHumanMode:'segments'}));
    if (scenario !== 'missing-storyboard') {
      writeFileSync(path.join(project,'remotion/shots.json'), JSON.stringify([{id:'s01',start:0,end:4,subject:'person'}]));
      approveFixture(root,runId,project);
      if(scenario==='unapproved') writeFileSync(path.join(project,'qa/storyboard-approved.json'),'{}');
      if(scenario==='changed-shot') writeFileSync(path.join(project,'remotion/shots.json'), JSON.stringify([{id:'s01',start:0,end:4,subject:'other'}]));
      if(scenario==='failed-preflight') recordPlanningResult(root,runId,{passed:false,issues:['test failure']});
      if(scenario==='pending-adjustment') writeFileSync(path.join(project,'qa/storyboard-adjustment-request.json'),JSON.stringify({request:'修改人物区间'}));
    }
    let calls=0;
    await assert.rejects(generateTalkcraftDigitalHuman({root,runId,provider:{create:async()=>{calls++;throw Error('must not call');}}}),
      error=>error.code==='DIGITAL_HUMAN_DEPENDENCY_NOT_READY');
    assert.equal(calls,0);
    assert.equal(existsSync(path.join(project,'digital-human-report.json')),false);
    assert.equal(existsSync(path.join(project,'remotion/public/digital-human')),false);
  });
}

for (const scenario of ['segments', 'combined','segments-recovery','segments-25fps','uncertain-submission']) {
  const mode=scenario==='combined'?'combined':'segments';
  test(`TalkCraft ${scenario} creates only marked shot clips with exact frame counts`, async t => {
    const root = mkdtempSync(path.join(os.tmpdir(), `talkcraft-${mode}-`));
    t.after(() => rmSync(root, {recursive:true, force:true}));
    const runId = '11111111-1111-4111-8111-111111111111';
    const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
    for (const folder of ['audio','assets','remotion']) mkdirSync(path.join(project, folder), {recursive:true});
    writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({runId,fps:30,totalFrames:120,
      digitalHumanMode:mode,avatarFiles:['avatar-01.png','avatar-02.png']}));
    writeFileSync(path.join(project, 'remotion', 'shots.json'), JSON.stringify([
      {id:'s01',start:0,end:1,subject:'person'}, {id:'s02',start:1,end:2,subject:'other'},
      {id:'s03',start:2,end:3,subject:'person'}, {id:'s04',start:3,end:4,subject:'person'},
    ]));
    execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','lavfi','-i',
      'sine=frequency=440:sample_rate=48000:duration=4','-c:a','libmp3lame',path.join(project,'audio','full.mp3')]);
    for (const name of ['avatar-01.png','avatar-02.png']) execFileSync('ffmpeg', [
      '-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=64x64',
      '-frames:v','1','-update','1',path.join(project,'assets',name)]);
    const mockVideo = path.join(root, 'provider.mp4');
    execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','lavfi','-i',
      `color=c=green:s=160x90:r=${scenario==='segments-25fps'?25:30}:d=4`,'-c:v','libx264','-pix_fmt','yuv420p',mockVideo]);
    let calls = 0;
    let failQuery=scenario==='segments-recovery';
    const provider = {
      create:async () => {calls++;if(scenario==='uncertain-submission')throw Error('submission outcome unknown');return {taskId:`mock-${calls}`};},
      waitForResult:async taskId => {if(failQuery){failQuery=false;throw Error('simulated local interruption');}return {taskId,outputUrl:'mock://video'};},
      download:async () => readFileSync(mockVideo),
    };
    approveFixture(root,runId,project);
    if(scenario==='uncertain-submission'){
      await assert.rejects(generateTalkcraftDigitalHuman({root,runId,provider}),/submission outcome unknown/);
      await assert.rejects(generateTalkcraftDigitalHuman({root,runId,provider,resumeExisting:true}),/提交状态不明确/);
      assert.equal(calls,1,'提交结果未知时不得重新调用供应商');return;
    }
    if(scenario==='segments-recovery'){
      await assert.rejects(generateTalkcraftDigitalHuman({root,runId,provider}),/simulated local interruption/);
      assert.equal(calls,1);
      writeFileSync(path.join(project,'remotion/public/digital-human/provider-1.mp4'),readFileSync(mockVideo));
      writeFileSync(path.join(project,'remotion/public/digital-human/unit-1.mp4'),'legacy derivative preserved');
    }
    const report = await generateTalkcraftDigitalHuman({root,runId,provider,resumeExisting:scenario==='segments-recovery'});
    assert.equal(calls, mode === 'combined' ? 1 : 2);
    assert.equal(report.status, 'SUCCESS');
    if(scenario==='segments-recovery')assert.equal(readFileSync(path.join(project,'remotion/public/digital-human/unit-1.mp4'),'utf8'),'legacy derivative preserved');
    if(scenario==='segments-25fps')assert.ok(report.units.every(u=>u.frameratePreparation.method==='optical-flow'));
    assert.deepEqual(report.units.map(unit => unit.frames), [30,60]);
    assert.equal(readTalkcraftDigitalHumanStatus(project).ready, true);
    const media = path.join(project, 'remotion', 'public', 'digital-human');
    for (const [id, frames] of [['s01',30],['s03',30],['s04',30]]) {
      const file = path.join(media, `${id}.mp4`);
      assert.equal(existsSync(file), true);
      const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-select_streams','v:0',
        '-show_entries','stream=nb_frames','-of','json',file], {encoding:'utf8'}));
      assert.equal(Number(probe.streams[0].nb_frames), frames);
    }
    assert.equal(existsSync(path.join(media, 's02.mp4')), false);
    await assert.rejects(generateTalkcraftDigitalHuman({root,runId,provider}), /拒绝重复提交/);
    assert.equal(calls, mode === 'combined' ? 1 : 2);
  });
}
