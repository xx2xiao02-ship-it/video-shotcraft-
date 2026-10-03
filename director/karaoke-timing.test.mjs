import test from 'node:test';
import assert from 'node:assert/strict';
import {KARAOKE_CARD,deriveKaraokeTimings} from './karaoke-timing.mjs';
import {validateGlobalPlan,validateShotPlan,buildStoryboard} from './a-mode-run.mjs';

const words=[{text:'先',start:1,end:1.2},{text:'记',start:1.3,end:1.5},{text:'录',start:1.5,end:1.8},
  {text:'再',start:2.1,end:2.3},{text:'核',start:2.4,end:2.7},{text:'对',start:2.7,end:3.1}];
const segments=[{text:'先记录，再核对。',fromFrame:30,durationInFrames:180,words}];
test('derive nonuniform shot-local word groups without inventing or dropping timing',()=>{
  assert.deepEqual(deriveKaraokeTimings(segments,['先记录','再核对'],180),[
    {text:'先记录',start:0,end:24,line:0},{text:'再核对',start:33,end:63,line:0}]);
  assert.throws(()=>deriveKaraokeTimings([{...segments[0],words:undefined}],['先记录','再核对'],180),/缺少真实/);
  assert.throws(()=>deriveKaraokeTimings(segments,['先记录'],180),/完整消费/);
  assert.throws(()=>deriveKaraokeTimings(segments,['先记录','再核对'],60),/收尾/);
  assert.throws(()=>deriveKaraokeTimings([{...segments[0],words:[...words].reverse()}],['先记录','再核对'],180),/时间戳无效/);
});
test('director uses the voice timeline and rejects model-authored word boundaries',()=>{
  const source=[{...segments[0],fromFrame:0,words:words.map(word=>({...word,start:word.start-1,end:word.end-1}))}];
  const global=validateGlobalPlan({shots:[{fromSegment:0,toSegment:1,type:'claim',card:KARAOKE_CARD,
    material:null,materialRole:'none',reason:'特殊强调旁白随读'}]},source,[],{availableCards:[KARAOKE_CARD]});
  const plan={shots:[{index:0,displayLines:['先记录','再核对'],elementPlan:'跟随真实语音',captionHighlights:['']}]};
  const details=validateShotPlan(plan,global,source);
  const result=buildStoryboard(null,'timed-test',{fps:30,totalFrames:180,segments:source},global,details,{});
  assert.deepEqual(result.shots[0].templateParams.timedWords,deriveKaraokeTimings(source,plan.shots[0].displayLines,180));
  assert.throws(()=>validateShotPlan({shots:[{...plan.shots[0],templateParams:{timedWords:[]}}]},global,source),/不能由模型编造/);
});
