import {textEffectContract,checkTextEffectDependencies} from './talkcraft-text-effect-dependencies.mjs';
import {validateNativeTimeline} from './talkcraft-native-governance.mjs';
// Propose a deterministic full-native, 1x schedule. This never selects cards,
// changes words or applies a proposal; editorial review still owns those actions.
export function proposeDependencyTimeline(shot,row,reveals,{holdAt,reason}={}){
 const c=textEffectContract(shot.shotCard,shot.templateParams?.cardProps||{},row.nativeFrames);
 if(!c)throw Error('正式选卡尚未审计时序契约');
 // Use the validator's resolved target set. A whole field may contain several
 // sentence events; choosing its first event here disagreed with the validator
 // and could put emphasis before the final words were ready.
 const reference={...row,endFrame:row.startFrame+row.nativeFrames,timeline:[{kind:'motion',fromFrame:0,toFrame:row.nativeFrames-1,nativeFromFrame:0,nativeToFrame:row.nativeFrames-1,playbackRate:1}]};
 const constraints=checkTextEffectDependencies([shot],{shots:[reference]},reveals).checks[0].constraints
  .map(({nativeFrame,notBeforeFrame})=>({nativeFrame,notBefore:notBeforeFrame}));
 const holds=new Map();let delay=0;
 for(const x of constraints.sort((a,b)=>a.nativeFrame-b.nativeFrame)){
  if(x.nativeFrame<1)throw Error('原卡起始帧无法承接该真实锚点，须重选');
  const need=Math.max(0,x.notBefore-x.nativeFrame-delay);
  if(need){holds.set(x.nativeFrame-1,(holds.get(x.nativeFrame-1)||0)+need);delay+=need;}
 }
 const duration=row.endFrame-row.startFrame,extra=duration-row.nativeFrames-delay;
 if(extra<0)throw Error('完整原卡与真实锚点不能容纳于当前镜头：需要至少'+(row.nativeFrames+delay)+'帧，现有'+duration+'帧；须重选/拆分，不自动越过15%速度边界');
 if(extra){if(!Number.isInteger(holdAt)||holdAt<0||holdAt>=row.nativeFrames-1||!reason)throw Error('需提供主体可见驻留点及源码依据');holds.set(holdAt,(holds.get(holdAt)||0)+extra);}
 const timeline=[];let native=0,output=0;
 const motion=to=>{if(to<native)return;timeline.push({kind:'motion',fromFrame:output,toFrame:output+to-native,nativeFromFrame:native,nativeToFrame:to,playbackRate:1});output+=to-native+1;native=to+1;};
 for(const [at,count] of [...holds].sort((a,b)=>a[0]-b[0])){motion(at);timeline.push({kind:'hold',fromFrame:output,toFrame:output+count-1,nativeFromFrame:at,nativeToFrame:at,reason:reason||'对应字级锚点之前保持原卡当前内容，不提前播放强调'});output+=count;}
 motion(row.nativeFrames-1);
 const next={...row,timeline};const structural=validateNativeTimeline(next,duration,row.nativeFrames);
 if(structural.length)throw Error(structural.join('\n'));
 const report=checkTextEffectDependencies([shot],{shots:[next]},reveals);
 if(!report.passed){const error=Error('提议未通过原时序契约，须编导重排');error.issues=report.issues;throw error;}
 return next;
}
