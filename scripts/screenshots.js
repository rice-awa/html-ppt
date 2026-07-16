import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { chromium } from 'playwright';

const CACHE_DIR = '.cache/thumbs';
const THUMBS_DIR = 'thumbs';
const CONCURRENCY = 3;

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function serveStatic(root, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);

      const tryRead = (target) => new Promise((res) => {
        fs.readFile(target, (err, data) => res({ err, data, target }));
      });

      (async () => {
        let { err, data, target } = await tryRead(filePath);
        // cleanUrls fallback: /route -> /route.html
        if (err && !path.extname(filePath)) {
          ({ err, data, target } = await tryRead(filePath + '.html'));
        }
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(target);
        const ct = {
          '.html': 'text/html',
          '.css': 'text/css',
          '.js': 'application/javascript',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml'
        }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ct });
        res.end(data);
      })();
    });
    server.listen(port, () => resolve(server));
    server.on('error', reject);
  });
}

async function capture(page, route, publicDir, cacheDir) {
  const routeBase = route.replace(/^\//, '') || 'index';
  const thumbName = sanitizeFilename(routeBase) + '.png';
  const thumbPath = path.join(publicDir, THUMBS_DIR, thumbName);
  const cacheThumbPath = path.join(cacheDir, thumbName);

  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`http://localhost:${process.env.HTMLPPT_PORT}${route}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: thumbPath, fullPage: false, type: 'png' });

  // Copy to cache
  fs.mkdirSync(path.dirname(cacheThumbPath), { recursive: true });
  fs.copyFileSync(thumbPath, cacheThumbPath);

  return `/${THUMBS_DIR}/${thumbName}`;
}

async function processBatch(browser, server, port, presentations, publicDir, cacheDir) {
  process.env.HTMLPPT_PORT = String(port);
  const results = [];

  for (let i = 0; i < presentations.length; i += CONCURRENCY) {
    const batch = presentations.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async (p) => {
      const sourcePath = p.sourcePath;
      const hash = sha256(sourcePath);
      const hashFile = path.join(cacheDir, `${sanitizeFilename(p.file)}.hash`);
      const cachedThumbName = `${sanitizeFilename(p.route.replace(/^\//, '') || 'index')}.png`;
      const cachedThumbPath = path.join(cacheDir, cachedThumbName);
      const thumbPath = path.join(publicDir, THUMBS_DIR, cachedThumbName);
      const thumbUrl = `/${THUMBS_DIR}/${cachedThumbName}`;

      fs.mkdirSync(path.dirname(thumbPath), { recursive: true });

      if (fs.existsSync(hashFile) && fs.existsSync(cachedThumbPath) && fs.readFileSync(hashFile, 'utf-8') === hash) {
        fs.copyFileSync(cachedThumbPath, thumbPath);
        return { route: p.route, thumbnailUrl: thumbUrl, ok: true, cached: true };
      }

      try {
        const page = await browser.newPage();
        const url = await capture(page, p.route, publicDir, cacheDir);
        await page.close();
        fs.writeFileSync(hashFile, hash);
        return { route: p.route, thumbnailUrl: url, ok: true, cached: false };
      } catch (err) {
        console.warn(`⚠️ 截图失败: ${p.route} - ${err.message}`);
        return { route: p.route, thumbnailUrl: null, ok: false };
      }
    }));
    results.push(...batchResults);
  }

  return results;
}

export default async function screenshots(presentations, { publicDir } = {}) {
  publicDir = publicDir || 'public';
  const cacheDir = CACHE_DIR;

  if (process.env.SKIP_SCREENSHOTS === '1') {
    return presentations.map(p => ({ route: p.route, thumbnailUrl: null, ok: false }));
  }

  fs.mkdirSync(cacheDir, { recursive: true });

  const port = await new Promise((resolve) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

  const server = await serveStatic(publicDir, port);
  const browser = await chromium.launch({ headless: true });

  let results;
  try {
    results = await processBatch(browser, server, port, presentations, publicDir, cacheDir);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  for (const r of results) {
    if (r.ok && !r.cached) {
      console.log(`✓ ${r.route} → ${r.thumbnailUrl}`);
    }
  }

  return results;
}
