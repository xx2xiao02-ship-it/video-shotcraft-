// 视频外包装 - 独立运行入口（http://127.0.0.1:5270）。
// API 实现全部在 packaging-routes.mjs，主台 8765 通过 console-server 的分发共享同一套；
// 本文件只负责静态页面服务与请求分发，保证无主台时模块仍可单独使用。
import http from 'node:http';
import {existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packagingHandle, PACKAGING_PREFIX} from './packaging-routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PACKAGING_PORT || 5270);
const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.svg':'image/svg+xml', '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8',
};

async function readJsonBody(req, {maxBytes = 2 * 1024 * 1024} = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error(`请求体超过 ${Math.round(maxBytes / 1048576)} MB 上限`);
    chunks.push(chunk);
  }
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function tryServeStatic(res, pathname) {
  const relative = path.relative(ROOT, path.resolve(ROOT, '.' + decodeURIComponent(pathname))).replace(/\\/g, '/');
  if (relative.startsWith('..')) return false;
  const allowed = relative === 'director/packaging-console.html' || relative.startsWith('director/packaging-');
  if (!allowed) return false;
  const file = path.join(ROOT, relative);
  if (!existsSync(file) || !statSync(file).isFile()) return false;
  res.writeHead(200, {'content-type':MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control':'no-store'});
  res.end(readFileSync(file));
  return true;
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  } catch {
    res.writeHead(400, {'content-type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({ok:false, error:'非法 URL'}));
    return;
  }
  try {
    if (req.method === 'GET' && url.pathname === '/' && tryServeStatic(res, '/director/packaging-console.html')) return;
    if (req.method === 'GET' && url.pathname !== '/' && tryServeStatic(res, url.pathname)) return;
    if (url.pathname.startsWith(PACKAGING_PREFIX)) {
      const readJson = req.method === 'POST' ? () => readJsonBody(req) : async () => ({});
      const out = await packagingHandle(req.method, url.pathname, url, readJson);
      res.writeHead(out.status, {'content-type':'application/json; charset=utf-8', 'cache-control':'no-store'});
      res.end(JSON.stringify(out.payload));
      return;
    }
    res.writeHead(404, {'content-type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({ok:false, error:`未知路由 ${req.method} ${url.pathname}`}));
  } catch (error) {
    res.writeHead(400, {'content-type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({ok:false, error:String(error?.message || error)}));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`视频外包装模块已启动: http://127.0.0.1:${PORT}`);
});
