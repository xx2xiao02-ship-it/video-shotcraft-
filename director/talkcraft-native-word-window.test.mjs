import test from 'node:test';
import assert from 'node:assert/strict';
import {checkNativeWordWindows} from './talkcraft-native-word-window.mjs';
const shots=[{id:'s09',shotCard:'error-retype',templateParams:{cardProps:{first:'调整利率',second:'只是一半工作'}}}];
const presentation={shots:[{shotId:'s09',startFrame:0,endFrame:237,nativeFrames:177,timeline:[
  {kind:'motion',fromFrame:0,toFrame:70,nativeFromFrame:0,nativeToFrame:70},
  {kind:'hold',fromFrame:71,toFrame:130,nativeFromFrame:70,nativeToFrame:70},
  {kind:'motion',fromFrame:131,toFrame:236,nativeFromFrame:71,nativeToFrame:176}]}]};
const event=(field,localFrame)=>({id:field,beatId:'s09',field,text:field,role:'spoken',localFrame});
test('原卡第一句在真实口播落点前已被删除时，审核前报告具体事件',()=>{
 const report=checkNativeWordWindows(shots,presentation,{events:[event('first',159),event('second',191)]});
 assert.equal(report.passed,false);assert.ok(report.issues.length>=1);assert.equal(report.issues[0].field,'first');
 assert.equal(report.issues[0].nativeFrame,102);
});
test('完整原卡动作在对应发声点仍可见才准入',()=>{
 assert.equal(checkNativeWordWindows(shots,presentation,{events:[event('first',30),event('second',191)]}).passed,true);
});
test('上下文和延期文字不伪装成必须在本拍发声的事件',()=>{
 assert.equal(checkNativeWordWindows(shots,presentation,{events:[{...event('first',0),role:'context'},
  {...event('first',159),deferredTo:'s10'}]}).passed,true);
});
