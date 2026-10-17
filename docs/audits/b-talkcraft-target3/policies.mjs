// Rules are keyed to actual Props/schema and verified source usages, not file-count heuristics.
const set=text=>new Set(text.split(' ').filter(Boolean));
const timing=set('lead startDelay startAt typeStart leadIn msgGap cursorStart hold holdEnd wideHold stopHold sweepDur wipeDur countDur routeGrow legPause gapBetween delay segDur segGap stagger barStagger redlineDelay cardBAt lineDelay hover segHold pullDur holdDur pushDur tiltDur startHold dwell');
const motion=set('zoom zoomFrom zoomTo holdScale orbit ampRotY ampRotX panSpeed swayDeg rotYTo driftX driftY breathe burst cps rate scrollSpeed offX');
const placement=set('posX posY titleTop listRight posRight phoneX phoneY boxX boxY boxW boxH frameW frameH cardW barW rowGap offsetX offsetY picW gap aPosX aPosY bPosX bPosY');
const anchors=set('target1X target1Y target2X target2Y targetX targetY targetW tx ty tw th magX magY magSize shotX shotY shotW faceX faceY');
const selection=set('selected pick accentIndex heroIdx hiStep count');
const scale=set('maxVal vBase vStep');
const fact=set('target');
const appearance=set('dimTo dotsOpacity inkOpacity strokeW strokeWidth sldFrom sldTo');
const codeKeys=new Set(['glass-code-walk:code','cursor-locked-zoom:cmd','cursor-locked-zoom:path',
  'cursor-locked-zoom:prevCmd','cursor-locked-zoom:prevOut','terminal-typing-log:termPath']);

// Actual Img/OffthreadVideo branches were traced in wrappers and original components.
export const slots={
  'bed-echo-blur':{src:'portrait-video'},'crash-zoom-punch':{src:'image'},
  'doc-park-left-pill-deal':{docSrc:'image'},'douyin-follow-card':{avatar:'image',bgImage:'image'},
  'filmstrip-conveyor':Object.fromEntries([1,2,3,4,5,6].map(i=>['src'+i,'image'])),
  'gallery-wall-dolly':{src1:'image',src2:'image',src3:'image'},
  'grid-to-hero':{src1:'image-or-video',src2:'image-or-video',src3:'image-or-video',src4:'image-or-video'},
  'host-card-glass-board':{hostSrc:'video-alpha-unverified'},'info-card-assemble':{src:'image'},
  'line-carry-transition':{srcB:'image'},
  'parallel-items-with-host':{src1:'image',src2:'image',src3:'image',hostSrc:'video-alpha-unverified'},
  'pencil-sketch-draw':{handSrc:'image'},'rack-focus-pair':{srcFront:'image',srcBack:'image'},
  'reticle-lock-on':{src:'image'},'scanline-annotate':{src:'image'},
  'split-60-40-story':{src:'video',hostSrc:'video-alpha-unverified'},
  'split-compare-slider':{srcBefore:'image',srcAfter:'image'},
  'stack-fan-out':Object.fromEntries([1,2,3,4,5].map(i=>['src'+i,'image'])),
  'still-layout-relay':{src1:'image',src2:'image',src3:'image'},
  'timeline-photo-strip':{src1:'image',src2:'image',src3:'image',src4:'image'},
  'word-relay-filmstrip':{srcs:'image-list'},
};
export const materialDifferences={
  'callout-line-label':'示意手机界面及标注；无真实背景素材入口，真图适配待验证',
  'evidence-scroll-tour':'示意文档DSL；没有真长图入口，真证据页面适配待验证',
  'focus-dim-spotlight':'示意表格及聚焦效果；真截图入口缺失',
  'host-shrink-to-chip':'剪影人物与示意图表；真实人物输入适配待验证',
  'logo-enter':'文字品牌锁定；无位图logo入口，不能当品牌图资产替换通过',
  'magnifier-detail':'示意资料行与放大镜；真实长图入口缺失',
  'media-pop-in':'browser/chat/pay示意窗口DSL；无真实图片槽',
  'motion-blur-slam-in':'固定示意场景；仅颜色及位置props，无内容替换字段',
  'news-card-desk':'新闻文字与示意正文灰条；不是新闻原页截图',
  'orbit-drift':'示意产品面板与运镜；无真实产品截图入口',
  'pip-zoom-box':'示意背景及人物目标；只开放框/目标几何，无真实主体或内容字段',
  'scribble-annotation':'示意商品信息标注；没有真实商品截图入口',
  'slow-pull-reveal':'示意看板；真实长截图入口缺失',
  'slow-push-in':'示意文章；真实文章截图入口缺失',
  'stage-keyframe-tour':'示意产品长页；真实页面入口缺失',
  'sway-parallax':'示意品牌/流程看板；没有真截图入口',
  'tilt-3d-page':'示意页面内容；没有真截图入口',
};

// DSL constraints are separate from visual fit. Sources/labels and parser bodies are attached per card.
const rule=(syntax,options={})=>({syntax,minRows:1,maxRows:null,visualCapacity:'UNVERIFIED',...options});
export const dsl={
  'bar-chart-growth:barsData':rule('label-number',{minRows:5,maxRows:10,numeric:true,scale:'maxVal'}),
  'chart-grow:colsData':rule('label-number-hot',{numeric:true,scale:'maxVal'}),
  'chapter-progress-list:rows':rule('chapter'),
  'chat-message-flow:messages':rule('messages'),
  'chip-grid-single-select:options':rule('lines',{maxRows:6}),
  'claude-code:logLines':rule('timed-log',{kinds:['tool','res','del','add','ok'],fixedColumns:[1]}),
  'claude-code:whatsNewDsl':rule('dim-lines'),
  'cursor-actor-demo:rows':rule('toggle-rows'),
  'danmu-bubble-praise:bubbles':rule('bubbles'),
  'evidence-scroll-tour:docLines':rule('document'),
  'flying-words:words':rule('lines',{minRows:12,maxRows:30}),
  'focus-dim-spotlight:tableRows':rule('table',{numeric:true}),
  'host-card-glass-board:steps':rule('icon-label-sub',{minRows:2,maxRows:4}),
  'info-card-assemble:pills':rule('lines',{maxRows:3}),
  'info-card-assemble:lines':rule('lines',{maxRows:3}),
  'info-term-card:desc':rule('lines',{maxRows:2}),
  'lead-word-zoom-assemble:words':rule('lines',{firstRowMaxChars:4}),
  'line-by-line-slide:lines':rule('lines',{maxRows:4}),
  'line-chart-story-draw:historyPts':rule('point-pairs',{minRows:2,role:'data-geometry',numeric:true}),
  'line-chart-story-draw:seg1Pts':rule('point-pairs',{minRows:2,role:'data-geometry',numeric:true}),
  'line-chart-story-draw:seg2Pts':rule('point-pairs',{minRows:2,role:'data-geometry',numeric:true}),
  'line-chart-story-draw:altPts':rule('point-pairs',{minRows:2,role:'data-geometry',numeric:true}),
  'line-chart-story-draw:xTicks':rule('axis-labels',{role:'data-geometry',numeric:true}),
  'line-chart-story-draw:bands':rule('bands',{role:'data-geometry',numeric:true}),
  'long-take-world:stations':rule('label-sub',{maxRows:3}),
  'magnifier-detail:rows':rule('label-sub',{numeric:true}),
  'map-route-pin:pinsDsl':rule('pins',{role:'anchor-geometry'}),
  'media-pop-in:shots':rule('mock-shots',{role:'illustration-geometry'}),
  'metric-with-sparkline:sparkData':rule('label-number',{minRows:2,numeric:true}),
  'news-card-desk:cards':rule('news'),
  'numbered-step-stack:stepsDsl':rule('steps'),
  'scanline-annotate:targets':rule('boxes',{role:'anchor-geometry'}),
  'scanline-annotate:labels':rule('label-sub'),
  'shape-wipe-transition:bars':rule('shape-bars',{numeric:true}),
  'slow-pull-reveal:kpisDsl':rule('triple',{minRows:4,maxRows:4,numeric:true}),
  'slow-push-in:statsDsl':rule('label-sub',{numeric:true}),
  'source-converge:sources':rule('lines',{minRows:2,maxRows:6}),
  'stage-keyframe-tour:metricsDsl':rule('label-sub',{numeric:true}),
  'stage-keyframe-tour:pricingDsl':rule('triple',{numeric:true}),
  'step-timeline-vertical:stepsDsl':rule('label-sub'),
  'sway-parallax:cellsDsl':rule('triple',{numeric:true}),
  'terminal-typing-log:lines':rule('timed-log',{kinds:['cmd','log','ok'],fixedColumns:[1]}),
  'title-demote-to-label:items':rule('lines',{maxRows:4}),
  'type-contrast-emphasis:words':rule('anchored-words',{fixedColumns:[1],role:'anchored-content'}),
  'ui-flow-theater:rowsDsl':rule('label-sub',{minRows:3,maxRows:3}),
  'ui-prop-theater:stepsDsl':rule('label-sub',{minRows:3,maxRows:3}),
  'word-relay-filmstrip:verbs':rule('lines',{minRows:4,maxRows:6}),
  'word-slot-cycle:words':rule('lines',{minRows:4,maxRows:6}),
};

export function fieldRole(cardId,field) {
  if(slots[cardId]?.[field.key]) return 'media';
  if(dsl[cardId+':'+field.key]?.role) return dsl[cardId+':'+field.key].role;
  if(timing.has(field.key)) return 'timing';
  if(motion.has(field.key)) return 'motion';
  if(placement.has(field.key)) return 'context-placement';
  if(anchors.has(field.key)) return 'anchor-geometry';
  if(selection.has(field.key)) return 'content-selection';
  if(scale.has(field.key)) return 'data-scale';
  if(fact.has(field.key)) return 'numeric-content';
  if(codeKeys.has(cardId+':'+field.key)) return 'code-content';
  if(field.type==='color') return 'theme';
  if(field.type==='select' || field.type==='boolean') return 'context-variant';
  if(['number','slider'].includes(field.type)) {
    if(appearance.has(field.key) || /Size\d?$|FontSize$|^fontSize/.test(field.key)) return 'appearance';
    return 'UNCLASSIFIED';
  }
  return 'content';
}

export function policyFor(card,analysis,fields) {
  const required=fields.filter(f=>['content','code-content','media','numeric-content','data-scale',
    'data-geometry','anchor-geometry','illustration-geometry','anchored-content'].includes(f.role)).map(f=>f.key);
  const numericClaims=fields.filter(f=>['content','numeric-content','data-geometry','anchored-content'].includes(f.role)).map(f=>f.key);
  const rowRules=Object.fromEntries(fields.filter(f=>f.type==='textarea' && f.role!=='media' && f.role!=='code-content').map(f=>[
    f.key,{...(dsl[card.slug+':'+f.key] ?? rule('lines')),source:f.sourceEvidence,sourceParsers:analysis.parsers}]));
  const nativeMedia=slots[card.slug] ?? {};
  const mediaAlternatives=card.slug==='split-60-40-story' ? [['src','hostSrc']] : [];
  const actualRequired=required.filter(key=>!mediaAlternatives.some(group=>group.includes(key)));
  return {required:actualRequired,numericClaims,media:nativeMedia,mediaAlternatives,dsl:rowRules,
    capacity:{textFit:'UNVERIFIED',sourceRowLimits:Object.fromEntries(Object.entries(rowRules).filter(([,r])=>r.maxRows).map(([k,r])=>[k,r.maxRows]))},
    capabilities:{parameterizedContent:fields.some(f=>['content','numeric-content','code-content'].includes(f.role)),
      nativeMedia:Object.keys(nativeMedia).length>0,materialDifference:materialDifferences[card.slug] ?? null,
      realMediaWithoutAdapter:!!Object.keys(nativeMedia).length,overlayOnly:false,
      illustrationOnlyWithoutAdapter:!!materialDifferences[card.slug],
      sourceSignals:card.implementation.sourceSignals},
    blockers:['NO_COMPONENT_RUNTIME_TEST','NO_RENDER_LAYOUT_THEME_READTIME_ACCEPTANCE',
      ...(materialDifferences[card.slug] ? ['REAL_MEDIA_ADAPTATION_UNVERIFIED'] : []),
      ...(!fields.some(f=>['content','numeric-content','code-content'].includes(f.role)) ? ['NO_REPLACEABLE_TEXT_CONTENT'] : [])],
    validationStatus:'source_rules_defined_render_unverified'};
}
