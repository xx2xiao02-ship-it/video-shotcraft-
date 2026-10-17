// Empty normalized labels have no searchable characters. In particular,
// String.indexOf('', length + 1) returns length and cannot advance a loop.
// Shared by planning, compiled word events and the browser wrapper. Pipes are
// card DSL separators, not displayed copy. Voice/timestamp normalization stays separate.
export const normalizeVisibleText=value=>String(value??'').replace(/[\s*|｜・，。！？：；、,.!?;:「」《》“”‘’]/gu,'');
export const isPictogram=value=>{
  const text=String(value??'').replace(/\s/gu,'');
  return /\p{Extended_Pictographic}/u.test(text)&&
    !text.replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]/gu,'');
};
export function* textOccurrences(content,text){
  if(!text.length)return;
  for(let at=content.indexOf(text);at>=0;at=content.indexOf(text,at+1))yield at;
}
// Punctuation inside one matched phrase shares its reveal time and color.
// Keep separators between different events, emoji and other content untouched.
export function includeMatchedPunctuation(text,positions){
  const result=new Map(positions),offsets=[...positions.keys()].sort((a,b)=>a-b);
  for(let i=1;i<offsets.length;i++){
    const left=offsets[i-1],right=offsets[i],id=positions.get(left);
    if(right>left+1&&id===positions.get(right)&&/^[\p{P}\p{Z}\s]+$/u.test(text.slice(left+1,right)))
      for(let at=left+1;at<right;at++)result.set(at,id);
  }
  return result;
}
