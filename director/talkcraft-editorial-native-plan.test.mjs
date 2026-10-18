import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeEditorialTimeline,prepareEditorialNativePlans,EDITORIAL_NATIVE_RULES} from './talkcraft-editorial-native-plan.mjs';
import {validateNativeTimeline} from './talkcraft-native-governance.mjs';

test('原卡超15%才拒绝；合法驻留完整保留动作顺序',()=>{
 assert.deepEqual(validateNativeTimeline({timeline:nativeEditorialTimeline(84,85,40,'驻留')},84,85),[]);
 assert.throws(()=>nativeEditorialTimeline(70,85,40,'驻留'),/重新选卡/);
 assert.throws(()=>nativeEditorialTimeline(150,85,84,'退场后'),/不能在退场后/);
 const timeline=nativeEditorialTimeline(150,90,59,'保持完整文字直到口播完毕');
 assert.deepEqual(validateNativeTimeline({timeline},150,90),[]);
});

test('新编导计划绑定真实切镜帧和句序，不能覆盖人工修订',t=>{
 const root=fs.mkdtempSync(path.resolve('tmp/editorial-native-plan-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'remotion'),{recursive:true});
 fs.writeFileSync(path.join(root,'source-run.json'),JSON.stringify({isDigitalHuman:false}));
 fs.writeFileSync(path.join(root,'remotion/shots.json'),JSON.stringify([{id:'s01',shotCard:'card',start:0,end:5,firstSentence:0,lastSentence:1,subject:'other'}]));
 const proposal={mobileMinTextPx:12,holdAtNativeFrame:59,holdReason:'口播期间保持主体',textFields:[{key:'text',visibility:'visible'}],
  wordEvents:[{field:'text',text:'预期',sentenceIndex:1,anchor:'预期',role:'spoken'}]};
 const result={shots:[{id:'s01',nativePresentation:proposal}]},catalog={cards:[{cardId:'card',duration:{frames:90}}]};
 assert.equal(prepareEditorialNativePlans(root,catalog,result).prepared,true);
 const events=JSON.parse(fs.readFileSync(path.join(root,'remotion/word-reveal-plan.json'))).events;
 assert.equal(events[0].sentence,'s2');assert.equal(events[0].beatId,'s01');
 const file=path.join(root,'remotion/native-presentation.json');fs.writeFileSync(file,'user edited');
 prepareEditorialNativePlans(root,catalog,result);assert.equal(fs.readFileSync(file,'utf8'),'user edited');
});

test('免费恢复仅同步确切字段别名到已有派生计划，备份留存且其他修改原子拒绝',t=>{
 const root=fs.mkdtempSync(path.resolve('tmp/editorial-native-alias-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'remotion'),{recursive:true});fs.writeFileSync(path.join(root,'source-run.json'),'{}');
 fs.writeFileSync(path.join(root,'remotion/shots.json'),JSON.stringify([{id:'s01',shotCard:'card',start:0,end:3,firstSentence:0,lastSentence:0,subject:'other'}]));
 const native={mobileMinTextPx:12,textFields:[{field:'text',visibility:'visible'}],wordEvents:[{field:'text',text:'原文',sentenceIndex:0,anchor:'原文',role:'spoken'}]};
 const result={shots:[{id:'s01',nativePresentation:native}]},catalog={cards:[{cardId:'card',duration:{frames:90}}]};
 assert.equal(prepareEditorialNativePlans(root,catalog,result).prepared,true);
 const file=path.join(root,'remotion/native-presentation.json'),before=fs.readFileSync(file);
 const wordFile=path.join(root,'remotion/word-reveal-plan.json'),wordBytes=fs.readFileSync(wordFile);
 result.shots[0].nativePresentation.textFields=[{key:'text',visibility:'visible'}];
 const changedWords=JSON.parse(wordBytes);changedWords.events[0].anchor='人工调整';fs.writeFileSync(wordFile,JSON.stringify(changedWords));
 assert.equal(prepareEditorialNativePlans(root,catalog,result,{repairDerivedFieldAliases:true}).prepared,false);
 assert.ok(fs.readFileSync(file).equals(before));fs.writeFileSync(wordFile,wordBytes);
 assert.equal(prepareEditorialNativePlans(root,catalog,result,{repairDerivedFieldAliases:true}).prepared,true);
 assert.deepEqual(JSON.parse(fs.readFileSync(file)).shots[0].textFields,[{key:'text',visibility:'visible'}]);
 assert.ok(fs.readFileSync(wordFile).equals(wordBytes));
 const backups=fs.readdirSync(path.join(root,'qa/editorial-free-replay-artifacts'));assert.equal(backups.length,1);
 assert.ok(fs.readFileSync(path.join(root,'qa/editorial-free-replay-artifacts',backups[0])).equals(before));
 const fixed=fs.readFileSync(file);assert.equal(prepareEditorialNativePlans(root,catalog,result,{repairDerivedFieldAliases:true}).prepared,true);
 assert.ok(fs.readFileSync(file).equals(fixed));
 const changed=JSON.parse(fixed);changed.shots[0].mobileMinTextPx=24;fs.writeFileSync(file,JSON.stringify(changed));
 const edited=fs.readFileSync(file);assert.equal(prepareEditorialNativePlans(root,catalog,result,{repairDerivedFieldAliases:true}).prepared,false);
 assert.ok(fs.readFileSync(file).equals(edited));
});

test('旧模型结果缺少计划时保留响应，只登记待补项',t=>{
 const root=fs.mkdtempSync(path.resolve('tmp/editorial-native-gap-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'remotion'),{recursive:true});fs.writeFileSync(path.join(root,'source-run.json'),'{}');
 fs.writeFileSync(path.join(root,'remotion/shots.json'),JSON.stringify([{id:'s01',shotCard:'card'}]));
 const result=prepareEditorialNativePlans(root,{cards:[]},{shots:[{id:'s01'}]});
 assert.equal(result.prepared,false);assert.equal(fs.existsSync(path.join(root,'remotion/word-reveal-plan.json')),false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'qa/native-editorial-plan.json'))).runtimeVerified,false);
});

test('编导明确收到实际帧容量和零基驻留约束，错误计划有可核对的数值诊断',t=>{
 assert.match(EDITORIAL_NATIVE_RULES,/holdAtNativeFrame < nativeFrames-1/);
 const root=fs.mkdtempSync(path.resolve('tmp/editorial-native-diagnostic-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'remotion'),{recursive:true});fs.writeFileSync(path.join(root,'source-run.json'),'{}');
 fs.writeFileSync(path.join(root,'remotion/shots.json'),JSON.stringify([{id:'s01',shotCard:'card',start:0,end:2}]));
 const result=prepareEditorialNativePlans(root,{cards:[{cardId:'card',duration:{frames:85}}]},
  {shots:[{id:'s01',nativePresentation:{holdAtNativeFrame:85}}]});
 assert.equal(result.prepared,false);
 const report=JSON.parse(fs.readFileSync(path.join(root,'qa/native-editorial-plan.json')));
 assert.equal(report.checks[0].durationFrames,60);assert.equal(report.checks[0].motionFits,false);
 assert.equal(report.checks[0].maxHoldFrame,83);assert.equal(report.runtimeVerified,false);
});
