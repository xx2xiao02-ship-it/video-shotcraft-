import fs from 'node:fs';
import path from 'node:path';
import {ts,parseFile,variables,unwrap,walk,metadata} from './source-analysis.mjs';
const name=n=>ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : null;
function propertyMap(node,errors,at) {
  const result=new Map();node=unwrap(node);
  if(!node || !ts.isObjectLiteralExpression(node)){errors.push({code:'UNRESOLVED_MAP',at});return result;}
  for(const p of node.properties) {
    const key=name(p.name),value=ts.isPropertyAssignment(p)?p.initializer:ts.isShorthandPropertyAssignment(p)?p.name:null;
    if(!key || !value){errors.push({code:'UNRESOLVED_ENTRY',at});continue;}
    if(result.has(key))errors.push({code:'DUPLICATE_ENTRY',at:at+'.'+key});
    result.set(key,value);
  }
  return result;
}
export function checkWorkbench(indexFile,{expectedSceneIds}={}) {
  const errors=[],details=[];
  const fail=(code,at)=>errors.push({code,at});
  let ast;try{ast=parseFile(indexFile);}catch(e){return {ok:false,errors:[{code:'INDEX_MISSING',at:indexFile}],details,checked:0,skipped:0};}
  if(ast.parseDiagnostics.length)fail('PARSE_ERROR',indexFile);
  const imported=new Map();
  for(const s of ast.statements) if(ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
    const bindings=s.importClause?.namedBindings;
    if(bindings && ts.isNamedImports(bindings)) for(const item of bindings.elements) {
      const local=item.name.text,exported=item.propertyName?.text ?? local;
      if(imported.has(local))fail('DUPLICATE_IMPORT',local);
      const base=path.resolve(path.dirname(indexFile),s.moduleSpecifier.text);
      const file=[base,base+'.tsx',base+'.ts',path.join(base,'index.ts')].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
      imported.set(local,{exported,file});
    }
  }
  const vars=variables(ast);
  const registryExports=new Set();
  for(const s of ast.statements)if(ts.isVariableStatement(s)&&s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))
    for(const d of s.declarationList.declarations)if(ts.isIdentifier(d.name))registryExports.add(d.name.text);
  for(const key of ['SCENES','SCENE_PARAMS'])if(!registryExports.has(key))fail('REGISTRY_EXPORT_MISSING',key);
  const scenes=propertyMap(vars.get('SCENES')?.initializer,errors,'SCENES');
  const params=propertyMap(vars.get('SCENE_PARAMS')?.initializer,errors,'SCENE_PARAMS');
  const wanted=expectedSceneIds ?? [...scenes.keys()];
  if(!wanted.length)fail('NO_SCENES',indexFile);
  for(const id of new Set([...wanted,...scenes.keys(),...params.keys()])) {
    const before=errors.length,detail={id,ok:false,checked:true,fields:0};details.push(detail);
    if(!wanted.includes(id) || !scenes.has(id) || !params.has(id)){fail('SCENE_CARDINALITY',id);continue;}
    const sceneNode=unwrap(scenes.get(id)),paramNode=unwrap(params.get(id));
    const scene=sceneNode&&ts.isIdentifier(sceneNode)?imported.get(sceneNode.text):null;
    const param=paramNode&&ts.isIdentifier(paramNode)?imported.get(paramNode.text):null;
    if(!scene?.file || !param?.file || scene.file!==param.file || param.exported!=='PARAMS') {fail('IMPORT_BINDING',id);continue;}
    detail.file=scene.file;detail.sceneExport=scene.exported;detail.paramsAlias=paramNode.text;
    const source=parseFile(scene.file),localVars=variables(source);
    if(source.parseDiagnostics.length)fail('PARSE_ERROR',scene.file);
    const exported=new Set();
    for(const s of source.statements) if(s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)) {
      if(ts.isVariableStatement(s))for(const d of s.declarationList.declarations)if(ts.isIdentifier(d.name))exported.add(d.name.text);
      if(ts.isFunctionDeclaration(s)&&s.name)exported.add(s.name.text);
    }
    if(!exported.has('PARAMS') || !exported.has(scene.exported))fail('EXPORT_MISSING',id);
    const declaration=localVars.get('PARAMS'),value=declaration?metadata(source,declaration.initializer):{ok:false};
    const paramAst=unwrap(declaration?.initializer);
    if(!paramAst || !ts.isArrayLiteralExpression(paramAst))fail('PARAMS_LITERAL_REQUIRED',id);
    else for(const fieldAst of paramAst.elements) propertyMap(fieldAst,errors,id+'.PARAMS');
    if(!value.ok || !Array.isArray(value.value)){fail('PARAMS_UNRESOLVED',id);continue;}
    const keys=new Set();
    for(const field of value.value) {
      const where=id+'.'+field?.key;
      if(!field || typeof field.key!=='string' || !field.key || typeof field.label!=='string' || !field.label ||
        !['text','textarea','number','slider','color','select','boolean'].includes(field.type)){fail('PARAM_FIELD_SHAPE',where);continue;}
      if(keys.has(field.key))fail('PARAM_DUPLICATE_KEY',where);keys.add(field.key);
      const expected=['number','slider'].includes(field.type)?'number':field.type==='boolean'?'boolean':'string';
      if(typeof field.default!==expected || (expected==='number'&&!Number.isFinite(field.default)))fail('PARAM_DEFAULT_TYPE',where);
      const allowed=['type','key','label','default',...(['number','slider'].includes(field.type)?['min','max','step','unit']:[]),...(field.type==='select'?['options']:[])];
      if(Object.keys(field).some(k=>!allowed.includes(k)))fail('PARAM_UNKNOWN_FIELD',where);
      if(field.type==='slider' && !['min','max','step'].every(k=>Number.isFinite(field[k])))fail('PARAM_SLIDER_BOUNDS',where);
      for(const k of ['min','max','step']) if(field[k]!==undefined&&!Number.isFinite(field[k]))fail('PARAM_BOUND_TYPE',where);
      if(field.min>field.max || field.step<=0 || field.default<field.min || field.default>field.max)fail('PARAM_RANGE',where);
      if(field.type==='color'&&!/^#[a-f\d]{6}$/i.test(field.default))fail('PARAM_COLOR',where);
      if(field.type==='select' && (!Array.isArray(field.options)||!field.options.length||
        field.options.some(o=>typeof o.value!=='string'||typeof o.label!=='string')||
        new Set(field.options.map(o=>o.value)).size!==field.options.length||!field.options.some(o=>o.value===field.default)))fail('PARAM_OPTIONS',where);
    }
    detail.fields=value.value.length;
    const useParamsNames=new Set();
    for(const s of source.statements)if(ts.isImportDeclaration(s)&&/\/(?:params)$/.test(s.moduleSpecifier.text)) {
      const b=s.importClause?.namedBindings;
      if(b&&ts.isNamedImports(b))for(const n of b.elements)if((n.propertyName?.text??n.name.text)==='useParams')useParamsNames.add(n.name.text);
    }
    const component=localVars.get(scene.exported)?.initializer ?? source.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text===scene.exported);
    let bound=false,consumed=false;
    if(component)walk(component,n=>{
      if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&useParamsNames.has(n.expression.text)&&n.arguments.length===2&&
        n.arguments[0].getText(source)==='shot.id'&&ts.isIdentifier(n.arguments[1])&&n.arguments[1].text==='PARAMS') {
        let ancestor=n.parent,nested=false;
        while(ancestor&&ancestor!==component){if(ts.isArrowFunction(ancestor)||ts.isFunctionExpression(ancestor)||ts.isFunctionDeclaration(ancestor))nested=true;ancestor=ancestor.parent;}
        if(!nested && ts.isVariableDeclaration(n.parent)&&ts.isIdentifier(n.parent.name)) {
          bound=true;const tainted=new Set([n.parent.name.text]);
          for(let iteration=0;iteration<10;iteration++)walk(component,ref=>{
            if(!ts.isVariableDeclaration(ref)||!ts.isIdentifier(ref.name)||!ref.initializer)return;
            let depends=false;walk(ref.initializer,x=>{if(ts.isIdentifier(x)&&tainted.has(x.text))depends=true;});
            if(depends)tainted.add(ref.name.text);
          });
          walk(component,ref=>{
            if(!ts.isIdentifier(ref)||!tainted.has(ref.text))return;
            let parent=ref.parent;
            while(parent&&parent!==component){
              if(ts.isJsxExpression(parent)||ts.isJsxSpreadAttribute(parent)){consumed=true;break;}
              parent=parent.parent;
            }
          });
        }
      }
    });
    if(!bound)fail('USE_PARAMS_BINDING',id);
    if(!consumed)fail('PARAMS_NOT_CONSUMED',id);
    detail.ok=errors.length===before;
  }
  return {ok:errors.length===0,errors,details,checked:details.length,skipped:0,scope:'AST_only_no_runtime'};
}
