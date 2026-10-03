import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validateTextCardLines,assertTextCardDuration} from './text-card-contracts.mjs';
import {validateGlobalPlan,validateShotPlan,buildStoryboard} from './a-mode-run.mjs';
import {SCREEN_CARD_IDS} from './screen-card-contracts.mjs';
import {assertScreenCardAssets} from './screen-card-assets.mjs';

const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
const root=path.resolve(import.meta.dirname,'..');
test('cycle mechanism consumes all six labels and requires the full 257-frame timeline',()=>{
  const id='data/cycle-glass-node-morph',lines=['收入变化','家庭收支','复盘循环','记录','核对','调整'];
  assert.doesNotThrow(()=>assertTextCardDuration(id,257));
  for(const frames of [60,180,256,258]) assert.throws(()=>assertTextCardDuration(id,frames),/257帧/);
  assert.throws(()=>assertTextCardDuration('typography/blur-slide',257),/180帧/);
  const segments=[{text:'家庭收支先记录再核对最后调整，形成复盘循环。',fromFrame:0,durationInFrames:257}];
  const globals=validateGlobalPlan({shots:[{fromSegment:0,toSegment:1,type:'claim',card:id,material:null,
    materialRole:'none',reason:'特殊强调机制解释'}]},segments,[],{availableCards:[id]});
  const details=validateShotPlan({shots:[{index:0,displayLines:lines,elementPlan:'逐项解释循环',captionHighlights:['']}]},globals,segments);
  const sb=buildStoryboard(null,'cycle-unit',{fps:30,totalFrames:257,segments},globals,details,{});
  assert.equal(sb.shots[0].durationInFrames,257);assert.deepEqual(sb.shots[0].displayLines,lines);
});
const fixtures=[...read('../template/fixtures/card-business-text-batch004.json').cards,...read('../template/fixtures/card-business-text-batch005.json').cards,...read('../template/fixtures/card-business-text-batch006.json').cards,...read('../template/fixtures/card-business-text-batch007.json').cards,...read('../template/fixtures/card-business-text-batch008.json').cards];
fixtures.push(...read('../template/fixtures/card-business-text-batch009.json').cards);
fixtures.push(...read('../template/fixtures/card-business-text-batch010.json').cards);
fixtures.push(...read('../template/fixtures/card-business-text-batch011-v5.json').cards);
fixtures.push(...read('../template/fixtures/card-business-text-batch012.json').cards);
fixtures.push(...read('../template/fixtures/card-business-text-batch012-v5.json').cards);
test('all baseline and next-batch business inputs survive actual director consumption',()=>{
  for(const input of fixtures){
    const segments=[{text:'面对变化，'+input.narration+'这样才能保留应对风险的余地。',fromFrame:0,durationInFrames:180}];
    const globals=validateGlobalPlan({shots:[{fromSegment:0,toSegment:1,type:'claim',card:input.id,material:null,materialRole:'none',reason:'特殊强调免背景，保留观点阅读空间'}]},segments,[],{availableCards:fixtures.map(x=>x.id)});
    const details=validateShotPlan({shots:[{index:0,displayLines:input.lines,elementPlan:'逐项保留业务文字',captionHighlights:['']}]},globals,segments);
    const sb=buildStoryboard(null,'unit-test',{fps:30,totalFrames:180,segments},globals,details,{});
    assert.equal(sb.shots[0].shotCard,input.id);assert.deepEqual(sb.shots[0].displayLines,input.lines);
  }
});
test('reject lost lines, over-capacity input and unsupported long duration',()=>{
  const id='typography/type-assembly-moves/split-text-stagger';
  assert.throws(()=>validateTextCardLines(id,['第一行','不能丢掉的第二行']),/禁止裁字或丢行/);
  assert.throws(()=>validateTextCardLines(id,['这是一段超过十二字容量的业务标题']),/容量/);
  assert.throws(()=>validateTextCardLines(id,['第一行\n第二行']),/容量/);
  assert.throws(()=>assertTextCardDuration(id,90),/180帧/);
  assert.doesNotThrow(()=>assertTextCardDuration(id,180));
});
test('fly-through density cannot silently degrade into a three-word demo',()=>{
  assert.throws(()=>validateTextCardLines('typography/flying-words',['现金','收入','支出']),/8至12/);
  assert.doesNotThrow(()=>validateTextCardLines('typography/flying-words',['储备 收入 支出','预算 现金 负债','风险 投资 退路']));
});
test('retype, capsule grammar and countdown preserve all required business slots',()=>{
  assert.throws(()=>validateTextCardLines('typography/typewriter-moves/typewriter-error-retype',['只有旧句']),/容量/);
  assert.throws(()=>validateTextCardLines('typography/pill-slot-cycle',['句首','只给一词','句尾']),/容量/);
  assert.throws(()=>validateTextCardLines('typography/countdown-arc-scatter',['abc','分钟','复盘']),/整数/);
  assert.throws(()=>validateTextCardLines('typography/countdown-arc-scatter',['3','分钟数','完整复盘']),/容量/);
});
test('six-slot grammar is scoped to its registered card and cannot expand unrelated cards',()=>{
  const input=fixtures.find(x=>x.id==='typography/pill-slot-cycle');
  const globals=[{card:input.id,fromSegment:0,toSegment:1}];
  const detail={shots:[{index:0,displayLines:input.lines,elementPlan:'固定句干与轮换槽',captionHighlights:['']}]};
  const segments=[{text:'核对收支后再作决定。',durationInFrames:180}];
  assert.doesNotThrow(()=>validateShotPlan(detail,globals,segments));
  assert.throws(()=>validateShotPlan(detail,[{...globals[0],card:'typography/blur-slide'}],segments),/排版无效/);
  assert.throws(()=>validateTextCardLines(input.id,[...input.lines,'不能额外增加']),/容量/);
});

test('batch 013 screen cards consume frozen media, exact business text and long duration through director contracts',()=>{
  const fixture=read('../template/fixtures/card-business-text-batch013-media-v2.json');
  assert.equal(fixture.fps,30);assert.equal(fixture.durationInFrames,180);
  assert.deepEqual(fixture.aspects,['16:9','9:16']);
  assert.deepEqual([...SCREEN_CARD_IDS].sort(),fixture.cards.map(item=>item.id).sort());
  for(const input of fixture.cards){
    assert.doesNotThrow(()=>validateTextCardLines(input.id,input.lines));
    assert.doesNotThrow(()=>assertTextCardDuration(input.id,fixture.durationInFrames));
    const params=assertScreenCardAssets(root,input.id,input.templateParams);
    assert.deepEqual(params,input.templateParams);
    const segments=[{text:'这是实际界面信息，逐项核对并保留原有操作关系。',fromFrame:0,durationInFrames:fixture.durationInFrames}];
    const globals=validateGlobalPlan({shots:[{fromSegment:0,toSegment:1,type:'claim',card:input.id,material:null,
      materialRole:'none',reason:'特殊强调免背景：真实业务截图就是本镜主体素材'}]},segments,[],
    {requireBackground:true,availableCards:fixture.cards.map(item=>item.id)});
    const details=validateShotPlan({shots:[{index:0,displayLines:input.lines,elementPlan:'真实业务截图承载实际界面，文字参数交由原组件消费',
      captionHighlights:[''],templateParams:input.templateParams}]},globals,segments);
    const storyboard=buildStoryboard(root,'screen-business-contract-test',{fps:30,totalFrames:180,segments},globals,details,{});
    assert.equal(storyboard.shots[0].shotCard,input.id);
    assert.deepEqual(storyboard.shots[0].displayLines,input.lines);
    assert.deepEqual(storyboard.shots[0].templateParams,params);
    assert.equal(storyboard.shots[0].material,undefined);
    assert.equal(storyboard.shots[0].materialRole,'none');
    const shortSegments=[{...segments[0],durationInFrames:90}];
    assert.throws(()=>validateGlobalPlan({shots:[{fromSegment:0,toSegment:1,type:'claim',card:input.id,material:null,
      materialRole:'none',reason:'特殊强调免背景：真实业务截图就是本镜主体素材'}]},shortSegments,[],
    {requireBackground:true,availableCards:fixture.cards.map(item=>item.id)}),/180帧/);
  }
});
