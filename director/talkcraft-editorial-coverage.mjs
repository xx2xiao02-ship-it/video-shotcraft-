// Resolve only numbering conflicts with a unique answer in the model's own
// spoken-word design. Never choose a template, rewrite copy or guess a cut.
export const EDITORIAL_COVERAGE_RULES = '句序均从 0 开始，firstSentence/lastSentence 为含首尾范围。首镜从 0 开始，下一镜 firstSentence 必须等于上一镜 lastSentence + 1，末镜结束于最后一句。例：s01=0–0、s02=1–2、s03=3–4；禁止 s01=0–1、s02=1–2。先分配每句唯一归属，再填写本镜 nativePresentation.wordEvents；spoken 事件的 sentenceIndex 必须属于本镜，锚词必须来自对应原句。不要把下一镜要讲的句子重复计入前镜。';

export function reconcileEditorialCoverage(input, semantics) {
  const result = structuredClone(input);
  const report = {schema:'talkcraft-editorial-coverage-v1', passed:false,
    state:'blocked', repairs:[], boundaries:[], issues:[]};
  const blocked = reason => {
    report.issues.push(reason);
    // All-or-nothing: an ambiguous later boundary cannot leave earlier edits.
    report.repairs = [];
    return {result:structuredClone(input), report};
  };
  const sentences = semantics?.sentences;
  if (!Array.isArray(sentences) || !sentences.length ||
      !Array.isArray(result?.sentences) || result.sentences.length !== sentences.length ||
      result.sentences.some((s,i) => s?.i !== i || typeof sentences[i]?.text !== 'string' || s?.text !== sentences[i]?.text))
    return blocked('原稿与模型逐句记录不一致，不能自动恢复镜头句序');
  const shots = result.shots;
  if (!Array.isArray(shots) || !shots.length) return blocked('缺少完整镜头范围');
  for (const [i,s] of shots.entries()) {
    if (s?.id !== `s${String(i+1).padStart(2,'0')}` ||
        !Number.isInteger(s.firstSentence) || !Number.isInteger(s.lastSentence) ||
        s.firstSentence < 0 || s.lastSentence < s.firstSentence || s.lastSentence >= sentences.length)
      return blocked(`镜头 ${s?.id || i+1} 编号或范围无效，不能自动恢复`);
  }
  if (shots[0].firstSentence !== 0 || shots.at(-1).lastSentence !== sentences.length-1)
    return blocked('镜头没有覆盖原稿首尾，不能自动补分句');

  const spoken = shot => {
    const events = shot.nativePresentation?.wordEvents;
    if (!Array.isArray(events)) return null;
    const rows = events.filter(e => e?.role === 'spoken');
    if (!rows.length || rows.some(e => !Number.isInteger(e.sentenceIndex) ||
        e.sentenceIndex < shot.firstSentence || e.sentenceIndex > shot.lastSentence)) return null;
    const indices = [...new Set(rows.map(e => e.sentenceIndex))];
    // Every claimed sentence needs at least one literal source anchor. Other
    // events are preserved for the later, full word-reveal validator to check.
    const anchors = indices.map(i => rows.find(e => e.sentenceIndex === i &&
      typeof e.anchor === 'string' && e.anchor.trim() && sentences[i].text.includes(e.anchor)));
    if (anchors.some(e => !e)) return null;
    return {indices, anchors:anchors.map(e => ({sentenceIndex:e.sentenceIndex, anchor:e.anchor}))};
  };
  const proposed = shots.map(s => ({first:s.firstSentence, last:s.lastSentence}));
  for (let i=0;i<shots.length-1;i++) {
    const left=shots[i], right=shots[i+1];
    if (right.firstSentence > left.lastSentence+1)
      return blocked(`${left.id} 与 ${right.id} 之间漏句，不能自动补分句`);
    if (right.firstSentence === left.lastSentence+1) continue;
    if (right.firstSentence < left.firstSentence || right.lastSentence < left.lastSentence)
      return blocked(`${left.id} 与 ${right.id} 范围倒序，不能自动重排`);
    const a=spoken(left), b=spoken(right);
    if (!a || !b) return blocked(`${left.id} 与 ${right.id} 重叠且缺少可核对的口播锚词，需编导修订`);
    const min=Math.max(left.firstSentence+1, right.firstSentence, ...a.indices.map(n => n+1));
    const max=Math.min(left.lastSentence+1, right.lastSentence, ...b.indices);
    if (min !== max) return blocked(`${left.id} 与 ${right.id} 重叠的句子归属${min>max?'冲突':'有歧义'}，需编导修订`);
    proposed[i].last=min-1;
    proposed[i+1].first=min;
    report.boundaries.push({leftShot:left.id, rightShot:right.id, nextFirstSentence:min,
      evidence:{left:a.anchors, right:b.anchors}});
  }
  for (let i=0;i<shots.length;i++) {
    const s=shots[i], p=proposed[i];
    const events=Array.isArray(s.nativePresentation?.wordEvents) ? s.nativePresentation.wordEvents : [];
    if (p.first>p.last || p.first<s.firstSentence || p.last>s.lastSentence ||
        (i && p.first !== proposed[i-1].last+1) ||
        events.some(e => e?.role==='spoken' && (!Number.isInteger(e.sentenceIndex) ||
          e.sentenceIndex<p.first || e.sentenceIndex>p.last)))
      return blocked(`${s.id} 恢复范围不能保留口播设计，需编导修订`);
  }
  shots.forEach((s,i) => {
    for (const [field,key] of [['firstSentence','first'],['lastSentence','last']]) {
      if (s[field] === proposed[i][key]) continue;
      report.repairs.push({shotId:s.id, field, from:s[field], to:proposed[i][key],
        reason:'按模型已声明且有原文锚词的唯一句子归属恢复连续覆盖'});
      s[field]=proposed[i][key];
    }
  });
  report.passed=true;
  report.state=report.repairs.length?'repaired':'unchanged';
  return {result,report};
}
