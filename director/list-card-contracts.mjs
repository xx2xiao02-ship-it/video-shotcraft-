export const LIST_CARD_IDS=new Set(['data/scroll-brake-moves/changelog-scroll-brake','data/scroll-brake-moves/brake-reticle-lock']);
export const LIST_CARD_FIELDS={rows:'8至40项{id,title,detail,tag}，唯一ID；title最多40字、detail最多16字、tag最多8字',targetId:'必须存在的目标行ID',focusLabel:'旁弹说明，最多8字；不能伪造版本或状态'};
export function validateListCardParams(id,params){
  if(!LIST_CARD_IDS.has(id)) return undefined;
  const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&[...value].length<=max&&!/[\r\n]/.test(value);
  if(!params||Object.keys(params).some(key=>!Object.hasOwn(LIST_CARD_FIELDS,key))||
    !Array.isArray(params.rows)||params.rows.length<8||params.rows.length>40||
    params.rows.some(row=>!row||Object.keys(row).some(key=>!['id','title','detail','tag'].includes(key))||
      !text(row.id,120)||!text(row.title,40)||!text(row.detail,16)||!text(row.tag,8))||
    new Set(params.rows.map(row=>row.id)).size!==params.rows.length||
    !params.rows.some(row=>row.id===params.targetId)||!text(params.focusLabel,8))
    throw new Error('长列表需要8至40项真实完整记录、唯一ID和存在的停点；禁止复制占位或丢字段');
  const target=params.rows.findIndex(row=>row.id===params.targetId);
  if(target<4||target>=params.rows.length-1) throw new Error('长卷停点至少在第五行，且需保留后一行上下文');
  return {rows:params.rows.map(row=>({...row})),targetId:params.targetId,focusLabel:params.focusLabel};
}
