import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {generateTalkcraftDigitalHuman} from './talkcraft-digital-human.mjs';
import {readTalkcraftDigitalHumanStatus} from './talkcraft-digital-human-status.mjs';

for (const mode of ['segments', 'combined']) {
  test(`TalkCraft ${mode} creates only marked shot clips with exact frame counts`, async t => {
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
      'color=c=green:s=160x90:r=30:d=4','-c:v','libx264','-pix_fmt','yuv420p',mockVideo]);
    let calls = 0;
    const provider = {
      create:async () => ({taskId:`mock-${++calls}`}),
      waitForResult:async taskId => ({taskId,outputUrl:'mock://video'}),
      download:async () => readFileSync(mockVideo),
    };
    const report = await generateTalkcraftDigitalHuman({root,runId,provider});
    assert.equal(calls, mode === 'combined' ? 1 : 2);
    assert.equal(report.status, 'SUCCESS');
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
