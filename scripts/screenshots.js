import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { chromium } from 'playwright';

const CACHE_DIR = '.cache/thumbs';
const ASSETS_THUMBS_DIR = 'assets/thumbs';
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

function serveStatic(root) {
  return new Promise((resolve, reject) => {
    const rootPath = path.resolve(root);
    const server = http.createServer((req, res) => {
      const rawPath = decodeURIComponent(req.url.split('?')[0]);
      const relPath = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
      if (relPath.includes('\0')) {
        res.writeHead(400);
        res.end('Bad request');
        return;
      }
      const filePath = path.resolve(rootPath, relPath);
      if (filePath !== rootPath && !filePath.startsWith(rootPath + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const tryRead = (target) => new Promise((res) => {
        fs.readFile(target, (err, data) => res({ err, data, target }));
      });

      (async () => {
        let { err, data, target } = await tryRead(filePath);
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
          '.webp': 'image/webp',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml'
        }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ct });
        res.end(data);
      })();
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

// This Playwright build only outputs png/jpeg, so capture png in memory and
// re-encode to webp using Chromium's native canvas encoder (zero extra deps).
async function pngToWebp(context, pngBuffer) {
  const page = await context.newPage();
  try {
    const dataUrl = await page.evaluate(async (b64) => {
      const img = new Image();
      img.decoding = 'async';
      const bytes = atob(b64);
      const buf = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
      img.src = URL.createObjectURL(new Blob([buf], { type: 'image/png' }));
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      return canvas.toDataURL('image/webp');
    }, pngBuffer.toString('base64'));
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  } finally {
    await page.close().catch(() => {});
  }
}

async function captureWithPlaywright(context, route, publicDir, cacheDir) {
  const routeBase = route.replace(/^\//, '') || 'index';
  const thumbName = sanitizeFilename(routeBase) + '.webp';
  const thumbPath = path.join(publicDir, THUMBS_DIR, thumbName);
  const cacheThumbPath = path.join(cacheDir, thumbName);
  const assetsThumbPath = path.join(ASSETS_THUMBS_DIR, thumbName);

  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });

  const page = await context.newPage();
  try {
    await page.goto(`http://localhost:${process.env.HTMLPPT_PORT}${route}`, { waitUntil: 'networkidle' });

    const png = await page.screenshot({ fullPage: false, type: 'png' });
    const webp = await pngToWebp(context, png);
    fs.writeFileSync(thumbPath, webp);
  } finally {
    await page.close().catch(() => {});
  }

  fs.mkdirSync(path.dirname(cacheThumbPath), { recursive: true });
  fs.copyFileSync(thumbPath, cacheThumbPath);

  fs.mkdirSync(path.dirname(assetsThumbPath), { recursive: true });
  fs.copyFileSync(thumbPath, assetsThumbPath);

  return `/${THUMBS_DIR}/${thumbName}`;
}

async function processBatch(context, port, presentations, publicDir, cacheDir) {
  process.env.HTMLPPT_PORT = String(port);
  const results = [];

  for (let i = 0; i < presentations.length; i += CONCURRENCY) {
    const batch = presentations.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async (p) => {
      const sourcePath = p.sourcePath;
      const hash = sha256(sourcePath);
      const hashFile = path.join(cacheDir, `${sanitizeFilename(p.file)}.hash`);
      const cachedThumbName = `${sanitizeFilename(p.route.replace(/^\//, '') || 'index')}.webp`;
      const cachedThumbPath = path.join(cacheDir, cachedThumbName);
      const thumbPath = path.join(publicDir, THUMBS_DIR, cachedThumbName);
      const thumbUrl = `/${THUMBS_DIR}/${cachedThumbName}`;

      fs.mkdirSync(path.dirname(thumbPath), { recursive: true });

      if (fs.existsSync(hashFile) && fs.existsSync(cachedThumbPath) && fs.readFileSync(hashFile, 'utf-8') === hash) {
        fs.copyFileSync(cachedThumbPath, thumbPath);
        return { route: p.route, thumbnailUrl: thumbUrl, ok: true, cached: true };
      }

      try {
        const url = await captureWithPlaywright(context, p.route, publicDir, cacheDir);
        fs.writeFileSync(hashFile, hash);
        return { route: p.route, thumbnailUrl: url, ok: true, cached: false };
      } catch (err) {
        console.warn(`⚠️ 截图失败: ${p.route} - ${err.message}`);
        return { route: p.route, thumbnailUrl: null, ok: false, cached: false };
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

  let server;
  let port;
  let browser;
  let context;
  let results;

  try {
    ({ server, port } = await serveStatic(publicDir));
    const launchOptions = {
      headless: process.env.HTMLPPT_HEADLESS !== '0',
    };
    browser = await chromium.launch(launchOptions);
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1
    });
    results = await processBatch(context, port, presentations, publicDir, cacheDir);
  } catch (err) {
    console.warn(`⚠️ 截图环境不可用，跳过缩略图生成: ${err.message}`);
    results = presentations.map(p => ({ route: p.route, thumbnailUrl: null, ok: false, cached: false }));
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise((resolve) => server.close(resolve));
  }

  for (const r of results) {
    if (r.ok && !r.cached) {
      console.log(`✓ ${r.route} → ${r.thumbnailUrl}`);
    }
  }

  return results;
}
