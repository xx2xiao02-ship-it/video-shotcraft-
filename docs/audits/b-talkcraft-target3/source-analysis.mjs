import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));
export const root=path.resolve(directory,'../../..');
export const skill=path.join(root,'_audit/video-talkcraft');
const require=createRequire(import.meta.url);
export const ts=require(path.join(skill,'runtime/node_modules/typescript'));
export const parseFile=file=>ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,
  file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
export const walk=(node,fn)=>{fn(node);ts.forEachChild(node,n=>walk(n,fn));};
export const unwrap=node=>{
  while(node && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node))) node=node.expression;
  return node;
};
export const variables=ast=>{
  const result=new Map();
  for(const statement of ast.statements) if(ts.isVariableStatement(statement))
    for(const declaration of statement.declarationList.declarations) {
      if(ts.isIdentifier(declaration.name)) result.set(declaration.name.text,declaration);
      else walk(declaration.name,n=>{if(ts.isBindingElement(n) && ts.isIdentifier(n.name)) result.set(n.name.text,declaration);});
    }
  return result;
};
export const location=(ast,node)=>({file:ast.fileName,line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,text:node.getText(ast)});

// Evaluate only the dependency closure of a metadata expression, with no JSX or module imports.
export function metadata(ast,expression) {
  const vars=variables(ast),functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).filter(n=>n.name).map(n=>[n.name.text,n]));
  const needed=new Set(),declarations=new Map(),external=new Set();
  const collect=node=>walk(node,n=>{
    if(!ts.isIdentifier(n)) return;
    if((ts.isPropertyAccessExpression(n.parent) && n.parent.name===n) ||
       (ts.isPropertyAssignment(n.parent) && n.parent.name===n)) return;
    const name=n.text;
    if((vars.has(name) || functions.has(name)) && !needed.has(name)) {
      needed.add(name);const d=vars.get(name) ?? functions.get(name);declarations.set(name,d);
      collect(ts.isVariableDeclaration(d) ? d.initializer : d);
    }
    if(name==='random') external.add(name);
  });
  collect(expression);
  const ordered=[...new Set(declarations.values())].sort((a,b)=>a.pos-b.pos);
  const selected=ordered.map(n=>ts.isVariableDeclaration(n) ? `const ${n.getText(ast)};` : n.getText(ast)).join('\n');
  const code=ts.transpileModule(selected+`\nJSON.stringify(${expression.getText(ast)});`,
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  let unsafe=false;
  const parsedCode=ts.createSourceFile('metadata.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  walk(parsedCode,n=> {
    if(ts.isIdentifier(n) && ['require','process','fetch','globalThis','eval','Function'].includes(n.text)) unsafe=true;
    if(ts.isPropertyAccessExpression(n) && n.name.text==='constructor') unsafe=true;
    if(ts.isImportDeclaration(n) || ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) unsafe=true;
  });
  if(unsafe)
    return {ok:false,reason:'Metadata dependency includes non-pure API',code};
  let random;
  if(external.has('random')) {
    // The existing installed deterministic PRNG is reused; no browser or component is executed.
    random=require(path.join(skill,'runtime/node_modules/remotion')).random;
  }
  try {
    const value=JSON.parse(vm.runInNewContext(code,{random},{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}}));
    return {ok:true,value,code,evidence:ordered.map(n=>location(ast,n)),usesExistingRemotionRandom:!!random};
  } catch(e) {return {ok:false,reason:e.message,code,evidence:ordered.map(n=>location(ast,n))};}
}

export function analyzeCard(card) {
  const ast=parseFile(card.implementation.path),vars=variables(ast);
  const definition=[...vars.values()].find(n=>n.type?.getText(ast)==='CardDef');
  const def=unwrap(definition?.initializer);
  const properties=new Map(ts.isObjectLiteralExpression(def) ? def.properties.filter(ts.isPropertyAssignment).map(n=>[n.name.getText(ast),n.initializer]) : []);
  const duration=metadata(ast,properties.get('durationInFrames'));
  const originalAst=parseFile(card.original.path),originalMeta=variables(originalAst).get('meta');
  const original=originalMeta ? metadata(originalAst,originalMeta.initializer) : {ok:false,reason:'No meta'};
  const schemaNode=unwrap(properties.get('schema'));
  const fields=ts.isArrayLiteralExpression(schemaNode) ? schemaNode.elements.map(node=>{
    const obj=unwrap(node),p=new Map(obj.properties.filter(ts.isPropertyAssignment).map(n=>[n.name.getText(ast),n.initializer]));
    const key=p.get('key')?.text;
    const defaultResult=metadata(ast,p.get('default'));
    const references=[];
    walk(ast,n=>{
      if(ts.isIdentifier(n) && n.text===key && n.pos<definition.pos &&
        !(ts.isPropertySignature(n.parent) || ts.isBindingElement(n.parent))) references.push(location(ast,n));
    });
    return {key,defaultResult,schemaEvidence:location(ast,node),references};
  }) : [];
  const parsers=[];
  for(const [name,node] of [...vars,...ast.statements.filter(ts.isFunctionDeclaration).filter(n=>n.name).map(n=>[n.name.text,n])])
    if(/^parse/.test(name)) parsers.push({name,evidence:location(ast,node)});
  return {cardId:card.slug,duration,originalDuration:original.ok ? original.value.durationInFrames : null,
    originalMetadataResult:original,fields,parsers,
    sourceIntro:fs.readFileSync(ast.fileName,'utf8').split('\n').slice(0,18).map((text,i)=>({line:i+1,text})),
    capacityEvidence:card.implementation.capacityCodeEvidence};
}
