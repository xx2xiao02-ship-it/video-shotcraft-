import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';

const projectRoot=path.resolve(import.meta.dirname,'..');
const ts=createRequire(path.join(projectRoot,'template/package.json'))('typescript');
const policyFile='director/text-card-source-binding.mjs';
const registryFiles={
  'template/src/TemplateAdapter.tsx':'COMPONENT_CONTRACTS',
  'director/text-card-contracts.mjs':'TEXT_CARD_CONTRACTS',
};
const evidenceTools=new Set([
  'template/accept-business-text-batch004.mjs','template/cached-still-renderer.mjs',
  'template/inspect-business-text-batch.mjs','template/render-business-text-videos.mjs',
  'template/reuse-business-text-baseline.mjs','template/revalidate-business-text-plans.mjs',
]);
export const sourceHash=value=>crypto.createHash('sha256').update(value).digest('hex');
const printer=ts.createPrinter({removeComments:true,newLine:ts.NewLineKind.LineFeed});
const print=(node,source)=>printer.printNode(ts.EmitHint.Unspecified,node,source);

function literal(node){
  if(ts.isStringLiteral(node)||ts.isNumericLiteral(node)||
    node.kind===ts.SyntaxKind.TrueKeyword||node.kind===ts.SyntaxKind.FalseKeyword) return true;
  return ts.isObjectLiteralExpression(node)&&node.properties.every(property=>
    ts.isPropertyAssignment(property)&&!ts.isComputedPropertyName(property.name)&&literal(property.initializer));
}

// Only static, side-effect-free registry entries may be separated from shared code.
export function registryBinding(file,text,id){
  const name=registryFiles[file];
  if(!name) throw new Error('Unsupported registry: '+file);
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  if(source.parseDiagnostics.length) throw new Error('Invalid registry syntax: '+file);
  const matches=[];
  for(const statement of source.statements) if(ts.isVariableStatement(statement))
    for(const declaration of statement.declarationList.declarations)
      if(ts.isIdentifier(declaration.name)&&declaration.name.text===name) matches.push(declaration);
  if(matches.length!==1) throw new Error('Missing/duplicate registry: '+name);
  const initializer=matches[0].initializer;
  const frozen=file==='director/text-card-contracts.mjs';
  if(frozen&&(!ts.isCallExpression(initializer)||initializer.expression.getText(source)!=='Object.freeze'||initializer.arguments.length!==1))
    throw new Error('Unsupported frozen registry');
  const object=frozen ? initializer.arguments[0] : initializer;
  if(!object||!ts.isObjectLiteralExpression(object)) throw new Error('Registry must be a static object');
  const entries=new Map();
  for(const property of object.properties){
    if(!ts.isPropertyAssignment(property)||!ts.isStringLiteral(property.name)||entries.has(property.name.text))
      throw new Error('Registry contains dynamic or duplicate entries');
    const value=property.initializer;
    const safe=frozen ? ts.isCallExpression(value)&&ts.isIdentifier(value.expression)&&value.expression.text==='spec'&&
      [4,5].includes(value.arguments.length)&&value.arguments.every(literal)&&
      (value.arguments.length===4 || ts.isNumericLiteral(value.arguments[4])) : literal(value);
    if(!safe) throw new Error('Registry entry is not a static contract: '+property.name.text);
    entries.set(property.name.text,property);
  }
  if(!entries.has(id)) throw new Error('Missing exact card contract: '+id);
  const transform=ts.transform(source,[context=>node=>{
    const visit=current=>current===object ? ts.factory.updateObjectLiteralExpression(object,[]) : ts.visitEachChild(current,visit,context);
    return ts.visitNode(node,visit);
  }]);
  try{
    return {sharedSha256:sourceHash(printer.printFile(transform.transformed[0])),
      entrySha256:sourceHash(print(entries.get(id),source))};
  }finally{transform.dispose();}
}

export function bindTextCardSources(root,id,sourceHashes){
  const registries={};
  for(const file of Object.keys(registryFiles)) if(Object.hasOwn(sourceHashes,file))
    registries[file]=registryBinding(file,fs.readFileSync(path.join(root,file),'utf8'),id);
  return {schema:'text-card-scoped-sources-v1',policySha256:sourceHash(fs.readFileSync(path.join(root,policyFile))),
    registries,historicalEvidenceTools:Object.keys(sourceHashes).filter(file=>evidenceTools.has(file))};
}

export function textCardSourcesCurrent(root,item){
  const matches=(file,hash)=>{
    const absolute=path.resolve(root,file);
    return absolute.startsWith(path.resolve(root)+path.sep)&&fs.existsSync(absolute)&&sourceHash(fs.readFileSync(absolute))===hash;
  };
  const hashes=item.sourceHashes||{},binding=item.sourceBinding;
  if(!Object.keys(hashes).length) return false;
  if(!binding) return Object.entries(hashes).every(([file,hash])=>matches(file,hash));
  if(binding.schema!=='text-card-scoped-sources-v1'||!matches(policyFile,binding.policySha256)) return false;
  if(!binding.registries||!Array.isArray(binding.historicalEvidenceTools)) return false;
  if(Object.keys(binding.registries).some(file=>!registryFiles[file]||!Object.hasOwn(hashes,file))) return false;
  if(binding.historicalEvidenceTools.some(file=>!evidenceTools.has(file)||!Object.hasOwn(hashes,file))) return false;
  return Object.entries(hashes).every(([file,hash])=>{
    if(binding.historicalEvidenceTools.includes(file)) return true;
    if(!binding.registries[file]) return matches(file,hash);
    const actual=registryBinding(file,fs.readFileSync(path.join(root,file),'utf8'),item.id),expected=binding.registries[file];
    return actual.sharedSha256===expected.sharedSha256&&actual.entrySha256===expected.entrySha256;
  });
}
