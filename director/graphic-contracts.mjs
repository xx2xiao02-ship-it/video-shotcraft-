export const GRAPHIC_CONTRACTS = Object.freeze({
  'ui-entrance/bezier-source-converge-merge': {
    summary:'2-4 个具体来源汇聚到一个结果，节点文字、结果与标题均由编导提供',
    fields:{sources:'2-4个来源短词，每项最多6字',target:'结果短词，最多8字'},
    fixture:{sources:['收入','节流','还债'],target:'现金底气'},
  },
  'data/hatch-depth': {
    summary:'2-5 项真实数值横条比较；禁止用演示数字或编造数据',
    fields:{rows:'2-5项{label,value,evidence}，evidence必须引用对应原文且包含该数值',unit:'原文数值单位，最多6字'},
    fixture:{rows:[{label:'账面资产',value:100,evidence:'账面资产100万'},
      {label:'可用现金',value:10,evidence:'可用现金10万'}],unit:'万'},
  },
  'data/chart-live-moves/axis-rescale-shock': {
    summary:'真实已准入数与全量审计范围对比；全量超出原量程后按真实值重标',
    minRows:2,maxRows:2,requiresAxisOverflow:true,
    fields:{rows:'两项同单位真实计数，每项{label,value,evidence}',unit:'原文数值单位，最多6字',axisMax:'重标前真实纵轴上限；末项必须超过'},
    fixture:{rows:[{label:'文字准入',value:94,evidence:'文字卡已准入94个变体'},
      {label:'全量审计范围',value:214,evidence:'全量审计覆盖214个运行变体'}],unit:'个',axisMax:100},
  },
  'data/chart-live-moves/oscilloscope-stream': {
    summary:'最近批次的真实新增变体数量流；突出所给批次中的真实峰值，不放大数据',
    minRows:3,maxRows:12,
    fields:{rows:'3-12个有序批次数据点，每项{label,value,evidence}',unit:'原文数值单位，最多6字',eventIndex:'真实峰值所在的0起始数据行'},
    fixture:{rows:[{label:'第11批',value:12,evidence:'第十一批最终新增12个变体'},
      {label:'第12批',value:9,evidence:'第十二批新增9个变体'},
      {label:'第13批',value:9,evidence:'第十三批累计新增9个变体'},
      {label:'第14批',value:3,evidence:'第十四批新增3个变体'}],unit:'个',eventIndex:0},
  },
  'data/chart-live-moves/unit-dot-swarm-regroup': {
    summary:'每个点对应一个当前有效变体，按文字、数值和图形验收类别分组',
    minRows:3,maxRows:3,
    fields:{rows:'恰好3个准入类别，每项{label,value,evidence}；总点数由value求和',unit:'原文数值单位，最多6字'},
    fixture:{rows:[{label:'文字卡',value:94,evidence:'文字卡已准入94个变体'},
      {label:'数值卡',value:0,evidence:'数值卡当前有效准入0个变体'},
      {label:'图形卡',value:0,evidence:'图形卡当前有效准入0个变体'}],unit:'个'},
  },
  'data/gauge-readout-moves/needle-sweep': {
    summary:'三个真实治理指标的同量纲表盘；针位按原始数值相对最大值计算',
    minRows:3,maxRows:3,
    fields:{rows:'恰好3项同单位真实计数，每项{label,value,evidence}',unit:'原文数值单位，最多6字'},
    fixture:{rows:[{label:'长版准入',value:94,evidence:'长版准入94个'},
      {label:'源码已解析',value:212,evidence:'源码关系已解析212个'},
      {label:'审计总量',value:214,evidence:'纳入审计总量214个'}],unit:'个'},
  },
  'data/gauge-readout-moves/tape-scroll-fixed-pointer': {
    summary:'同一指标从批次前快照滚到批次后真实值，刻度带显示全量范围',
    minRows:2,maxRows:2,
    fields:{rows:'同一指标的前后两项真实快照，每项{label,value,evidence}',unit:'原文数值单位，最多6字',axisMax:'大于等于当前值的全量纵轴上限'},
    fixture:{rows:[{label:'第12批末',value:85,evidence:'第十二批结束有效变体85个'},
      {label:'第14批前',value:94,evidence:'第十四批前有效变体94个'}],unit:'个',axisMax:214},
  },
  'data/particle-celebrate-hits/confetti-crossfire': {
    summary:'为一个真实准入计数庆祝；数值、单位和标题均从业务输入取得',
    minRows:1,maxRows:1,
    fields:{rows:'恰好1项真实里程碑计数{label,value,evidence}',unit:'原文数值单位，最多6字'},
    fixture:{rows:[{label:'长版有效准入',value:94,evidence:'94个长版变体已取得本地准入'}],unit:'个'},
  },
  'data/particle-celebrate-hits/counter-tick-sparks': {
    summary:'计数到达真实治理指标时溅火；逐步打点间隔由业务契约指定',
    minRows:1,maxRows:1,
    fields:{rows:'恰好1项真实里程碑计数{label,value,evidence}',unit:'原文数值单位，最多6字',tickEvery:'按真实业务计数打点的整数间隔'},
    fixture:{rows:[{label:'长版有效准入',value:94,evidence:'94个长版变体已取得本地准入'}],unit:'个',tickEvery:10},
  },
  'data/particle-sand-fill': {
    summary:'将真实治理计数逐颗堆成柱，行标签、数值与单位均来自业务输入',
    minRows:3,maxRows:5,
    fields:{rows:'3-5项真实计数，每项{label,value,evidence}',unit:'原文数值单位，最多6字'},
    fixture:{rows:[{label:'长版准入',value:94,evidence:'长版准入94个'},
      {label:'适配器声明',value:109,evidence:'当前源码审计声明适配器109个'},
      {label:'源码已解析',value:212,evidence:'已解析源码212个'},
      {label:'审计总量',value:214,evidence:'纳入审计总量214个'}],unit:'个'},
  },
});

// Batch 16 uses the same structured-input gate as graphic cards, but these
// cards carry business copy/media rather than numeric rows. Keeping the
// contracts beside the existing validator makes the admission path shared.
export const BUSINESS_CARD_CONTRACTS = Object.freeze({
  'typography/word-relay-filmstrip': {
    fields: {words:'3-4 short action words, each <=18 chars', screens:'one real local image path per word'},
  },
  'outro/ui-to-brand-morph/icon-flip-bloom-logo': {
    fields: {word:'business wordmark, <=24 chars'},
  },
  'outro/ui-to-brand-morph/input-morphs-into-logo': {
    fields: {word:'business input copy, <=48 chars'},
  },
  'interaction/ai-stream-response/stream-response': {
    fields: {summary:'real result summary, <=100 chars',rows:'4-7 evidence rows',backplate:'real local image path'},
  },
  'interaction/type-and-filter': {
    fields: {query:'real search phrase, <=32 chars',targetId:'real target card id, <=80 chars',texture:'real local page screenshot path'},
  },
  'ui-entrance/avatar-bracket-carousel': {
    fields: {avatars:'3-6 real avatar entries with image and role'},
  },
  'data/avatar-grid-radial-build-colorize': {
    fields: {title:'business grid title, <=48 chars',items:'exactly 56 real grid entries',legend:'status legend'},
  },
  'ui-entrance/card-stack': {
    fields: {labels:'exactly 8 real card labels, each <=12 chars'},
  },
  'ui-entrance/carousel-3d': {
    fields: {labels:'exactly 8 real carousel labels, each <=12 chars'},
  },
  'ui-entrance/research-card-stack-scroll': {
    fields: {titles:'exactly 8 real research titles, each <=64 chars'},
  },
  'ui-entrance/floating-glossy-label-pills': {
    fields: {labels:'exactly 4 real feature labels, each <=18 chars'},
  },
  'transition/bottom-push-stack-wipe': {
    fields: {chapters:'exactly 4 real chapter entries with color, label and seed'},
  },
  'transition/bubble-swarm-takeover': {
    fields: {capsules:'exactly 3 real status labels',sourceLabel:'source page label',targetLabel:'target page label'},
  },
  'transition/card-flip-reveal': {
    fields: {results:'exactly 3 real outcome values',title:'business outcome title'},
  },
  'transition/card-flock-tumble': {
    fields: {titles:'exactly 3 real page titles',finale:'business outcome phrase'},
  },
  'transition/circle-match-iris': {
    fields: {value:'real integer percentage from 0 to 100',metricLabel:'business metric label'},
  },
  'transition/color-block-step-wipe': {
    fields: {badgeText:'real status badge',pageLabel:'real page label'},
  },
  'transition/gradient-transition': {
    fields: {labels:'exactly 3 real gradient phase labels'},
  },
  'transition/line-carry-transition': {
    fields: {sourceTitle:'source page title',targetTitle:'target page title',targetLabel:'target state label'},
  },
});

const localImage = value => typeof value === 'string' &&
  /^textures\/live\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:png|jpe?g)$/i.test(value) &&
  !value.includes('..') && !value.includes('//');
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 &&
  [...value].length <= max && !/[\r\n]/.test(value);

export function validateBusinessCardParams(card, params, narration = '') {
  if (!BUSINESS_CARD_CONTRACTS[card]) return undefined;
  if (!params || typeof params !== 'object' || Array.isArray(params))
    throw new Error(`业务卡 ${card} 缺少真实结构化参数`);
  const fail = message => { throw new Error(`${card}: ${message}`); };
  const exactKeys = keys => Object.keys(params).length === keys.length && keys.every(key => Object.hasOwn(params, key));
  if (card === 'transition/bottom-push-stack-wipe') {
    if (!exactKeys(['chapters']) || !Array.isArray(params.chapters) || params.chapters.length !== 4 ||
      params.chapters.some(chapter => !chapter || Object.keys(chapter).length !== 3 ||
        typeof chapter.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(chapter.color) ||
        !text(chapter.label, 24) || !Number.isInteger(chapter.seed) || chapter.seed < 0))
      fail('章节必须恰好4条，并提供有效六位颜色、标题和整数种子');
    return {chapters:params.chapters.map(chapter => ({color:chapter.color,label:chapter.label,seed:chapter.seed}))};
  }
  if (card === 'transition/bubble-swarm-takeover') {
    if (!exactKeys(['capsules','sourceLabel','targetLabel']) || !Array.isArray(params.capsules) || params.capsules.length !== 3 ||
      params.capsules.some(label => !text(label, 24)) || !text(params.sourceLabel, 48) || !text(params.targetLabel, 48))
      fail('必须提供3条状态胶囊和前后页面标签');
    return {capsules:[...params.capsules],sourceLabel:params.sourceLabel,targetLabel:params.targetLabel};
  }
  if (card === 'transition/card-flip-reveal') {
    if (!exactKeys(['results']) && !exactKeys(['results','title'])) fail('必须提供3个结果值和业务标题');
    if (!Array.isArray(params.results) || params.results.length !== 3 || params.results.some(result => !text(result, 16)) ||
      (Object.hasOwn(params, 'title') && !text(params.title, 48))) fail('结果值必须恰好3条且标题容量有效');
    return {results:[...params.results], ...(Object.hasOwn(params, 'title') ? {title:params.title} : {})};
  }
  if (card === 'transition/card-flock-tumble') {
    if (!exactKeys(['titles','finale']) || !Array.isArray(params.titles) || params.titles.length !== 3 ||
      params.titles.some(title => !text(title, 24)) || !text(params.finale, 48))
      fail('必须提供3个页面标题和收束口号');
    return {titles:[...params.titles],finale:params.finale};
  }
  if (card === 'transition/circle-match-iris') {
    if (!exactKeys(['value','metricLabel']) || !Number.isInteger(params.value) || params.value < 0 || params.value > 100 ||
      !text(params.metricLabel, 24)) fail('匹配值必须是0到100的整数，且指标标签有效');
    return {value:params.value,metricLabel:params.metricLabel};
  }
  if (card === 'transition/color-block-step-wipe') {
    if (!exactKeys(['badgeText','pageLabel']) || !text(params.badgeText, 24) || !text(params.pageLabel, 48))
      fail('必须提供有效状态徽章和页面标签');
    return {badgeText:params.badgeText,pageLabel:params.pageLabel};
  }
  if (card === 'transition/gradient-transition') {
    if (!exactKeys(['labels']) || !Array.isArray(params.labels) || params.labels.length !== 3 ||
      params.labels.some(label => !text(label, 24))) fail('渐变阶段标签必须恰好3条');
    return {labels:[...params.labels]};
  }
  if (card === 'transition/line-carry-transition') {
    if (!exactKeys(['sourceTitle','targetTitle','targetLabel']) || !text(params.sourceTitle, 48) ||
      !text(params.targetTitle, 48) || !text(params.targetLabel, 48)) fail('必须提供起点、终点标题和目标状态');
    return {sourceTitle:params.sourceTitle,targetTitle:params.targetTitle,targetLabel:params.targetLabel};
  }
  if (card === 'typography/word-relay-filmstrip') {
    if (!exactKeys(['words','screens']) || !Array.isArray(params.words) || params.words.length < 3 || params.words.length > 4 ||
      params.words.some(word => !text(word, 18)) || !Array.isArray(params.screens) || params.screens.length !== params.words.length ||
      params.screens.some(screen => !localImage(screen))) fail('词组与真实页面素材必须一一对应');
    if (!params.words.some(word => narration.includes(word))) fail('业务词组必须能在原文中定位');
    return {words:[...params.words],screens:[...params.screens]};
  }
  if (card === 'outro/ui-to-brand-morph/icon-flip-bloom-logo' || card === 'outro/ui-to-brand-morph/input-morphs-into-logo') {
    if (!exactKeys(['word']) || !text(params.word, card.includes('input') ? 48 : 24)) fail('word 必须是完整业务词');
    if (narration && !narration.includes(params.word)) fail('word 必须能在原文中定位');
    return {word:params.word};
  }
  if (card === 'interaction/ai-stream-response/stream-response') {
    if (!exactKeys(['summary','rows','backplate']) || !text(params.summary, 100) || !localImage(params.backplate) ||
      !Array.isArray(params.rows) || params.rows.length < 4 || params.rows.length > 7 ||
      params.rows.some(row => !row || Object.keys(row).length !== 2 || !text(row.title, 64) || !text(row.meta, 32)))
      fail('摘要、4-7条证据行和真实背景图必须完整提供');
    if (narration && !narration.includes(params.summary)) fail('摘要必须能在原文中定位');
    return {summary:params.summary,rows:params.rows.map(row => ({title:row.title,meta:row.meta})),backplate:params.backplate};
  }
  if (card === 'interaction/type-and-filter') {
    if (!exactKeys(['query','targetId','texture']) || !text(params.query, 32) || !text(params.targetId, 80) || !localImage(params.texture))
      fail('搜索词、目标卡ID和真实页面纹理必须完整提供');
    if (narration && !narration.includes(params.query)) fail('搜索词必须能在原文中定位');
    return {query:params.query,targetId:params.targetId,texture:params.texture};
  }
  if (card === 'ui-entrance/avatar-bracket-carousel') {
    if (!exactKeys(['avatars']) || !Array.isArray(params.avatars) || params.avatars.length < 3 || params.avatars.length > 6 ||
      params.avatars.some(item => !item || Object.keys(item).length !== 2 || !localImage(item.src) || !text(item.role, 24)) ||
      new Set(params.avatars.map(item => item.role)).size !== params.avatars.length)
      fail('头像必须是3-6个真实图片与唯一角色标签');
    return {avatars:params.avatars.map(item => ({src:item.src,role:item.role}))};
  }
  if (card === 'data/avatar-grid-radial-build-colorize') {
    const statuses = new Set(['active','pending','inactive']);
    if (!exactKeys(['title','items','legend']) || !text(params.title, 48) || !Array.isArray(params.items) || params.items.length !== 56 ||
      params.items.some(item => !item || Object.keys(item).length !== 4 || !text(item.label, 24) || !statuses.has(item.status) ||
        !localImage(item.src) || !text(item.initials, 4)) || new Set(params.items.map(item => item.label)).size !== 56 ||
      !Array.isArray(params.legend) || params.legend.length !== 3 || params.legend.some(item => !item || Object.keys(item).length !== 2 ||
        !statuses.has(item.status) || !text(item.label, 16)) || new Set(params.legend.map(item => item.status)).size !== 3)
      fail('网格必须提供56个真实条目、素材、状态和完整图例');
    return {title:params.title,items:params.items.map(item => ({label:item.label,status:item.status,src:item.src,initials:item.initials})),
      legend:params.legend.map(item => ({status:item.status,label:item.label}))};
  }
  if (card === 'ui-entrance/card-stack' || card === 'ui-entrance/carousel-3d' ||
      card === 'ui-entrance/floating-glossy-label-pills') {
    const key='labels';
    const count=card==='ui-entrance/floating-glossy-label-pills'?4:8;
    if(!exactKeys([key]) || !Array.isArray(params[key]) || params[key].length!==count ||
       params[key].some(item=>!text(item,card==='ui-entrance/floating-glossy-label-pills'?18:12)))
      fail('真实标签数量或容量不符合原组件槽位');
    if(narration && !params[key].some(item=>narration.includes(item))) fail('至少一个真实标签必须能在本镜原文中定位');
    return {[key]:[...params[key]]};
  }
  if (card === 'ui-entrance/research-card-stack-scroll') {
    if(!exactKeys(['titles']) || !Array.isArray(params.titles) || params.titles.length!==8 ||
       params.titles.some(item=>!text(item,64))) fail('真实研究标题必须恰好8条且有明确容量');
    if(narration && !params.titles.some(item=>narration.includes(item))) fail('至少一个研究标题必须能在本镜原文中定位');
    return {titles:[...params.titles]};
  }
  return undefined;
}

export function validateGraphicParams(card, params, narration = '') {
  const contract = GRAPHIC_CONTRACTS[card];
  if (!contract) {
    if (params && Object.keys(params).length) throw new Error(`模板 ${card} 尚无图形参数契约`);
    return undefined;
  }
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error(`模板 ${card} 缺少结构化图形参数`);
  if (Object.keys(params).some(key => !Object.hasOwn(contract.fields,key))) throw new Error(`模板 ${card} 存在未知图形参数`);
  const text = (value,max) => typeof value === 'string' && value.trim().length > 0 && [...value].length <= max;
  if (card.includes('bezier')) {
    if (!Array.isArray(params.sources) || params.sources.length < 2 || params.sources.length > 4 ||
        params.sources.some(label => !text(label,6)) || !text(params.target,8)) throw new Error('汇聚图需要2-4个来源短词及结果短词');
    return {sources:[...params.sources],target:params.target};
  }
  const minRows=contract.minRows ?? 2;
  const maxRows=contract.maxRows ?? 5;
  if (!Array.isArray(params.rows) || params.rows.length < minRows || params.rows.length > maxRows || !text(params.unit,6) ||
      params.rows.some(row => !row || Object.keys(row).some(key => !['label','value','evidence'].includes(key)) ||
        !text(row.label,10) || !Number.isFinite(row.value) || row.value < 0 || typeof row.evidence !== 'string' ||
        !row.evidence || !narration.includes(row.evidence) || !row.evidence.includes(params.unit) ||
        ![...row.evidence.matchAll(/\d+(?:\.\d+)?/g)].some(match => Number(match[0]) === row.value)) ||
      !params.rows.some(row => row.value > 0) || new Set(params.rows.map(row=>row.label)).size!==params.rows.length)
    throw new Error('图形数据行数、标签、数值及单位必须有对应原文证据，不能编造数据');
  const result={rows:params.rows.map(row => ({...row})),unit:params.unit};
  if (Object.hasOwn(contract.fields,'axisMax')) {
    if (!Number.isFinite(params.axisMax) || params.axisMax<=0) throw new Error(`模板 ${card} 缺少有效纵轴上限`);
    const values=params.rows.map(row=>row.value);
    if (contract.requiresAxisOverflow ? values.at(-1)<=params.axisMax : Math.max(...values)>params.axisMax)
      throw new Error(`模板 ${card} 的真实数据与纵轴范围不符`);
    result.axisMax=params.axisMax;
  }
  if (Object.hasOwn(contract.fields,'eventIndex')) {
    if (!Number.isInteger(params.eventIndex) || params.eventIndex<0 || params.eventIndex>=params.rows.length ||
        params.rows[params.eventIndex].value!==Math.max(...params.rows.map(row=>row.value)))
      throw new Error(`模板 ${card} 的事件索引必须指向真实峰值`);
    result.eventIndex=params.eventIndex;
  }
  if (Object.hasOwn(contract.fields,'tickEvery')) {
    if (!Number.isInteger(params.tickEvery) || params.tickEvery<1 || params.tickEvery>params.rows[0].value)
      throw new Error(`模板 ${card} 的计数打点间隔无效`);
    result.tickEvery=params.tickEvery;
  }
  return result;
}
