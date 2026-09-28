import {createRequire} from 'node:module';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

export async function capturePubmedEvidence(root, runId, pmid, phrase) {
  if (!RUN_ID.test(runId) || !/^\d{6,10}$/u.test(pmid) || !phrase || phrase.length > 120) {
    throw new Error('Invalid TalkCraft run, PMID, or target phrase');
  }
  const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  if (!existsSync(path.join(project, 'source-run.json'))) throw new Error('TalkCraft run does not exist');
  const output = path.join(project, 'remotion', 'public', 'pages', `pmid-${pmid}`);
  if (existsSync(output)) throw new Error('Existing evidence capture was preserved');
  const packageName = process.env.TALKCRAFT_PLAYWRIGHT_PATH || 'playwright';
  const {chromium} = require(packageName);
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.TALKCRAFT_CHROME || 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:900}, deviceScaleFactor:2,
      locale:'en-US', colorScheme:'light'});
    const page = await context.newPage();
    const url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
    await page.goto(url, {waitUntil:'domcontentloaded', timeout:45000});
    await page.locator('main h1').first().waitFor({state:'visible', timeout:15000});
    await page.locator('#eng-abstract').waitFor({state:'visible', timeout:15000});
    const evidence = await page.evaluate((wanted) => {
      const title = document.querySelector('main h1');
      const abstract = document.querySelector('#eng-abstract');
      const paragraph = abstract?.querySelector('p');
      if (!title || !abstract || !paragraph) return null;
      const box = (element) => {
        const r=element.getBoundingClientRect();
        return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height};
      };
      const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
      const nodes=[];
      let text='';
      while (walker.nextNode()) {
        const node=walker.currentNode;
        nodes.push({node,start:text.length,end:text.length+node.textContent.length});
        text+=node.textContent;
      }
      const start=text.toLowerCase().indexOf(wanted.toLowerCase());
      if (start<0) return {title:title.textContent.trim(),abstract:text.trim(),titleBox:box(title),
        abstractBox:box(abstract),targetBox:null};
      const end=start+wanted.length;
      const first=nodes.find(item=>item.end>start);
      const last=nodes.find(item=>item.end>=end);
      if (!first || !last) return null;
      const range=document.createRange();
      range.setStart(first.node,start-first.start);
      range.setEnd(last.node,end-last.start);
      const r=range.getBoundingClientRect();
      return {title:title.textContent.trim(),abstract:text.trim(),titleBox:box(title),
        abstractBox:box(abstract),targetBox:{x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height}};
    }, phrase);
    if (!evidence || !evidence.title || evidence.abstract.length < 180 || !evidence.targetBox) {
      throw new Error('PubMed article or requested phrase was not visible; no screenshot was saved');
    }
    mkdirSync(output, {recursive:true});
    await page.screenshot({path:path.join(output, 'page.png'), fullPage:true, animations:'disabled'});
    writeFileSync(path.join(output, 'layout.json'), JSON.stringify({schema:'talkcraft-pubmed-layout-v1',
      url, pmid, phrase, viewport:{width:1440,height:900,deviceScaleFactor:2}, ...evidence}, null, 2), 'utf8');
    return {output, title:evidence.title, targetBox:evidence.targetBox};
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await capturePubmedEvidence(ROOT, process.argv[2] || '',
    process.argv[3] || '', process.argv[4] || ''), null, 2));
}
