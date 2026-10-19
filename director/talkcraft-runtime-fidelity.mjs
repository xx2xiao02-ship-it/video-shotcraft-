import {repairPresentationSource} from './talkcraft-presentation-correction.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {canonicalCardId, loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {skinTalkcraftSharedFont} from './talkcraft-card-runtime.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const within = (base, file) => {
  const rel = path.relative(base, file);
  return rel !== '..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel) ? rel : null;
};

export function assertTalkcraftRuntimeFidelity(project, {skillRoot, cardIds} = {}) {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  skillRoot ||= resolveTalkcraftSkillRoot(root);
  const src=path.resolve(project,'remotion/src');
  const catalog=loadTalkcraftGovernedCatalog(JSON.parse(fs.readFileSync(path.join(skillRoot,'references/cards-index.json'),'utf8')));
  const requestedRaw=cardIds || JSON.parse(fs.readFileSync(path.join(project,'remotion/shots.json'),'utf8')).map(shot=>shot.shotCard);
  const requested=requestedRaw.map(id=>canonicalCardId(id,catalog));
  if(!requested.length || requested.some(id=>typeof id!=='string'||!id))throw Error('模板保真检查缺少明确选卡');
  const req=createRequire(path.join(skillRoot,'runtime/package.json'));
  const ts=req('typescript');
  const index=ts.createSourceFile('index.ts',fs.readFileSync(path.join(src,'cards/index.ts'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const imports=new Map();let bindings=null;let installed=false;
  for(const statement of index.statements){
    if(ts.isImportDeclaration(statement) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)){
      for(const item of statement.importClause.namedBindings.elements)imports.set(item.name.text,{module:statement.moduleSpecifier.text,export:item.propertyName?.text || item.name.text});
    }
    if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations){
      if(ts.isIdentifier(declaration.name)&&declaration.name.text==='FULL_PARAMETERIZED_BINDINGS_V2'&&declaration.initializer&&ts.isArrayLiteralExpression(declaration.initializer)){
        bindings=declaration.initializer.elements.map(item=>ts.isIdentifier(item)?imports.get(item.text):null);
      }
    }
    // 验证实际覆盖注册语句，不能仅靠文件里出现标记字符串。
    if(ts.isForOfStatement(statement)&&statement.expression.getText(index)==='FULL_PARAMETERIZED_BINDINGS_V2'){
      const code=statement.statement.getText(index).replace(/\s/gu,'');
      installed=code==='CARD_REGISTRY[def.id]=def.component;' || code==='{CARD_REGISTRY[def.id]=def.component;}';
    }
  }
  if(!bindings || bindings.some(item=>!item) || !installed)throw Error('正式参数化模板注册无法对账');
  const byFile=new Map(bindings.map(item=>[path.resolve(src,'cards',item.module)+'.tsx',item.export]));
  const cards=[];const cache=new Map();
  const source=(file)=>{if(!cache.has(file))cache.set(file,fs.readFileSync(file));return cache.get(file);};
  for(const id of new Set(requested)){
    const card=catalog.cards.find(card=>card.cardId===id);
    if(!card)throw Error(`治理目录不存在正式模板：${id}`);
    const implRel=within(path.join(skillRoot,'workbench/src/cards'),card.implementation.file);
    if(!implRel)throw Error(`模板 ${id} 的实现不是当前 B 来源：${card.implementation.file}`);
    // catalog implementation paths include .tsx; imports omit the extension.
    const implRuntime=path.join(src,'parameterized-cards',implRel);
    if(byFile.get(implRuntime)!==card.implementation.export)throw Error(`模板 ${id} 未注册治理确定的精确实现/导出（期望 ${implRuntime} -> ${card.implementation.export}，已登记 ${[...byFile.keys()].find(key=>key.endsWith(path.basename(implRuntime))) || '无'} -> ${byFile.get([...byFile.keys()].find(key=>key.endsWith(path.basename(implRuntime))) || '') || '无'}）`);
    const files=[];
    for(const dep of card.implementation.dependencies){
      const bytes=source(dep.file);const sourceSha256=hash(bytes);
      if(sourceSha256!==dep.sha256)throw Error(`模板 ${id} 的治理来源已改变：${dep.file}`);
      const workbenchRel=within(path.join(skillRoot,'workbench/src/cards'),dep.file);
      const originalRel=within(path.join(skillRoot,'template/cards'),dep.file);
      const relative=workbenchRel===null ? originalRel : workbenchRel;
      if(relative===null)throw Error(`模板 ${id} 的依赖复制位置尚未核验：${dep.file}`);
      const destination=path.join(src,workbenchRel===null?'cards':'parameterized-cards',relative);
      let translated=workbenchRel?.startsWith('gen'+path.sep) ? Buffer.from(bytes.toString('utf8').replace(/(["'])@tpl\//g,'$1../../cards/')) : bytes;
      let transform=workbenchRel?.startsWith('gen'+path.sep)?'literal_@tpl_import_rebase':'byte_copy';
      if(workbenchRel==='shared.tsx' && hash(source(destination))!==sourceSha256){
        translated=Buffer.from(skinTalkcraftSharedFont(bytes.toString('utf8')));
        transform='shared_font_skin_v1';
      }
      if(relative.endsWith('.tsx')){
        const repaired=repairPresentationSource(translated.toString('utf8'),workbenchRel?.startsWith('gen'+path.sep)?workbenchRel.replaceAll('\\','/'):relative.replaceAll('\\','/'));
        if(repaired!==translated.toString('utf8')){translated=Buffer.from(repaired);transform+=';presentation_repair_v1';}
      }
      const expectedSha256=hash(translated),runtimeSha256=hash(source(destination));
      if(runtimeSha256!==expectedSha256)throw Error(`模板 ${id} 的运行时源码或依赖被改写：${destination}`);
      files.push({source:dep.file,destination,sourceSha256,runtimeSha256,transform});
    }
    const implementation=source(card.implementation.file).toString('utf8');
    const original=source(card.original.file).toString('utf8');
    cards.push({cardId:id,implementation:card.implementation.file,export:card.implementation.export,files,
      hostSlot:{usesSharedSilhouette:/<HostSilhouette\b/u.test(implementation),hasInlineSilhouette:/className=["']wb-host-silhouette/u.test(implementation),
        originalMentionsHostSrc:/\bhostSrc\b/u.test(original),declaredHostMedia:Object.keys(card.policy.media).filter(key=>/host|person|avatar/iu.test(key))}});
  }
  return {schema:'talkcraft-runtime-fidelity-v1',sourceIntegrityPassed:true,visualAccepted:false,productionAdmitted:false,cards};
}
