import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

export const VISUAL_CONTENT_RULES='普通论述文字须逐镜匹配真实视频背景，不能用色块代替；只有本镜全部语句明确为观点或金句、且不夹杂机制/定义/例证/数据/列举等论述时才作为观点强调例外，不能仅凭论点标签或need=强调豁免。前三镜沿用简洁开场。正式选卡必须表达本镜内容，固定灰条、演示截图、演示柱形图不算真实素材或图解。存在不可替换的演示主体时重新选卡，不补虚构数据。前三镜可保留简洁文字；其余解释段文字主导镜头按镜数和时长均不得超过一半。文字转场、下三分之一姓名条、装饰划线及给文字铺视频不算图形表达。优先关系、流程、结构图或有来源的真实资料模板；素材先联网检索可访问且授权合规的内容；没有合适的再查独立素材库，已有合法绑定不重复采集。字号和文本按原卡单行容量核验，不裁字、缩卡或更改真实字级时间。人物轨道必须与标题/资料主体区域分离；无法兼容则重选模板。无业务意义的序号不显示，原卡必填列不能用空列绕过；没有真实序列语义时重选无需编号的模板。';

// These are source-backed defects, not a competing template whitelist. The
// original audited catalog remains complete and available for comparison.
export function visualContentContract(card){
 const id=card?.cardId||card?.slug;
 const contract={version:'visual-content-v1',cardId:id,placeholder:false,singleLine:null,requiresPerson:requiresHostVideo(card)};
 if(!card?.implementation?.file)return card?.capabilities?.visualContent||contract;
 const bytes=fs.readFileSync(card.implementation.file);
 if(createHash('sha256').update(bytes).digest('hex')!==card.implementation.sha256)throw Error(`${id} 展示容量契约源码指纹不一致`);
 const source=bytes.toString();
 if(['cursor-actor-demo','tilt-3d-page','host-shrink-to-chip'].includes(id)){
  contract.presentationMedia={required:true,adapter:'presentation-integrity-v1',role:'context',
   searchOrder:['online','independent-local-library'],rule:'原卡图标/灰块不是素材；节点须生成真实素材补全方案，核对来源、许可和本地文件，中心审批后安装具名素材入口并复检。不得只改文字后放行。'};
 }
 if(id==='scanline-annotate')contract.attention={slot:{width:600,height:396},minimumSide:4,
  proofRequired:true,rule:'每个资料引用框须对应当前截图中的唯一原文DOM/OCR区域，并经过裁切和缩放坐标换算。不得用框高度凑字级时间。隐喻不当原文引用：节点须提出独立口播说明方案，经中心审批后与资料分开展示。'};
 if(['black-slam-transition','particle-weld-transition','overexpose-flip-transition'].includes(id))contract.continuity={
  required:true,rule:'逐阶段核对背景字色和原生文字窗口与真实字级锚点的交集。下一句未到锚点时保留已说出的上一句，不提前下一句、隐藏全部正文或改配音。'};
 if(id==='color-slam-beat-card'){
  if(!source.includes('shot-bars')||!source.includes('Shot1')||!source.includes('Shot2'))throw Error('纯色节拍卡演示区域契约已变化，须重新审计');
  contract.placeholder=true;
  contract.reason='原卡Shot1灰条及Shot2固定柱高为不可替换演示主体，没有真实图片或视频输入槽';
  contract.hostConflict='独立居中人物覆盖原卡左标题及右素材区域';
 }
 if(id==='logo-enter'){
  if(!source.includes('viewBox="0 0 100 100"'))throw Error('品牌登场占位标契约已变化，须重新审计');
  contract.placeholder=true;
  contract.reason='品牌登场原卡包含固定三角、方、圆演示标志，公开参数没有真实标志槽；不能把品牌文字和占位标当图形解释';
 }
 if(id==='pencil-sketch-draw'){
  if(!source.includes('M 140 250 L 200 250'))throw Error('手绘卡固定车身轮廓契约已变化，须重新审计');
  contract.placeholder=true;
  contract.reason='原卡绘制固定车身轮廓，公开参数只能改标签和笔具；不能把车身演示图充当经济机制或真实资料';
 }
 if(id==='behind-text-title')contract.adaptiveText={field:'title',maxCharacters:10,maxLines:2,reason:'安全内容宽864，保留原文及动效时钟，最多两行；不能用默认235像素塞任意长度标题'};
 if(id==='source-converge')contract.adaptiveText={field:'caption',maxCharacters:54,maxLines:3,reason:'原卡说明行沿x700至480移动，按最小边距最多18字三行，保留字级锚点'};
 if(id==='line-by-line-slide')contract.adaptiveText={field:'lines',maxCharactersPerLine:18,maxLines:4,reason:'有人物时保留右侧独立人物区，正文在510像素安全宽内适配且字号不少于28'};
 if(id==='numbered-step-stack')contract.meaningfulItems={field:'stepsDsl',minimum:2};
 if(['rack-focus-pair','info-card-assemble','still-layout-relay'].includes(id)){
  const dep=card.implementation.dependencies?.find(d=>d.file.replaceAll('\\','/').endsWith(`/template/cards/${id}.tsx`));
  if(!dep)throw Error(`${id} 缺少原卡空间布局依赖证据`);
  const layout=fs.readFileSync(dep.file);
  if(createHash('sha256').update(layout).digest('hex')!==dep.sha256)throw Error(`${id} 原卡空间布局指纹不一致`);
  const code=layout.toString();
  const marker={'rack-focus-pair':'.rfp-pb','info-card-assemble':'.ica-pc','still-layout-relay':'.slr-photo'}[id];
  if(!code.includes(marker))throw Error(`${id} 原卡空间契约已变化`);
  contract.hostConflict='原卡资料主体占据独立人物默认右侧区域，未预留独立人物列；须重选有专用人物区且兼容资料槽的模板';
  contract.layoutSha256=dep.sha256;
 }
 if(['soft-blur-in','tracking-in'].includes(id)){
  if(!/whiteSpace:\s*["']nowrap["']/u.test(source)||!source.includes('fontSize'))throw Error(`${id} 单行容量源码契约已变化`);
  contract.singleLine={field:'text',fontField:'fontSize',width:960,safeWidth:864,
   minCjkAdvanceEm:id==='soft-blur-in'?.9:1,allowsNewline:false};
 }
 return {...contract,implementationSha256:card.implementation.sha256};
}

export function auditVisualContent(shots,{catalog,projectRoot=null}){
 const issues=[],rows=[];
 for(const shot of shots||[]){
  const card=catalog.cards.find(c=>c.cardId===shot.shotCard);if(!card)continue;
  const contract=visualContentContract(card),props=shot.templateParams?.cardProps||{};
  rows.push({shotId:shot.id,cardId:shot.shotCard,contract});
  let approved=null;
  if(projectRoot)try{
   const plan=JSON.parse(fs.readFileSync(path.join(projectRoot,'remotion/presentation-integrity.json'))),approval=JSON.parse(fs.readFileSync(path.join(projectRoot,'qa/presentation-integrity-approval.json')));
   const planSha=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
   const shotSha=createHash('sha256').update(fs.readFileSync(path.join(projectRoot,'remotion/shots.json'))).digest('hex');
   if(approval.approved&&approval.planSha256===planSha&&plan.inputs['remotion/shots.json']===shotSha)approved=plan.shots.find(r=>r.shotId===shot.id&&r.cardId===shot.shotCard);
  }catch{}
  if(contract.attention&&!approved?.attention){
   const boxes=String(props.targets||'').split('\n').filter(Boolean).map(s=>s.split(/[,，\s]+/u).map(Number));
   if(!boxes.length||boxes.some(b=>b.length!==4||!b.every(Number.isFinite)||b[0]<0||b[1]<0||b[2]<4||b[3]<4||b[0]+b[2]>600||b[1]+b[3]>396))
    issues.push({shotId:shot.id,code:'ATTENTION_TARGET_BOUNDS',field:'targets',repair:'presentation-integrity',message:'资料定位框越界或退化，必须按来源坐标重建或改为明确的非引用说明，不能钳坐标强过'});
  }
  if(contract.requiresPerson&&shot.subject!=='person')issues.push({shotId:shot.id,code:'HOST_SUBJECT_REQUIRED',message:'原卡必填人物视频槽没有非人物替代入口；本镜不在原口型窗口内，必须重选卡，不能虚构人物或留空素材'});
  if(contract.placeholder)issues.push({shotId:shot.id,code:'DEMO_VISUAL_NOT_REPLACEABLE',message:contract.reason});
  if(contract.meaningfulItems&&String(props[contract.meaningfulItems.field]||'').split('\n').filter(s=>s.trim()).length<contract.meaningfulItems.minimum)
   issues.push({shotId:shot.id,code:'STRUCTURE_ITEMS_REQUIRED',field:contract.meaningfulItems.field,message:'步骤结构须有至少两个有实际内容的项目；单条文字不算步骤关系，不用空行凑数'});
  if(shot.subject==='person'&&contract.hostConflict)issues.push({shotId:shot.id,code:'HOST_CONTENT_REGION_CONFLICT',message:contract.hostConflict});
  if(contract.adaptiveText){const spec=contract.adaptiveText,value=String(props[spec.field]??card.fields.find(f=>f.key===spec.field)?.default??'');
   if(spec.maxCharacters&&[...value].length>spec.maxCharacters||spec.maxCharactersPerLine&&value.split('\n').some(line=>[...line].length>spec.maxCharactersPerLine)||spec.maxCharactersPerLine&&value.split('\n').length>spec.maxLines)
    issues.push({shotId:shot.id,field:spec.field,code:'TEXT_LAYOUT_CAPACITY',message:spec.reason});
  }
  if(shot.subject==='person'&&shot.shotCard==='map-route-pin'&&String(props.pinsDsl||'').split('\n').some(line=>Number(line.split('|')[0])<150))
   issues.push({shotId:shot.id,field:'pinsDsl',code:'HOST_CONTENT_REGION_CONFLICT',message:'地图左侧独立人物安全区内存在图钉，须重排或重新选卡'});
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
export function requiresHostVideo(card){
 return (card.policy?.required||[]).includes('hostSrc')&&Object.hasOwn(card.policy?.media||{},'hostSrc')&&
  !(card.policy?.mediaAlternatives||[]).some(group=>group.includes('hostSrc')&&group.some(key=>key!=='hostSrc'));
}
const structured=new Set(['step-timeline-vertical','numbered-step-stack','source-converge','map-route-pin','chip-grid-single-select','parallel-items-with-host','chat-message-flow','ui-flow-theater']);
export function graphicCandidateIds(index){
 return index.cards.filter(c=>structured.has(c.slug)||c.category==='素材呈现'||c.category==='数据信息图'&&!isTextDominant({shotCard:c.slug},index)).map(c=>c.slug);
}
export function isTextDominant(shot,index){
 if(shot.shotCard==='logo-enter')return true;
 if(shot.shotCard==='numbered-step-stack'&&shot.templateParams?.cardProps&&String(shot.templateParams.cardProps.stepsDsl||'').split('\n').filter(s=>s.trim()).length<2)return true;
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
