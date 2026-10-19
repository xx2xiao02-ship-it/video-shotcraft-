import test from 'node:test';import assert from 'node:assert/strict';
import {backgroundPresentation,backgroundCaptionTheme,checkPresentationSemantics} from './talkcraft-background-presentation.mjs';
import fs from 'node:fs';
import {contrastRatio,crossfadeBackground,compositeColor} from './talkcraft-color-contrast.mjs';
test('新任务转场字幕覆盖浅深背景和闪光，固定填色与必要底衬不依赖镜头编号或播放帧',()=>{
 for(const shotCard of ['black-slam-transition','particle-weld-transition','overexpose-flip-transition']){
  for(const [bgA,bgB] of [['#f7f5f0','#0a2a5a'],['#ffffff','#eeeeee'],['#010101','#171717']]){
   const shot={id:'new-task-unrelated',shotCard,templateParams:{cardProps:{bgA,bgB,flashColor:'#1a4a8a'}}},before=JSON.stringify(shot);
   const theme={text:'#1a1a1a',captionColor:'#ffffff',accentPrimary:'#1a4a8a'},result=backgroundCaptionTheme(shot,theme);
   for(let i=0;i<=100;i++){
    const a=i/100,bg=shotCard==='black-slam-transition'?(a<.5?bgA:bgB):crossfadeBackground(bgA,bgB,a);
    for(const flash of [0,shotCard==='black-slam-transition'?.34:shotCard==='overexpose-flip-transition'?.1:0]){
     const effective=result.captionBackground==='transparent'?compositeColor('#1a4a8a',bg,flash):result.captionBackground;
     assert.ok(contrastRatio(result.text,effective)>=4.5);
    }
   }
   assert.equal(JSON.stringify(shot),before);assert.equal(theme.text,'#1a1a1a');
   assert.deepEqual(backgroundCaptionTheme(shot,theme),result);
  }
 }
});
test('独立字幕实际应用选色和底衬，保持阴影且无描边',()=>{
 const runtime=fs.readFileSync(new URL('./talkcraft-keyword-caption.tsx',import.meta.url),'utf8');
 assert.match(runtime,/backgroundCaptionTheme\(shot,THEME\)/);
 assert.match(runtime,/captionTheme\(captionBackground\)/);
 assert.match(runtime,/background:captionBackground.captionBackground/);
 assert.match(runtime,/captionOutlineStyle/);assert.doesNotMatch(runtime,/WebkitTextStroke/);
});
test('照片墙原生暗幕底使用浅色独立字幕，不改变模板构图或全片主题',()=>{
 const theme={text:'#1a1a1a',accentPrimary:'#1a4a8a'};
 assert.equal(backgroundCaptionTheme({shotCard:'gallery-wall-dolly',templateParams:{}},theme).text,'#ffffff');
 assert.equal(backgroundCaptionTheme({shotCard:'rack-focus-pair',templateParams:{}},theme),theme);
 assert.equal(theme.text,'#1a1a1a');
});
import {loadTalkcraftGovernedCatalog,verifiedChapterBackgroundParameter} from './talkcraft-governed-contract.mjs';
const shot=()=>({id:'s17',shotCard:'chapter-progress-list',templateParams:{materialRole:'background',materialSrc:'broll/city.mp4',materialSourceId:'local:city',materialMatchReason:'城市生活语境',backgroundPresentation:'theme-wash-v1',cardProps:{bg:'#ffffff00',rows:'|存钱\n|消费|current\n|规划未来'}}});
test('真实背景使用公开透明底，不改变模板几何',()=>{assert.equal(backgroundPresentation(shot(),{background:'#f7f5f0'}).overlay,'#000000b8');assert.equal(checkPresentationSemantics([shot()]).passed,true);});
test('路径存在也不能让实色卡片遮住背景',()=>{const s=shot();s.templateParams.cardProps.bg='#111111';assert.equal(checkPresentationSemantics([s]).issues[0].code,'BACKGROUND_OCCLUDED');});
test('缺素材身份或匹配理由不允许冒充匹配成功',()=>{const s=shot();delete s.templateParams.materialSourceId;assert.equal(checkPresentationSemantics([s]).passed,false);});
test('装饰编号必须阻断，有文案含义的标题保留',()=>{const s=shot();s.templateParams.cardProps.rows='01|存钱\n03|规划未来';assert.equal(checkPresentationSemantics([s]).passed,false);s.templateParams.numberingReason='用户确认的三章结构';assert.equal(checkPresentationSemantics([s]).passed,true);delete s.templateParams.numberingReason;s.templateParams.cardProps={num:'结语'};delete s.templateParams.backgroundPresentation;delete s.templateParams.materialRole;assert.equal(checkPresentationSemantics([s]).passed,true);});
test('旧背景处理保持兼容，不无故改写其他镜头',()=>{assert.equal(backgroundPresentation({templateParams:{}},{}).overlay,'rgba(0,0,0,.42)');});
test('透明底和空编号仅纠正已锁定源卡能力，不豁免任意颜色或格式',()=>{
 const root=process.env.TALKCRAFT_SKILL_ROOT||'E:/video-shotcraft/_audit/video-talkcraft';
 const catalog=loadTalkcraftGovernedCatalog(JSON.parse(fs.readFileSync(root+'/references/cards-index.json'))),card=catalog.cards.find(c=>c.cardId==='chapter-progress-list'),s=shot();
 assert.equal(verifiedChapterBackgroundParameter({code:'PROP_COLOR',at:'calls[0].props.bg'},s,card),true);
 assert.equal(verifiedChapterBackgroundParameter({code:'DATA_FORMAT',at:'calls[0].props.rows'},s,card),true);
 s.templateParams.cardProps.bg='bad';assert.equal(verifiedChapterBackgroundParameter({code:'PROP_COLOR',at:'calls[0].props.bg'},s,card),false);
 s.templateParams.cardProps.rows='invalid';assert.equal(verifiedChapterBackgroundParameter({code:'DATA_FORMAT',at:'calls[0].props.rows'},s,card),false);
 assert.equal(verifiedChapterBackgroundParameter({code:'PROP_COLOR',at:'calls[0].props.bg'},shot(),{...card,implementation:{...card.implementation,sha256:'wrong'}}),false);
});
test('真实统计数值不因为是数字就被当成装饰编号',()=>{assert.equal(checkPresentationSemantics([{shotCard:'count-badge-title',templateParams:{cardProps:{num:'25'}}}]).passed,true);});

test('真实背景固定黑色压暗，浅深主题都不会洗白，字幕保持独立浅色',()=>{
 for(const background of ['#ffffff','#111111'])assert.equal(backgroundPresentation(shot(),{background}).overlay,'#000000b8');
 const theme={text:'#1a1a1a',accentPrimary:'#1a4a8a'};
 assert.equal(backgroundCaptionTheme(shot(),theme).text,'#ffffff');
 assert.equal(backgroundCaptionTheme({templateParams:{}},theme),theme);
 assert.equal(theme.text,'#1a1a1a');
});
