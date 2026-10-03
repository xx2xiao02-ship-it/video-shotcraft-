export const NUMERIC_CARD_CONTRACTS = Object.freeze({
  'data/counter-confetti': {
    summary:'单个原文真实指标从零冲刺到位，纸屑强调达成，保留数值、单位与标签',
    fields:{value:'0-999999的非负数，最多2位小数',unit:'原文单位，1-6字',label:'指标标签，1-12字',evidence:'本镜头原文逐字引用，必须包含value与unit'},
    fixture:{value:1200,unit:'元',label:'应急储备',evidence:'应急储备1200元'},
    minFrames:138,fps:30,completionRatio:0.82,holdFrames:24,
  },
  'data/odometer-digit-roll': {
    summary:'单个原文真实指标逐位机械滚动、回弹锁定并停留，数位必须对应终值，保留单位与标签',
    fields:{value:'非负数，最多6个数位（小数前后合计）及2位小数，不缩写或换算',unit:'原文单位，1-6字',label:'指标标签，1-12字',evidence:'本镜头原文逐字引用，必须包含value与unit'},
    fixture:{value:12.34,unit:'万元',label:'现金储备',evidence:'现金储备12.34万元'},
    maxDigits:6,minFrames:144,fps:30,completionFrame:98,holdFrames:45,
  },
});

export function numericCardInstructions(availableCards) {
  const cards=availableCards.filter(card=>Object.hasOwn(NUMERIC_CARD_CONTRACTS,card));
  if (!cards.length) return '';
  return '数值卡只表达本镜头一个真实指标，templateParams 必须为 {value,unit,label,evidence}，value 是JSON数值。evidence 逐字引用本镜头原文并含相同的阿拉伯数值与紧邻单位。禁止从全片其他段借数、换算、缩写、随机补数或提取画面标题作为证据。value 可以为0及最多2位小数；label 最多12字，unit 最多6字；画面标题一行且最多14字。没有原文数字或时长不足时选择其他表达。数值卡没有已验收短版，不能纳入前5秒短镜头。各卡规则：'+
    cards.map(card=>`${card}：${NUMERIC_CARD_CONTRACTS[card].summary}；${NUMERIC_CARD_CONTRACTS[card].fields.value}；30fps至少${NUMERIC_CARD_CONTRACTS[card].minFrames}帧`).join('。');
}

export function validateNumericCardParams(card, params, narration = '') {
  const contract = NUMERIC_CARD_CONTRACTS[card];
  if (!contract) throw new Error(`没有数值卡契约：${card}`);
  const text=(value,max)=>typeof value==='string' && value.trim().length>0 && [...value].length<=max;
  if (!params || typeof params!=='object' || Array.isArray(params) ||
      Object.keys(params).some(key=>!Object.hasOwn(contract.fields,key)) ||
      !Number.isFinite(params.value) || params.value<0 || params.value>999999 ||
      !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(params.value)) ||
      (contract.maxDigits && String(params.value).replace('.','').length>contract.maxDigits) ||
      !text(params.unit,6) || !text(params.label,12) || !text(params.evidence,500) ||
      /[\r\n]/.test(params.unit+params.label) ||
      !narration.includes(params.evidence) || !params.evidence.includes(params.unit) ||
      ![...params.evidence.matchAll(/[+\-\u2212\uFF0B\uFF0D]?\d+(?:\.\d+)?/g)].some(match=>Number(match[0])===params.value &&
        !/[\d.,eE+\-\u2212\uFF0B\uFF0D]$/.test(params.evidence.slice(0,match.index)) &&
        params.evidence.slice(match.index+match[0].length).trimStart().startsWith(params.unit)))
    throw new Error(`数值卡 ${card} 的数值、单位必须有本镜头原文证据，禁止演示数据或跨镜头引用`);
  return {value:params.value,unit:params.unit,label:params.label,evidence:params.evidence};
}

export function assertNumericCardDuration(card, frames, fps) {
  const contract=NUMERIC_CARD_CONTRACTS[card];
  if (!contract) return;
  const completionFrame=contract.completionFrame ?? Math.ceil((frames-1)*contract.completionRatio);
  if (fps!==contract.fps || !Number.isInteger(frames) || frames<contract.minFrames ||
      frames-1-completionFrame<contract.holdFrames)
    throw new Error(`数值卡 ${card} 需要30fps且至少${contract.minFrames}帧，短版尚未验收`);
}
