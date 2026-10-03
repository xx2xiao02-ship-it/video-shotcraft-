import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {GRAPHIC_CONTRACTS,BUSINESS_CARD_CONTRACTS} from './graphic-contracts.mjs';
import {admittedGraphicCards} from './card-admission.mjs';
import {readShortAcceptance, shortCapability} from './short-card-admission.mjs';
import {CARD_VARIANT_ALIASES} from './card-variant-aliases.mjs';
import {NUMERIC_CARD_CONTRACTS} from './numeric-card-contracts.mjs';
import {admittedNumericCards} from './numeric-card-admission.mjs';
import {admittedTextCards,readTextCardAdmission} from './text-card-admission.mjs';
import {admittedBusinessDataCards,readBusinessDataAdmission} from './business-data-admission.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(ROOT, 'template/package.json'));
const ts = require('typescript');
const slash = value => value.replaceAll('\\', '/');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function parse(root, relative) {
  const content = fs.readFileSync(path.join(root, relative), 'utf8');
  return ts.createSourceFile(relative, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function variables(source) {
  const found = new Map();
  for (const statement of source.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations)
      if (ts.isIdentifier(declaration.name)) found.set(declaration.name.text, declaration);
  }
  return found;
}

function objectEntries(source, name) {
  const initializer = variables(source).get(name)?.initializer;
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) throw new Error(`Missing static object: ${name}`);
  return initializer.properties.map(property => {
    if (!ts.isPropertyAssignment(property)) throw new Error(`Non-static entry in ${name}`);
    return [property.name.text, property.initializer];
  });
}

function literal(node) {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
    if (!ts.isPropertyAssignment(property)) throw new Error('Unsupported contract expression');
    return [property.name.text, literal(property.initializer)];
  }));
  throw new Error(`Unsupported contract literal: ${node.getText()}`);
}

function componentInfo(root, relative, exported) {
  const source = parse(root, relative);
  const declaration = variables(source).get(exported);
  if (!declaration || !source.statements.some(statement => ts.isVariableStatement(statement) &&
      statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
      [...statement.declarationList.declarations].includes(declaration)))
    throw new Error(`Missing source export: ${relative}#${exported}`);
  const types = new Map(source.statements.filter(ts.isTypeAliasDeclaration).map(node => [node.name.text, node.type]));
  const propsType = declaration.type?.typeArguments?.[0];
  const resolved = propsType && ts.isTypeReferenceNode(propsType) ? types.get(propsType.typeName.getText()) : propsType;
  const props = resolved && ts.isTypeLiteralNode(resolved) ? resolved.members.filter(ts.isPropertySignature).map(member => ({
    name:member.name.text, type:member.type?.getText(source) || 'unknown', optional:Boolean(member.questionToken),
  })) : [];
  const durations = [...variables(source)].filter(([name,node]) => /_(DURATION|DUR)$/.test(name) &&
    node.initializer && ts.isNumericLiteral(node.initializer)).map(([name,node]) => ({name,frames:Number(node.initializer.text),fps:30}));
  const textNodes = [];
  const mediaReferences = [];
  function visit(node) {
    if (ts.isJsxText(node) && node.text.trim()) textNodes.push(node.text.trim());
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'staticFile')
      mediaReferences.push(node.arguments[0]?.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  return {file:relative,export:exported,sha256:hash(source.text),props,durations,
    literalJsxText:[...new Set(textNodes)],staticMediaReferences:[...new Set(mediaReferences)],
    skinDeclared:props.some(prop => prop.name === 'skin'),
    aspectAwareness:source.text.includes('useVideoConfig') || source.text.includes('DesignStage'),
    evidence:'typescript-ast; declarations are not visual acceptance'};
}

export function buildSourceAudit(root = ROOT) {
  const library = JSON.parse(fs.readFileSync(path.join(root, 'gallery/api/library.json'), 'utf8'));
  const runtimeSource = parse(root, 'template/src/DynamicVideo.tsx');
  const adapterSource = parse(root, 'template/src/TemplateAdapter.tsx');
  const imports = new Map();
  for (const statement of runtimeSource.statements) if (ts.isImportDeclaration(statement)) {
    const names = statement.importClause?.namedBindings;
    if (names && ts.isNamedImports(names)) for (const specifier of names.elements) {
      const base = path.resolve(root, 'template/src', statement.moduleSpecifier.text);
      const filename = ['.tsx','.ts',''].map(extension => base + extension).find(fs.existsSync);
      if (filename) imports.set(specifier.name.text, {file:slash(path.relative(root,filename)),export:(specifier.propertyName || specifier.name).text});
    }
  }
  const adapters = new Map(objectEntries(adapterSource, 'COMPONENT_CONTRACTS').map(([id,node]) => [id,literal(node)]));
  const registrations = objectEntries(runtimeSource, 'COMPONENT_MAP').map(([id,node]) => {
    const imported = imports.get(node.getText(runtimeSource));
    if (!imported) throw new Error(`Unresolved runtime import: ${id}`);
    return {id,...componentInfo(root,imported.file,imported.export),adapter:adapters.get(id) || null};
  });
  const graphicAdmitted=admittedGraphicCards(root),numericAdmitted=admittedNumericCards(root);
  const textAdmitted=admittedTextCards(root);
  const textReview=readTextCardAdmission(root);
  const businessDataAdmitted=admittedBusinessDataCards(root);
  const businessDataReview=readBusinessDataAdmission(root);
  const admitted = [...graphicAdmitted,...numericAdmitted,...textAdmitted];
  const admissionRecord=file=>{
    try {return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));} catch {return {};}
  };
  const graphicReview=admissionRecord('director/card-production-admission.json');
  const numericReview=admissionRecord('director/numeric-card-production-admission.json');
  const short = readShortAcceptance(root);
  const shortAdmitted=new Set((short?.cards || []).filter(card=>card.status==='accepted').map(card=>card.id));
  const cards = library.cards.map(card => {
    const id = `${card.category}/${card.name}`;
    const source = fs.readFileSync(path.join(root,card.source),'utf8');
    // Ownership follows the actual import directory, including known category aliases.
    const referenceImplementation = source.split('## 参考实现')[1] || '';
    const referenceExports = new Set(referenceImplementation.match(/[A-Za-z][A-Za-z0-9_]*\.tsx\b/g) || []);
    const owned = registrations.filter(registration => slash(path.dirname(registration.file)).endsWith(`/${card.category}/${card.name}`) ||
      referenceExports.has(`${registration.export}.tsx`));
    const variants = card.styles.map(style => {
      const exact = owned.filter(registration => registration.id === `${id}/${style.key}` ||
        (registration.id === id && card.styles.length === 1));
      const alias = CARD_VARIANT_ALIASES[`${id}:${style.key}`];
      if (alias && !owned.some(registration=>registration.id===alias)) throw new Error(`Variant alias lost its source: ${id}:${style.key}`);
      const candidate = alias ? owned.filter(registration=>registration.id===alias) : exact.length ? exact : owned.filter(registration => registration.id.split('/').at(-1) === style.key);
      const selected = candidate.length === 1 ? candidate[0] : null;
      const preview = `gallery/${style.media.url.split('?')[0].replace(/^\.\//,'')}`;
      const blockers = [];
      const warnings = [];
      if (!selected) blockers.push('variant-source-reconciliation-required');
      if (selected && (!selected.adapter || selected.adapter.enabled === false)) blockers.push('business-adapter-missing-or-disabled');
      if (selected?.adapter) {
        for (const prop of [...Object.values(selected.adapter.propsMap),...Object.values(selected.adapter.paramsMap || {})]) if (!selected.props.some(field => field.name === prop)) {
          if (prop === 'durationInFrames') warnings.push('duration-from-remotion-context; explicit prop unused');
          else blockers.push(`adapter-prop-not-declared:${prop}`);
        }
        if (!selected.skinDeclared) blockers.push('theme-and-backdrop-not-parameterized');
      }
      if (!fs.existsSync(path.join(root,preview))) blockers.push('gallery-preview-missing');
      const longUserAcceptance=businessDataAdmitted.includes(selected?.id)
        ? businessDataReview.cards?.includes(selected.id) ? businessDataReview.userVisualAcceptance || 'pending' : 'pending' :
        graphicAdmitted.includes(selected?.id)
        ? graphicReview.addedCardAcceptance?.[selected?.id]?.userAcceptance || graphicReview.userVisualAcceptance || 'pending' :
        numericAdmitted.includes(selected?.id) ? numericReview.addedCardAcceptance?.[selected.id]?.userAcceptance || numericReview.userAcceptance || 'pending' :
          textAdmitted.includes(selected?.id) ? textReview.cards.find(item=>item.id===selected.id)?.userAcceptance || 'pending' : 'not-admitted';
      const shortUserAcceptance=shortAdmitted.has(selected?.id) ? short.userVisualReview || 'pending' : 'not-admitted';
      const userStages=[longUserAcceptance,shortUserAcceptance].filter(stage=>stage!=='not-admitted');
      return {key:style.key,label:style.label,semanticUse:style.use || card.use,
        description:style.description,preview,previewAvailable:fs.existsSync(path.join(root,preview)),
        runtimeId:selected?.id || null,component:selected || null,candidateRuntimeIds:owned.map(item => item.id),
        mappingEvidence:alias ? {method:'reviewed-explicit-alias',source:card.source,aliasFile:'director/card-variant-aliases.mjs'} : {method:selected ? 'exact-runtime-id' : 'unresolved'},
        structuredDataContract:GRAPHIC_CONTRACTS[selected?.id] || BUSINESS_CARD_CONTRACTS[selected?.id] || NUMERIC_CARD_CONTRACTS[selected?.id] || null,
        shortShot:shortCapability(selected?.id || id,short),
        status:{implemented:Boolean(selected?.adapter && selected.adapter.enabled !== false),
          locallyTested:selected ? admitted.includes(selected.id) || businessDataAdmitted.includes(selected.id) || shortAdmitted.has(selected.id) : false,
          longVersionAdmitted:selected ? admitted.includes(selected.id) || businessDataAdmitted.includes(selected.id) : false,
          acceptedLongFrames:textAdmitted.includes(selected?.id) ? [180] : null,
          shortVersionAdmitted:selected ? shortAdmitted.has(selected.id) : false,
          actualModelValidated:false,userAcceptance:userStages.length && userStages.every(stage=>stage==='passed') ? 'passed' : 'pending',
          longUserAcceptance,shortUserAcceptance},
        blockers,warnings,layoutValidation:'pending',readingHoldValidation:'pending'};
    });
    return {id,source:card.source,sourceSha256:hash(source),semanticUse:card.use,summary:card.summary,
      durationStatement:card.duration,variants,ownedRuntimeIds:owned.map(item => item.id)};
  });
  if (cards.length !== library.stats.cardCount || cards.flatMap(card=>card.variants).length !== library.stats.styleCount)
    throw new Error('Gallery 1:1 cardinality violation');
  return {schema:'shotcraft-card-source-audit-v1',sourceRevision:library.revision,
    counts:{cards:cards.length,variants:cards.flatMap(card=>card.variants).length,runtimeRegistrations:registrations.length,
      resolvedVariants:cards.flatMap(card=>card.variants).filter(variant=>variant.component).length,
      adapterDeclaredVariants:cards.flatMap(card=>card.variants).filter(variant=>variant.status.implemented).length},
    productionEntry:{composition:'DynamicVideo',runtime:'template/src/DynamicVideo.tsx',adapter:'template/src/TemplateAdapter.tsx',
      renderPreflight:'director/a-mode-render-preflight.mjs'},cards,registrations};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = buildSourceAudit();
  fs.writeFileSync(path.join(ROOT,'director/card-source-audit.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.counts));
}
