import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GRAPHIC_CONTRACTS} from './graphic-contracts.mjs';
import {admittedGraphicCards} from './card-admission.mjs';
import {readShortAcceptance, shortCapability} from './short-card-admission.mjs';
import {buildSourceAudit} from './card-source-audit.mjs';
import {NUMERIC_CARD_CONTRACTS} from './numeric-card-contracts.mjs';
import {admittedNumericCards} from './numeric-card-admission.mjs';
import {admittedTextCards,readTextCardAdmission} from './text-card-admission.mjs';
import {TEXT_CARD_CONTRACTS} from './text-card-contracts.mjs';
import {LIST_CARD_IDS,LIST_CARD_FIELDS} from './list-card-contracts.mjs';
import {SCREEN_CARD_IDS,SCREEN_CARD_FIELDS} from './screen-card-contracts.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sectionBullets(markdown, heading) {
  const section = markdown.match(new RegExp(`^## ${heading}\\s*$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'))?.[1] || '';
  const bullets = [];
  let continued = false;
  for (const line of section.split(/\r?\n/)) {
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2).trim());
      continued = true;
    } else if (!line.trim()) {
      continued = false;
    } else if (continued) {
      bullets[bullets.length - 1] += ` ${line.trim()}`;
    }
  }
  return bullets;
}

function previewPath(root, url) {
  const relative = String(url || '').split('?')[0].replace(/^\.\//, '');
  if (!relative.startsWith('media/')) throw new Error(`无效卡片预览路径: ${url}`);
  return path.join(root, 'gallery', relative);
}

export function buildCardIndex(root = DEFAULT_ROOT) {
  const sourceAudit=buildSourceAudit(root);
  const sourceCards=new Map(sourceAudit.cards.map(card=>[card.id,card]));
  const graphicAdmitted=admittedGraphicCards(root);
  const numericAdmitted=admittedNumericCards(root);
  const graphicReview=JSON.parse(fs.readFileSync(path.join(root,'director/card-production-admission.json'),'utf8'));
  const numericReview=JSON.parse(fs.readFileSync(path.join(root,'director/numeric-card-production-admission.json'),'utf8'));
  const textAdmitted=admittedTextCards(root);
  const textEntries=new Map((readTextCardAdmission(root)?.cards || []).map(card=>[card.id,card]));
  const shortReport = readShortAcceptance(root);
  const library = JSON.parse(fs.readFileSync(path.join(root, 'gallery', 'api', 'library.json'), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'director', 'template-registry.json'), 'utf8'));
  const contracts = new Map(registry.templates.map(template => [template.shotCard, template]));
  const cards = library.cards.map(card => {
    const id = `${card.category}/${card.name}`;
    const sourceFile = path.join(root, card.source);
    if (!fs.existsSync(sourceFile)) throw new Error(`镜头说明缺失: ${id}`);
    const markdown = fs.readFileSync(sourceFile, 'utf8');
    const poster = `gallery/media/poster/${card.name}.jpg`;
    if (!fs.existsSync(path.join(root, poster))) throw new Error(`镜头海报缺失: ${id}`);
    const previews = card.styles.map(style => {
      const url = style.media?.url;
      if (!url) throw new Error(`镜头预览地址缺失: ${id}/${style.key}`);
      const runtimeId=sourceCards.get(id)?.variants.find(variant=>variant.key===style.key)?.runtimeId;
      return {variant:style.key, label:style.label, description:style.description || '', use:style.use || null,
        runtimeId,
        ...(GRAPHIC_CONTRACTS[runtimeId] ? {businessRuntime:{
          enabled:graphicAdmitted.includes(runtimeId),
          dataSlots:Object.entries(GRAPHIC_CONTRACTS[runtimeId].fields).map(([prop,description])=>({prop,description})),
          graphicParams:GRAPHIC_CONTRACTS[runtimeId].fields,
          acceptedDuration:{frames:graphicAdmitted.includes(runtimeId)?[180]:[],fps:30},
          fps:30,actualModelValidated:false,
          userAcceptance:graphicReview.addedCardAcceptance?.[runtimeId]?.userAcceptance ||
            (graphicAdmitted.includes(runtimeId) ? graphicReview.userVisualAcceptance : 'not-admitted'),
          localVisualReview:graphicAdmitted.includes(runtimeId) ? 'passed' : 'not-admitted',
        }} : {}),
        ...(NUMERIC_CARD_CONTRACTS[runtimeId] ? {businessRuntime:{
          enabled:numericAdmitted.includes(runtimeId),
          dataSlots:Object.entries(NUMERIC_CARD_CONTRACTS[runtimeId].fields).map(([prop,description])=>({prop,description})),
          graphicParams:NUMERIC_CARD_CONTRACTS[runtimeId].fields,
          acceptedDuration:{frames:numericAdmitted.includes(runtimeId)?[180]:[],fps:30},
          fps:30,actualModelValidated:false,
          userAcceptance:numericReview.addedCardAcceptance?.[runtimeId]?.userAcceptance ||
            (numericAdmitted.includes(runtimeId) ? numericReview.userAcceptance : 'not-admitted'),
          localVisualReview:numericAdmitted.includes(runtimeId) ? 'passed' : 'not-admitted',
        }} : {}),
        ...(TEXT_CARD_CONTRACTS[runtimeId] ? {businessRuntime:{enabled:textAdmitted.includes(runtimeId),
          textSlots:TEXT_CARD_CONTRACTS[runtimeId],acceptedDuration:textEntries.get(runtimeId)?.acceptedFrames || [],
          ...(LIST_CARD_IDS.has(runtimeId) ? {dataSlots:LIST_CARD_FIELDS} : {}),
          fps:30,actualModelValidated:false,userAcceptance:textEntries.get(runtimeId)?.userAcceptance || 'not-admitted'}} : {}),
        ...(SCREEN_CARD_IDS.has(runtimeId) ? {businessRuntime:{enabled:false,
          mediaSlots:['真实本地PNG页面截图'],screenParams:SCREEN_CARD_FIELDS[runtimeId],fps:30,
          actualModelValidated:false,userAcceptance:'not-admitted'}} : {}),
        url:`gallery/${url.split('?')[0].replace(/^\.\//, '')}`,
        available:fs.existsSync(previewPath(root, url))};
    });
    const contract = contracts.get(id);
    const motion = sectionBullets(markdown, '动效核心');
    return {
      id, category:card.category, name:card.name, tags:card.tags,
      summary:card.summary, semanticUse:card.use || '', editorialIntent:card.intention || '',
      duration:card.duration || '', energy:card.energy || '',
      shortShot:shortCapability(id, shortReport),
      motionBeats:motion.length ? motion : previews.map(style => style.description).filter(Boolean),
      pitfalls:sectionBullets(markdown, '已知坑'),
      variants:previews, poster, source:card.source,
      sourceSha256:crypto.createHash('sha256').update(markdown).digest('hex'),
      sourceRuntime:sourceCards.get(id),
      runtime:NUMERIC_CARD_CONTRACTS[id] ? {registered:true,enabled:numericAdmitted.includes(id),
        textSlots:[{prop:'title',type:'string',maxLines:1,maxChars:14}],mediaSlots:[],
        dataSlots:Object.entries(NUMERIC_CARD_CONTRACTS[id].fields).map(([prop,description])=>({prop,description})),
        graphicParams:NUMERIC_CARD_CONTRACTS[id].fields,backdropVideo:true,
        minimumDuration:{frames:NUMERIC_CARD_CONTRACTS[id].minFrames,fps:30},
      } : SCREEN_CARD_IDS.has(id) ? {registered:true,enabled:false,
        textSlots:contract?.params?.文字 || [],mediaSlots:['真实本地PNG页面截图'],dataSlots:[],
        screenParams:SCREEN_CARD_FIELDS[id],backdropVideo:true,actualModelValidated:false,userAcceptance:'not-admitted',
      } : GRAPHIC_CONTRACTS[id] ? {registered:true,enabled:admittedGraphicCards(root).includes(id),
        textSlots:contract?.params?.文字 || [{prop:'title',type:'string'}],mediaSlots:[],
        dataSlots:Object.entries(GRAPHIC_CONTRACTS[id].fields).map(([prop,description])=>({prop,description})),
        graphicParams:GRAPHIC_CONTRACTS[id].fields,backdropVideo:true,
      } : textEntries.has(id) ? {
        registered:true,enabled:textAdmitted.includes(id),textAs:contract?.textAs || null,
        textSlots:contract?.params?.文字 || [],mediaSlots:[],dataSlots:[],backdropVideo:true,
        acceptedDuration:{frames:textEntries.get(id).acceptedFrames,fps:30},
        verifiedBusinessInput:textEntries.get(id).validatedLines,
        localVisualReview:textAdmitted.includes(id) ? 'passed' : 'source-or-evidence-mismatch',
        actualModelValidated:false,userAcceptance:textEntries.get(id).userAcceptance,
      } : previews.every(variant=>variant.businessRuntime) ? {
        registered:true,enabled:previews.every(variant=>variant.businessRuntime.enabled),
        exactVariantSelectionRequired:true,variantIds:previews.map(variant=>variant.runtimeId),
        textSlots:[],mediaSlots:[],dataSlots:[],backdropVideo:true,
        acceptedDuration:{frames:previews.every(variant=>variant.businessRuntime.enabled)?[180]:[],fps:30},
        actualModelValidated:false,userAcceptance:'pending',
      } : contract ? {
        registered:true, enabled:contract.enabled === true, textAs:contract.textAs || null,
        textSlots:contract.params?.文字 || [], mediaSlots:contract.params?.图片视频 || [],
        dataSlots:contract.params?.数据 || [], tone:contract.tone || null,
        style:contract.style || null, capacity:contract.capacity || null,
      } : {registered:false, enabled:false, textSlots:[], mediaSlots:[], dataSlots:[]},
      evidence:'source-document-and-preview-manifest',
      visualReview:'pending',
    };
  });
  if (cards.length !== library.stats.cardCount || new Set(cards.map(card => card.id)).size !== cards.length)
    throw new Error('画廊卡片数量或 ID 与源数据不一致');
  return {
    schema:'shotcraft-card-capability-index-v1',
    sourceRevision:library.revision,
    count:cards.length,
    registeredCount:cards.filter(card => card.runtime.registered).length,
    missingPreviewCount:cards.flatMap(card => card.variants).filter(variant => !variant.available).length,
    sourceRuntimeCounts:sourceAudit.counts,
    registrationCountMeaning:'registeredCount is card-level runtime metadata coverage; sourceRuntimeCounts traces actual component exports and adapters',
    cards,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.env.SHOTCRAFT_ROOT || DEFAULT_ROOT;
  const output = path.join(root, 'director', 'card-capability-index.json');
  const index = buildCardIndex(root);
  fs.writeFileSync(output, JSON.stringify(index, null, 2) + '\n', 'utf8');
  console.log(`${index.count} cards indexed; ${index.registeredCount} runtime metadata entries; ${index.sourceRuntimeCounts.resolvedVariants}/${index.sourceRuntimeCounts.variants} source variants resolved`);
}
