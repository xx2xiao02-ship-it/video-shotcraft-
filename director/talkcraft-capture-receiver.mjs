import http from 'node:http';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.TALKCRAFT_CAPTURE_PORT || 5260);
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const PNG = Buffer.from([137,80,78,71,13,10,26,10]);
const JPEG = Buffer.from([255,216,255]);

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, {'content-type':'text/html; charset=utf-8'});
    res.end('<!doctype html><title>TalkCraft capture relay</title><p>Local evidence receiver ready.</p>');
    return;
  }
  if (req.method !== 'POST' || req.url !== '/capture' ||
      (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${PORT}`)) {
    res.writeHead(404); res.end(); return;
  }
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) throw new Error('Screenshot exceeds 8 MB');
      chunks.push(chunk);
    }
    const {runId, pmid, imageBase64, layout} = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!RUN_ID.test(runId) || !/^\d{6,10}$/u.test(pmid) ||
        layout?.url !== `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` ||
        layout?.pmid !== pmid || !layout?.title || !layout?.abstract ||
        !Number.isFinite(layout?.targetBox?.x) || !Number.isFinite(layout?.targetBox?.y)) {
      throw new Error('PubMed evidence metadata is invalid');
    }
    const project = path.join(ROOT, 'director', 'b-mode-runs', runId, 'talkcraft');
    if (!existsSync(path.join(project, 'source-run.json'))) throw new Error('TalkCraft run is missing');
    const image = Buffer.from(imageBase64, 'base64');
    const format = image.subarray(0,8).equals(PNG) ? 'png' :
      image.subarray(0,3).equals(JPEG) ? 'jpg' : null;
    if (image.length < 10000 || !format) throw new Error('Screenshot is not a PNG or JPEG');
    const output = path.join(project, 'remotion', 'public', 'pages', `pmid-${pmid}`);
    if (existsSync(output)) throw new Error('Existing evidence capture was preserved');
    mkdirSync(output, {recursive:true});
    writeFileSync(path.join(output, `page.${format}`), image);
    writeFileSync(path.join(output, 'layout.json'), JSON.stringify(layout, null, 2), 'utf8');
    res.writeHead(200, {'content-type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({ok:true, output, bytes:image.length, format}));
  } catch (error) {
    res.writeHead(400, {'content-type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({ok:false, error:String(error.message || error)}));
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`TalkCraft capture relay 127.0.0.1:${PORT}`));
