import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {analyzeCard} from './source-analysis.mjs';
import {fieldRole,policyFor} from './policies.mjs';
import {validateCatalogCalls} from './validation.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const ledgerFile=path.resolve(directory,'../b-talkcraft-target1/ledger.json');
const sha256=value=>createHash('sha256').update(value).digest('hex');

export function buildCatalog() {
  const raw=fs.readFileSync(ledgerFile);
  const ledger=JSON.parse(raw);
  const dependencies=JSON.parse(fs.readFileSync(path.resolve(directory,'../b-talkcraft-target1/source-dependencies.json')));
  const manifest=JSON.parse(fs.readFileSync(path.resolve(directory,'../b-talkcraft-target1/checks.json'))).sourceManifest;
  const dependencyMap=new Map(dependencies.map(d=>[path.resolve(d.file),d]));
  const hashes=new Map(manifest.map(d=>[path.resolve(d.file),d.sha256]));
  const closure=file=>{
    const files=new Set();
    const visit=f=>{f=path.resolve(f);if(files.has(f))return;files.add(f);
      for(const item of dependencyMap.get(f)?.imports ?? []) if(item.resolved) visit(item.resolved);};
    visit(file);return [...files].map(file=>({file,sha256:hashes.get(file) ?? sha256(fs.readFileSync(file))}));
  };
  return {schema:'b-talkcraft-catalog-v1',status:'isolated_contract_pending_main_review',ledgerSha256:sha256(raw),
    notes:['UI schema is preserved as evidence; isolated call rules are separate.',
      'Input validation does not admit a card to production.'],
    cards:ledger.cards.map(card=> {
      const analysis=analyzeCard(card);
      const fields=card.implementation.fields.map(({key,type,label,default:defaultValue,min,max,step,unit,options,declaredType})=>{
        const result=analysis.fields.find(f=>f.key===key);
        const field={key,type,label,default:result?.defaultResult.ok ? result.defaultResult.value : defaultValue,min,max,step,unit,options,declaredType};
        const role=fieldRole(card.slug,field);
        return {...field,role,writable:!['timing','motion','UNCLASSIFIED'].includes(role),
          defaultComputed:!!result?.defaultResult.ok,sourceEvidence:result?.schemaEvidence,
          roleEvidence:result?.references,blankAllowed:(field.default==='' && role!=='media') ||
            (card.slug==='highlighter-sweep' && ['linesBefore','linesAfter'].includes(key)) ||
            // Upstream explicitly documents "empty = no subline" and renders
            // the supplied empty string without substituting demo copy.
            (card.slug==='lead-word-zoom-assemble' && key==='subline')};
      });
      return {cardId:card.slug,name:card.title,semantics:card.documentation.semantics,
      materialDemand:card.documentation.inputs,materialShape:card.documentation.materialShape,
      originalHardcoded:card.original.hardcodedInOriginalIndex,implementation:{
        layer:card.implementation.layer,file:card.implementation.path,export:card.implementation.export,
        component:card.implementation.component,sha256:card.implementation.sha256,
        dependencies:closure(card.implementation.path)},
      original:{file:card.original.path,sha256:card.original.sha256},
      duration:{fps:card.implementation.fps,frames:analysis.duration.ok ? analysis.duration.value : null,
        originalFrames:analysis.originalDuration,sourceFormula:card.implementation.durationInFrames,
        calculation:analysis.duration,comparison:card.conflicts.durationComparison,
        variants:card.slug==='parallel-items-with-host' ? {'single-layout':105,tour:663} :
          card.slug==='still-layout-relay' ? {'hero-duo':254,triptych:224,tour:467} :
          card.slug==='chapter-title-card' ? {'single-chapter':100,'original-demo':201} : null,
        replacementReadingTime:'UNVERIFIED'},
      fields,policy:policyFor(card,analysis,fields),sourceAnalysis:analysis,
      qualification:{sourceMapped:true,registered:card.registration.registered,
        ruleCoverage:fields.every(f=>f.role!=='UNCLASSIFIED'),inputRulesDefined:true,localRender:false,production:false}};
    })};
}

export function validateCalls(input,{projectRoot,catalog=buildCatalog()}={}) {
  return validateCatalogCalls(input,{projectRoot,catalog});
}
