import fs from 'node:fs';
import {createHash} from 'node:crypto';

export const VISUAL_CONTENT_RULES='正式选卡必须表达本镜内容，固定灰条、演示截图、演示柱形图不算真实素材或图解。存在不可替换的演示主体时重新选卡，不补虚构数据。前三镜可保留简洁文字；其余解释段文字主导镜头按镜数和时长均不得超过一半。文字转场、下三分之一姓名条、装饰划线及给文字铺视频不算图形表达。优先关系、流程、结构图或有来源的真实资料模板；素材先复用本任务与已授权本地库。字号和文本按原卡单行容量核验，不裁字、缩卡或更改真实字级时间。人物轨道必须与标题/资料主体区域分离；无法兼容则重选模板。';

// These are source-backed defects, not a competing template whitelist. The
// original audited catalog remains complete and available for comparison.
export function visualContentContract(card){
 const id=card?.cardId||card?.slug;
 const contract={version:'visual-content-v1',cardId:id,placeholder:false,singleLine:null};
 if(!card?.implementation?.file)return card?.capabilities?.visualContent||contract;
 const bytes=fs.readFileSync(card.implementation.file);
 if(createHash('sha256').update(bytes).digest('hex')!==card.implementation.sha256)throw Error(`${id} 展示容量契约源码指纹不一致`);
 const source=bytes.toString();
 if(id==='color-slam-beat-card'){
  if(!source.includes('shot-bars')||!source.includes('Shot1')||!source.includes('Shot2'))throw Error('纯色节拍卡演示区域契约已变化，须重新审计');
  contract.placeholder=true;
  contract.reason='原卡Shot1灰条及Shot2固定柱高为不可替换演示主体，没有真实图片或视频输入槽';
  contract.hostConflict='独立居中人物覆盖原卡左标题及右素材区域';
 }
 if(['soft-blur-in','tracking-in'].includes(id)){
  if(!/whiteSpace:\s*["']nowrap["']/u.test(source)||!source.includes('fontSize'))throw Error(`${id} 单行容量源码契约已变化`);
  contract.singleLine={field:'text',fontField:'fontSize',width:960,safeWidth:864,
   minCjkAdvanceEm:id==='soft-blur-in'?.9:1,allowsNewline:false};
 }
 return {...contract,implementationSha256:card.implementation.sha256};
}

export function auditVisualContent(shots,{catalog}){
 const issues=[],rows=[];
 for(const shot of shots||[]){
  const card=catalog.cards.find(c=>c.cardId===shot.shotCard);if(!card)continue;
  const contract=visualContentContract(card),props=shot.templateParams?.cardProps||{};
  rows.push({shotId:shot.id,cardId:shot.shotCard,contract});
  if(contract.placeholder)issues.push({shotId:shot.id,code:'DEMO_VISUAL_NOT_REPLACEABLE',message:contract.reason});
  if(shot.subject==='person'&&contract.hostConflict)issues.push({shotId:shot.id,code:'HOST_CONTENT_REGION_CONFLICT',message:contract.hostConflict});
  const slot=contract.singleLine;if(!slot)continue;
  const text=String(props[slot.field]??''),font=props[slot.fontField]??card.fields.find(f=>f.key===slot.fontField)?.default;
  // A lower bound proves impossibility; it is not a substitute for rendered
  // font measurement. Exclude Latin/punctuation rather than invent widths.
  const fullWidth=[...text].filter(c=>/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c)).length;
  const minimumWidth=fullWidth*font*slot.minCjkAdvanceEm;
  if(/[\r\n]/u.test(text)||minimumWidth>slot.safeWidth)issues.push({shotId:shot.id,field:slot.field,code:'TEXT_LAYOUT_CAPACITY',
   minimumWidth,safeWidth:slot.safeWidth,fontSize:font,message:`${shot.id} 单行文字最小宽度${minimumWidth.toFixed(1)}超过原卡安全宽${slot.safeWidth}；必须拆展示或重选卡，不得裁切或静默改字号`});
 }
 return {passed:!issues.length,issues,rows};
}

const textCategories=new Set(['字幕花字','强调标注','转场结构']);
const structured=new Set(['step-timeline-vertical','numbered-step-stack','source-converge','map-route-pin','chip-grid-single-select','chapter-progress-list','parallel-items-with-host','chat-message-flow','ui-flow-theater']);
export function graphicCandidateIds(index){
 return index.cards.filter(c=>structured.has(c.slug)||c.category==='素材呈现'||c.category==='数据信息图'&&!isTextDominant({shotCard:c.slug},index)).map(c=>c.slug);
}
export function isTextDominant(shot,index){
 if(structured.has(shot.shotCard))return false;
 const category=index.cards.find(c=>(c.slug||c.cardId)===shot.shotCard)?.category;
 if(textCategories.has(category))return true;
 return ['lower-third-nameplate','chevron-lower-third','info-term-card','number-counter','number-slab-pop'].includes(shot.shotCard);
}
export function auditFilmExpression(shots,index){
 const eligible=shots.slice(3),text=eligible.filter(s=>isTextDominant(s,index));
 const seconds=s=>Math.max(0,Number(s.end)-Number(s.start));
 const duration=eligible.reduce((n,s)=>n+seconds(s),0),textDuration=text.reduce((n,s)=>n+seconds(s),0);
 const countLimit=Math.floor(eligible.length/2),issues=[];
 if(eligible.length>=3&&(text.length>countLimit||duration>0&&textDuration>duration/2+1e-6))
  issues.push(...text.map(shot=>({shotId:shot.id,code:'FILM_TEXT_DOMINANCE',shotIds:text.map(s=>s.id),textShots:text.length,totalShots:eligible.length,textDuration,duration,
   message:'前三镜外的解释段文字主导镜头或时长超过一半，须整体比较图形/真实资料重排；不以填比较理由、装饰图形或铺视频代替'})));
 return {version:'visual-content-v1',openingExempt:3,maxTextShare:.5,passed:!issues.length,issues,textShotIds:text.map(s=>s.id),count:text.length,total:eligible.length,textDuration,duration};
}
