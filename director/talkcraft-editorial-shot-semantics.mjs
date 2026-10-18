const HARD=new Set(['自我介绍','介绍他人','号召']);

// Same main/sub extraction as upstream card_match.py. Used before any writes
// as well as by the saved-storyboard gate.
export function editorialShotSemantics(sentences,shot){
  const first=Number(shot?.firstSentence),last=Number(shot?.lastSentence);
  const rows=Array.isArray(sentences)&&Number.isInteger(first)&&Number.isInteger(last)?sentences.slice(first,last+1):[];
  const words=[];
  for(const row of rows.filter(r=>r?.weight==='main'))for(const word of row.sem||[])
    if(!words.includes(word))words.push(word);
  for(const row of rows.filter(r=>r?.weight!=='main'))for(const word of row.sem||[])
    if(HARD.has(word)&&!words.includes(word))words.push(word);
  return new Set(words);
}
