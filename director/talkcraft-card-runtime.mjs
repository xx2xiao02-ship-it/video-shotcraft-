import {installPresentationCorrections} from './talkcraft-presentation-correction.mjs';
import fs from 'node:fs';
import path from 'node:path';

// A single permitted skin change; keep the rest of the upstream file exact.
export function skinTalkcraftSharedFont(source) {
  const declaration=/export const FONT_STACK\s*=\s*[^;]+;/gu;
  if ([...source.matchAll(declaration)].length!==1) throw new Error('上游公共字体声明已变化，请重新核对字体适配');
  return source.replace(declaration,`export const FONT_STACK = 'var(--sc-font-family, "Microsoft YaHei", sans-serif)';`);
}

// 原卡仍保留；有正式参数化实现时优先，禁止用 demo 默认文案填业务空缺。
export function installTalkcraftCardRuntime(skillRoot, src) {
  const base = path.join(skillRoot, 'workbench', 'src', 'cards');
  const dest = path.join(src, 'parameterized-cards');
  fs.mkdirSync(path.join(dest, 'gen'), {recursive:true});
  for (const name of ['types.ts', 'shared.tsx', 'impact-open-title.tsx','count-badge-title.tsx','highlighter-sweep.tsx','chapter-title-card.tsx']) {
    fs.copyFileSync(path.join(base, name), path.join(dest, name));
  }
  // Skin the copied common font stack. Keep upstream sources and motion untouched.
  const sharedFile = path.join(dest, 'shared.tsx');
  const shared = fs.readFileSync(sharedFile, 'utf8');
  fs.writeFileSync(sharedFile, skinTalkcraftSharedFont(shared));
  const official=new Set(JSON.parse(fs.readFileSync(path.join(skillRoot,'references/cards-index.json'),'utf8')).cards.map(c=>c.slug));
  const generated=fs.readdirSync(path.join(base,'gen')).filter(name=>name.endsWith('.tsx')&&official.has(name.slice(0,-4))).sort();
  for (const name of generated) {
    const source=fs.readFileSync(path.join(base,'gen',name),'utf8');
    fs.writeFileSync(path.join(dest,'gen',name),source.replace(/(["'])@tpl\//g,'$1../../cards/'));
  }
  const index = path.join(src, 'cards', 'index.ts');
  let code = fs.readFileSync(index, 'utf8');
  if (!code.includes('PARAMETERIZED_BINDINGS')) {
    code += `\nimport {impactOpenTitleCard} from '../parameterized-cards/impact-open-title';
import {card as alt} from '../parameterized-cards/gen/alt-block-lines';
import {card as counter} from '../parameterized-cards/gen/number-counter';
import {card as chapter} from '../parameterized-cards/gen/chapter-progress-list';
import {card as lines} from '../parameterized-cards/gen/line-by-line-slide';
import {card as contrast} from '../parameterized-cards/gen/type-contrast-emphasis';
const PARAMETERIZED_BINDINGS = [impactOpenTitleCard, alt, counter, chapter, lines, contrast];
for (const def of PARAMETERIZED_BINDINGS) CARD_REGISTRY[def.id] = def.component;\n`;
    fs.writeFileSync(index, code);
  }
  code=fs.readFileSync(index,'utf8');
  if(!code.includes('FULL_PARAMETERIZED_BINDINGS_V2')){
    const imports=generated.map((name,i)=>`import {card as FullCard${i}} from '../parameterized-cards/gen/${name.slice(0,-4)}';`);
    const cores=[['impact-open-title','impactOpenTitleCard'],['count-badge-title','countBadgeTitleCard'],['highlighter-sweep','highlighterSweepCard'],['chapter-title-card','chapterTitleCardCard']];
    cores.forEach(([name,exp],i)=>imports.push(`import {${exp} as FullCore${i}} from '../parameterized-cards/${name}';`));
    code+=`\n${imports.join('\n')}\nconst FULL_PARAMETERIZED_BINDINGS_V2=[${generated.map((_,i)=>`FullCard${i}`).concat(cores.map((_,i)=>`FullCore${i}`)).join(',')}];\nfor(const def of FULL_PARAMETERIZED_BINDINGS_V2) CARD_REGISTRY[def.id]=def.component;\n`;
    fs.writeFileSync(index,code);
  }
  installPresentationCorrections(skillRoot,src);
}
