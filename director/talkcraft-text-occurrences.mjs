// Empty normalized labels have no searchable characters. In particular,
// String.indexOf('', length + 1) returns length and cannot advance a loop.
export function* textOccurrences(content,text){
  if(!text.length)return;
  for(let at=content.indexOf(text);at>=0;at=content.indexOf(text,at+1))yield at;
}
