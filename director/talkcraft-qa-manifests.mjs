import {createRequire} from 'node:module';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {talkcraftProject} from './talkcraft-status.mjs';
import {assertTalkcraftCardCallsBound, readTalkcraftCardCalls} from './talkcraft-card-calls.mjs';

const json = file => JSON.parse(readFileSync(file,'utf8'));

function literal(node, ts) {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    return -Number(node.operand.text);
  }
  return undefined;
}

export function parseCueSource(source, ts) {
  const file = ts.createSourceFile('sfx.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  let initializer = null;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'CUES') {
      initializer = node.initializer;
    }
    ts.forEachChild(node,visit);
  };
  visit(file);
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) throw new Error('src/sfx.ts 没有 CUES 数组');
  const cues = initializer.elements.map(element => {
    if (!ts.isObjectLiteralExpression(element)) throw new Error('CUES 必须是对象数组');
    const values = {};
    for (const property of element.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = property.name.getText(file).replace(/^['"]|['"]$/gu,'');
      values[name] = literal(property.initializer,ts);
    }
    if (!Number.isFinite(values.t) || typeof values.file !== 'string' ||
        !Number.isFinite(values.volume) || values.volume < 0 || values.volume > 1 ||
        (values.rate !== undefined && (!Number.isFinite(values.rate) || values.rate <= 0 || values.rate > 4)) ||
        (values.clip !== undefined && (!Number.isFinite(values.clip) || values.clip <= 0))) {
      throw new Error('CUES 条目必须包含有效的 t、file、volume');
    }
    return {t:values.t,file:values.file,volume:values.volume,
      ...(values.rate === undefined ? {} : {rate:values.rate}),
      ...(values.clip === undefined ? {} : {clip:values.clip})};
  });
  return cues.sort((a,b) => a.t-b.t);
}

export function parseCardsFromShotbook(markdown, skillRoot) {
  const byShot = {};
  let shotId = null;
  for (const line of markdown.split(/\r?\n/u)) {
    const heading = /^#{2,}\s+(S\d{2})\b/u.exec(line);
    if (heading) {
      shotId = heading[1].toLowerCase();
      byShot[shotId] ||= [];
      continue;
    }
    if (!shotId) continue;
    const selectedAt=line.indexOf('选卡行');
    const skinAt=line.indexOf('蒙皮行');
    let cardText='';
    if (selectedAt >= 0) cardText=line.slice(selectedAt+'选卡行'.length).replace(/^[：:]\s*/u,'');
    else if (skinAt >= 0) {
      cardText=line.slice(skinAt+'蒙皮行'.length).replace(/^[：:]\s*/u,'').split('→',1)[0];
    } else continue;
    const candidates = cardText.match(/[a-z0-9]+(?:-[a-z0-9]+)+/gu) || [];
    for (const slug of candidates) {
      if (existsSync(path.join(skillRoot,'template','cards',`${slug}.tsx`)) && !byShot[shotId].includes(slug)) {
        byShot[shotId].push(slug);
      }
    }
  }
  const slugs = [...new Set(Object.values(byShot).flat())];
  if (!slugs.length) throw new Error('SHOTBOOK 没有可识别的选卡行');
  return {slugs,byShot};
}

export function anchorsFromBeats(beats) {
  const burstPattern = /转折|结论|强调词|引用|金句|章节|号召|结尾/u;
  const labels = new Set();
  return beats.map((beat,index) => {
    const label = String(beat.label || `beat-${String(index+1).padStart(2,'0')}`);
    if (!/^[A-Za-z0-9_-]+$/u.test(label) || labels.has(label)) throw new Error(`锚点 label 非法或重复：${label}`);
    labels.add(label);
    const anchor={t:Number(beat.t),label,burst:burstPattern.test(String(beat.what || ''))};
    if (label === 'beat-19') anchor.crop='540:200:1230:140';
    return anchor;
  });
}

function writeJson(file,data) {
  writeFileSync(file,JSON.stringify(data,null,2)+'\n','utf8');
}

export function writeTalkcraftQaManifests(root,runId,skillRootOverride) {
  const project = talkcraftProject(root,runId);
  const remotion = path.join(project,'remotion');
  const skillRoot = skillRootOverride || resolveTalkcraftSkillRoot(root);
  const require = createRequire(path.join(skillRoot,'runtime','package.json'));
  const ts = require('typescript');
  const shots = json(path.join(remotion,'shots.json'));
  const savedCalls = readTalkcraftCardCalls(root,runId);
  let cards;
  if (savedCalls.present) {
    const binding = assertTalkcraftCardCallsBound(root,skillRoot,runId);
    const byShot = {};
    for (const call of binding.record.calls) byShot[call.shotId] = [call.cardId];
    cards = {slugs:[...new Set(binding.record.calls.map(call => call.cardId))],byShot};
  } else {
    cards = parseCardsFromShotbook(readFileSync(path.join(project,'SHOTBOOK.md'),'utf8'),skillRoot);
    const missingShotCards = shots.map(shot => shot.id).filter(id => !cards.byShot[id]?.length);
    if (missingShotCards.length) throw new Error(`SHOTBOOK 没有选卡登记：${missingShotCards.join(', ')}`);
    const missingCopies = cards.slugs.filter(slug => !existsSync(path.join(remotion,'src','cards',`${slug}.tsx`)));
    if (missingCopies.length) throw new Error(`工程未复制这些卡片源码：${missingCopies.join(', ')}`);
  }

  const cues = parseCueSource(readFileSync(path.join(remotion,'src','sfx.ts'),'utf8'),ts);
  for (const cue of cues) {
    if (path.basename(cue.file) !== cue.file || !existsSync(path.join(remotion,'public','sfx',cue.file))) {
      throw new Error(`音效文件不存在或路径非法：${cue.file}`);
    }
  }
  const anchors = anchorsFromBeats(json(path.join(remotion,'beats.json')));
  const cardsUsed = {schema:'talkcraft-cards-used-v1',slugs:cards.slugs,byShot:cards.byShot};
  const outputs = {
    'cues.json':cues,
    'cards-used.json':cardsUsed,
    'anchors.json':anchors,
  };
  for (const [name,data] of Object.entries(outputs)) writeJson(path.join(remotion,name),data);
  return Object.keys(outputs).map(name => path.join(remotion,name));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root=path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
  const runId=process.argv[3] || '';
  console.log(JSON.stringify(writeTalkcraftQaManifests(root,runId),null,2));
}
