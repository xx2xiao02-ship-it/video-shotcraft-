import fs from 'node:fs';
import {ts,variables,metadata} from './source-analysis.mjs';
const expressions={
  'chat-gpt':p=>`buildSchedule(${p('prompt')},${p('reply')},${p('typeStart')},${p('cps')}).total+0.4`,
  'chat-message-flow':p=>`buildSchedule(parseMessages(${p('messages')}),${p('leadIn')},${p('msgGap')}).total+0.4`,
  'claude-code':p=>`buildSchedule(${p('prompt')},parseLines(${p('logLines')}),${p('typeStart')},${p('cps')}).total+0.4`,
  'terminal-typing-log':p=>`buildSchedule(parseLines(${p('lines')}),${p('lead')},${p('lineDelay')},${p('hover')}).total+0.4`,
  'glass-code-walk':p=>`buildLayout(${p('code')},${p('fontSize')},${p('posY')},${p('dwell')},0).total+0.4`,
  'typewriter-reveal':p=>`buildTimeline(${p('line1')},${p('line2')},${p('startDelay')}).loopAt+2`,
};
export function replacementSchedule(card,props) {
  if(!expressions[card.cardId]) return {ok:true,frames:card.duration.variants?.[props.layout] ?? card.duration.frames,
    unit:'frames',fps:card.duration.fps,mode:'registered_fixed',readingTimeVerified:false};
  const expression=expressions[card.cardId](key=>JSON.stringify(props[key]));
  const code=fs.readFileSync(card.implementation.file,'utf8')+`\nconst __auditSchedule=Math.round((${expression})*30);`;
  const ast=ts.createSourceFile(card.implementation.file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const result=metadata(ast,variables(ast).get('__auditSchedule').initializer);
  if(!result.ok || !Number.isFinite(result.value)) return {ok:false,reason:result.reason ?? 'Nonfinite schedule',expression};
  return {ok:true,frames:result.value,fps:30,unit:'frames',mode:'source_pure_schedule',expression,
    evidence:result.evidence,readingTimeVerified:false};
}
