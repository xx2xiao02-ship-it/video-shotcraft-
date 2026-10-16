import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {createTalkcraftInput, splitTalkcraftSentences} from './talkcraft-input.mjs';

const workspace = path.resolve('tmp');

test('new TalkCraft input stays isolated and preserves sentence order', () => {
  mkdirSync(workspace, {recursive:true});
  const root = mkdtempSync(path.join(workspace, 'talkcraft-input-test-'));
  try {
    const avatarBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=','base64');
    const created = createTalkcraftInput(root, {text:'先收藏。再行动！',
      voiceMode:'volcengine-tts2',speakerId:'zh_male_liufei_uranus_bigtts', avatarBytes});
    assert.equal(created.sentences, 2);
    assert.deepEqual(splitTalkcraftSentences('先收藏。\n再行动！'), ['先收藏。','再行动！']);
    assert.deepEqual(JSON.parse(readFileSync(path.join(created.project, 'script.json'))).sentences,
      ['先收藏。','再行动！']);
    const sourceRun = JSON.parse(readFileSync(path.join(created.project, 'source-run.json')));
    assert.equal(sourceRun.isDigitalHuman, false);
    assert.equal(sourceRun.cardCallsRequired, true);
    assert.equal(sourceRun.digitalHumanMode, 'segments');
    assert.equal(sourceRun.visualTextLocale, 'zh-CN');
    assert.equal(sourceRun.speechRate, 0);
    const digital = createTalkcraftInput(root, {text:'启用数字人。', voiceMode:'volcengine-tts2',speakerId:'zh_male_liufei_uranus_bigtts', avatarBytes, enableDigitalHuman:true});
    const digitalSource = JSON.parse(readFileSync(path.join(digital.project, 'source-run.json')));
    assert.equal(digitalSource.isDigitalHuman, true);
    const tts2 = createTalkcraftInput(root, {text:'测试新版合成。', voiceMode:'volcengine-tts2',
      speakerId:'zh_female_vv_uranus_bigtts', speechRate:12, avatarBytes});
    const tts2Source = JSON.parse(readFileSync(path.join(tts2.project, 'source-run.json')));
    assert.equal(tts2Source.voiceMode, 'volcengine-tts2');
    assert.equal(tts2Source.speakerId, 'zh_female_vv_uranus_bigtts');
    assert.equal(tts2Source.speechRate, 12);
    const combined = createTalkcraftInput(root, {text:'合并测试。',voiceMode:'volcengine-tts2',speakerId:'zh_male_liufei_uranus_bigtts',
      generationMode:'combined',avatarBytes:[avatarBytes, avatarBytes]});
    const combinedSource = JSON.parse(readFileSync(path.join(combined.project, 'source-run.json')));
    assert.equal(combinedSource.digitalHumanMode, 'combined');
    assert.deepEqual(combinedSource.avatarFiles, ['avatar-01.png','avatar-02.png']);
    assert.throws(() => createTalkcraftInput(root, {text:'测试。',voiceMode:'volcengine-tts2',speakerId:'zh_male_liufei_uranus_bigtts',
      generationMode:'unknown',avatarBytes}), /生成方式/);
    assert.throws(() => createTalkcraftInput(root, {text:'测试。', voiceMode:'volcengine-tts2',
      speakerId:'invalid voice', avatarBytes}), /音色 ID/);
    assert.throws(() => createTalkcraftInput(root, {text:'x',voice:'unknown',avatarBytes}), /音色/);
  } finally {
    if (!root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(root, {recursive:true, force:true});
  }
});

test('new input cannot fall back to text superseded by an approved fact revision',()=>{
  mkdirSync(workspace,{recursive:true});
  const root=mkdtempSync(path.join(workspace,'talkcraft-fact-inherit-'));
  try{
    const oldText='绝大多数人都会存钱。',approvedText='一部分人可能选择储蓄。';
    const approvalProject=path.join(root,'director','b-mode-runs','11111111-1111-4111-8111-111111111111','talkcraft');
    mkdirSync(path.join(approvalProject,'qa'),{recursive:true});
    const digest=value=>createHash('sha256').update(value).digest('hex');
    writeFileSync(path.join(approvalProject,'qa','fact-approved-script.txt'),approvedText+'\n');
    writeFileSync(path.join(approvalProject,'qa','fact-script-approval.json'),JSON.stringify({
      schema:'talkcraft-fact-script-approval-v1',approved:true,
      originalScriptSha256:digest(oldText),approvedScriptSha256:digest(approvedText)
    }));
    const avatarBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=','base64');
    const created=createTalkcraftInput(root,{text:oldText,voiceMode:'volcengine-tts2',
      speakerId:'zh_male_liufei_uranus_bigtts',avatarBytes});
    assert.equal(created.factRevisionApplied,true);
    assert.equal(created.factApprovalRunId,'11111111-1111-4111-8111-111111111111');
    assert.equal(readFileSync(path.join(created.project,'input.txt'),'utf8').trim(),approvedText);
    const source=JSON.parse(readFileSync(path.join(created.project,'source-run.json'),'utf8'));
    assert.equal(source.factRevisionApplied,true);
    assert.equal(source.factApprovalRunId,'11111111-1111-4111-8111-111111111111');
    assert.equal(JSON.parse(readFileSync(path.join(created.project,'qa','fact-script-approval.json'),'utf8')).approved,true);
  }finally{
    if(!root.startsWith(workspace+path.sep))throw Error('Test cleanup escaped workspace');
    rmSync(root,{recursive:true,force:true});
  }
});
