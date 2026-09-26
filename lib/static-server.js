import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.wasm': 'application/wasm' };
export function serveStatic(directory, { port = 0, host = '127.0.0.1' } = {}) {
  const root = path.resolve(directory);
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      let pathname;
      try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); }
      catch { res.writeHead(400); res.end('Bad URL'); return; }
      const file = path.resolve(root, '.' + pathname);
      if (pathname.includes('\0') || file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
      const candidates = [file];
      if (!path.extname(file)) candidates.push(file + '.html');
      candidates.push(path.join(file, 'index.html'));
      for (const candidate of candidates) {
        try {
          const stat = await fs.stat(candidate);
          if (!stat.isFile()) continue;
          if (candidate === path.join(file, 'index.html') && !pathname.endsWith('/')) { res.writeHead(302, { Location: encodeURI(pathname) + '/' }); res.end(); return; }
          const data = await fs.readFile(candidate);
          res.writeHead(200, { 'Content-Type': TYPES[path.extname(candidate).toLowerCase()] || 'application/octet-stream', 'Content-Length': data.length, 'Cache-Control': 'no-store' });
          res.end(req.method === 'HEAD' ? undefined : data); return;
        } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) { res.writeHead(500); res.end('Read error'); return; } }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found');
    });
    server.on('error', reject);
    server.listen(port, host, () => resolve({ server, port: server.address().port }));
  });
}
