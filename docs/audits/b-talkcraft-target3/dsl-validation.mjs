const finite=value=>value!=='' && Number.isFinite(Number(value));
const positive=value=>finite(value) && Number(value)>0;
export function validateDsl(field,value,rule,defaultValue) {
  const errors=[];
  if(typeof value!=='string') return errors;
  const rows=value.split('\n');
  if(rows.some(row=>!row.trim())) errors.push('EMPTY_ROW');
  if(rows.length<rule.minRows || (rule.maxRows!==null && rows.length>rule.maxRows)) errors.push('ROW_CAPACITY');
  if(rule.firstRowMaxChars && [...rows[0]].length>rule.firstRowMaxChars) errors.push('FIRST_ROW_CAPACITY');
  const parts=rows.map(row=>row.split('|').map(x=>x.trim())),seen=new Set();
  if(rule.fixedColumns?.length && typeof defaultValue==='string' && rows.length!==defaultValue.split('\n').length)
    errors.push('EMBEDDED_MOTION_CHANGED');
  for(const [index,p] of parts.entries()) {
    const exact=(n)=>p.length===n && p.every(Boolean);
    let valid=true;
    switch(rule.syntax) {
      case 'label-number':case 'label-number-hot':
        valid=(p.length===2 || (rule.syntax==='label-number-hot' && p.length===3 && p[2]==='hot')) &&
          !!p[0] && finite(p[1]) && Number(p[1])>=0;
        if(seen.has(p[0])) errors.push('DUPLICATE_DATA_LABEL');seen.add(p[0]);break;
      case 'chapter':valid=(exact(2) || (exact(3) && p[2]==='current'));break;
      case 'messages':valid=(p.length===2 || p.length===3) && ['me','them'].includes(p[0]) && !!p[1];break;
      case 'toggle-rows':valid=exact(2) || (exact(3) && p[2]==='on');break;
      case 'dim-lines':valid=p.length===1 || (p.length===2 && p[0]==='dim' && !!p[1]);break;
      case 'timed-log':valid=p.length>=3 && rule.kinds.includes(p[0]) && finite(p[1]) && Number(p[1])>=0 && !!p.slice(2).join('|');break;
      case 'bubbles':valid=exact(3) && p[1].split(',').length===2 && p[1].split(',').every(finite) && ['强调','灰深','灰中','灰浅'].includes(p[2]);break;
      case 'document':
        valid=(p[0]==='h' && exact(2)) || (['mark','stop'].includes(p[0]) && p.length===3 && !!p[1]) ||
          (p[0]==='bars' && exact(2) && p[1].split(',').every(s=>/^(?:lt)?\d+(?:\.\d+)?$/.test(s) && Number(s.replace('lt',''))>=0 && Number(s.replace('lt',''))<=100));break;
      case 'table':valid=p.length>=2 && p.every(Boolean);break;
      case 'icon-label-sub':case 'triple':valid=exact(3);break;
      case 'label-sub':valid=p.length===2 && !!p[0] && !!p[1];break;
      case 'point-pairs':{const v=p[0].split(',');valid=p.length===1 && v.length===2 && v.every(finite);break;}
      case 'axis-labels':valid=exact(2) && finite(p[0]);break;
      case 'bands':valid=exact(3) && finite(p[0]) && positive(p[1]);break;
      case 'pins':valid=((index===0 && p.length===3) || (index>0 && p.length===5)) && finite(p[0]) && finite(p[1]) && !!p[2] && p.slice(3).every(finite);break;
      case 'mock-shots':valid=exact(6) && ['browser','chat','pay'].includes(p[0]) && p.slice(1).every(finite) && positive(p[3]) && positive(p[4]);break;
      case 'news':valid=exact(8) && finite(p[3]) && Number.isInteger(Number(p[3])) && Number(p[3])>=0 && p.slice(4).every(finite) && positive(p[6]);break;
      case 'steps':valid=p.length===1 ? !!p[0] : exact(2);break;
      case 'boxes':{const v=p[0].split(',');valid=p.length===1 && v.length===4 && v.every(finite) && positive(v[2]) && positive(v[3]);break;}
      case 'shape-bars':valid=(p.length===3 || (p.length===4 && p[3]==='hot')) && !!p[0] && !!p[1] && positive(p[2]);break;
      case 'anchored-words':valid=(p.length===2 || (p.length===3 && ['serif','color'].includes(p[2]))) && !!p[0] && finite(p[1]) && Number(p[1])>=0;break;
      default:valid=!!rows[index].trim();
    }
    if(!valid) errors.push('DATA_FORMAT');
    if(rule.fixedColumns?.length && typeof defaultValue==='string') {
      const prior=defaultValue.split('\n')[index]?.split('|').map(s=>s.trim());
      for(const column of rule.fixedColumns) if(!prior || p[column]!==prior[column]) errors.push('EMBEDDED_MOTION_CHANGED');
    }
  }
  if(rule.syntax==='bubbles' && parts.filter(p=>p[2]==='强调').length>1) errors.push('MULTIPLE_ACCENT_BUBBLES');
  if(rule.syntax==='chapter' && parts.filter(p=>p[2]==='current').length!==1) errors.push('CHAPTER_CURRENT_COUNT');
  return [...new Set(errors)];
}

export function crossFieldChecks(card,props) {
  const errors=[],id=card.cardId;
  const rows=key=>typeof props[key]==='string' ? props[key].split('\n') : [];
  const n=(key)=>rows(key).length;
  const fail=code=>errors.push(code);
  if(id==='word-relay-filmstrip' && (n('labels')!==n('verbs')+1 || n('srcs')!==n('labels'))) fail('MEDIA_TEXT_CARDINALITY');
  if(id==='doc-park-left-pill-deal' && (n('pills')!==3 || n('notes')!==3)) fail('PILL_NOTE_CARDINALITY');
  if(id==='scanline-annotate' && n('targets')!==n('labels')) fail('TARGET_LABEL_CARDINALITY');
  if(id==='chip-grid-single-select' && (!Number.isInteger(props.selected) || props.selected<1 || props.selected>n('options'))) fail('SELECTION_RANGE');
  if(id==='lead-word-zoom-assemble' && (!Number.isInteger(props.accentIndex) || props.accentIndex< -2 || props.accentIndex>=n('words'))) fail('SELECTION_RANGE');
  if(id==='sway-parallax' && (!Number.isInteger(props.hiStep) || props.hiStep<0 || props.hiStep>=n('stepsDsl'))) fail('SELECTION_RANGE');
  if(id==='countdown-arc-scatter') {
    const list=typeof props.numbers==='string' ? props.numbers.split(/[,，\s]+/).filter(Boolean) : [];
    if(!list.length || !list.every(x=>/^\d+$/.test(x)) || !list.some(x=>Number(x)===props.pick) ||
      list.some((x,i)=>i>0 && Number(list[i-1])-Number(x)!==1)) fail('COUNTDOWN_MEMBERSHIP');
  }
  if(id==='unit-grid-proportion' && (!Number.isInteger(props.target) || props.target<0 || props.target>100)) fail('GRID_PERCENT_RANGE');
  if(id==='scanline-annotate') {
    const boxes=rows('targets').map(r=>r.split(',').map(Number));
    if(boxes.some((box,i)=>i>0 && box[1]<boxes[i-1][1])) fail('BOX_ORDER');
  }
  if(id==='line-chart-story-draw') {
    const points=key=>rows(key).map(r=>r.split(',').map(Number));
    const same=(a,b)=>a?.length===2 && b?.length===2 && a.every((x,i)=>x===b[i]);
    if(!same(points('historyPts').at(-1),points('seg1Pts')[0]) || !same(points('seg1Pts').at(-1),points('seg2Pts')[0]) ||
      !same(points('historyPts').at(-1),points('altPts')[0])) fail('LINE_CONTINUITY');
  }
  if(id==='parallel-items-with-host' && props.layout==='tour') fail('PREVIEW_ONLY_VARIANT');
  if(id==='still-layout-relay' && props.layout==='tour') fail('PREVIEW_ONLY_VARIANT');
  return errors;
}
