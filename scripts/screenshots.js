import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { chromium } from 'playwright';
import vercelChromium from '@sparticuz/chromium';

const CACHE_DIR = '.cache/thumbs';
const THUMBS_DIR = 'thumbs';
const CONCURRENCY = 3;

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev';
const FORCE_FIRECRAWL = process.env.FIRECRAWL_FORCE === '1';

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

async function resolvePublicBaseUrl(port) {
  if (process.env.PUBLIC_URL) {
    return { url: process.env.PUBLIC_URL.replace(/\/$/, ''), tunnel: null };
  }
  if (process.env.VERCEL_URL) {
    return { url: `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`, tunnel: null };
  }
    // 本地开发：如果显式开启 localtunnel，则暴露服务供 Firecrawl 截图
  if (process.env.FIRECRAWL_TUNNEL === '1') {
    try {
      const { default: localtunnel } = await import('localtunnel');
      const tunnel = await Promise.race([
        localtunnel({ port }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('localtunnel 启动超时')), 15000)
        )
      ]);
      return { url: tunnel.url, tunnel };
    } catch (err) {
      console.warn(`⚠️ localtunnel 启动失败，将回退到本地 Playwright: ${err.message}`);
    }
  }
  return { url: null, tunnel: null };
}

async function captureWithFirecrawl(publicBaseUrl, route, outputPath) {
  const targetUrl = publicBaseUrl + route;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${FIRECRAWL_API_URL}/v1/scrape`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ['screenshot']
      })
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`Firecrawl API ${response.status}: ${errData.error || response.statusText}`);
    }

    const data = await response.json();
    const screenshotUrl = data.data?.screenshot;
    if (!screenshotUrl) {
      throw new Error('Firecrawl 未返回截图 URL');
    }

    const imgResponse = await fetch(screenshotUrl);
    if (!imgResponse.ok) {
      throw new Error(`下载截图失败: ${imgResponse.status}`);
    }

    fs.writeFileSync(outputPath, Buffer.from(await imgResponse.arrayBuffer()));
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function captureWithPlaywright(page, route, publicDir, cacheDir) {
  const routeBase = route.replace(/^\//, '') || 'index';
  const thumbName = sanitizeFilename(routeBase) + '.png';
  const thumbPath = path.join(publicDir, THUMBS_DIR, thumbName);
  const cacheThumbPath = path.join(cacheDir, thumbName);

  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });

  await page.goto(`http://localhost:${process.env.HTMLPPT_PORT}${route}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: thumbPath, fullPage: false, type: 'png' });

  // Copy to cache
  fs.mkdirSync(path.dirname(cacheThumbPath), { recursive: true });
  fs.copyFileSync(thumbPath, cacheThumbPath);

  return `/${THUMBS_DIR}/${thumbName}`;
}

async function processBatchWithFirecrawl(publicBaseUrl, presentations, publicDir, cacheDir) {
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
        await captureWithFirecrawl(publicBaseUrl, p.route, thumbPath);
        fs.writeFileSync(hashFile, hash);
        return { route: p.route, thumbnailUrl: thumbUrl, ok: true, cached: false };
      } catch (err) {
        console.warn(`⚠️ Firecrawl 截图失败: ${p.route} - ${err.message}`);
        return { route: p.route, thumbnailUrl: null, ok: false, cached: false };
      }
    }));
    results.push(...batchResults);
  }

  return results;
}

async function processBatchWithPlaywright(context, server, port, presentations, publicDir, cacheDir) {
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

      let page;
      try {
        page = await context.newPage();
        const url = await captureWithPlaywright(page, p.route, publicDir, cacheDir);
        fs.writeFileSync(hashFile, hash);
        return { route: p.route, thumbnailUrl: url, ok: true, cached: false };
      } catch (err) {
        console.warn(`⚠️ 截图失败: ${p.route} - ${err.message}`);
        return { route: p.route, thumbnailUrl: null, ok: false, cached: false };
      } finally {
        if (page) await page.close();
      }
    }));
    results.push(...batchResults);
  }

  return results;
}

async function launchLocalBrowser() {
  const launchOptions = process.env.VERCEL
    ? {
        args: vercelChromium.args,
        executablePath: await vercelChromium.executablePath(),
        headless: true,
      }
    : {
        headless: process.env.HTMLPPT_HEADLESS !== '0',
      };
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });
  return { browser, context };
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
  let tunnel;
  let results;

  try {
    ({ server, port } = await serveStatic(publicDir));

    let publicBaseUrl;
    let useFirecrawl = false;

    if (FIRECRAWL_API_KEY && process.env.USE_FIRECRAWL !== '0') {
      const resolved = await resolvePublicBaseUrl(port);
      publicBaseUrl = resolved.url;
      tunnel = resolved.tunnel;
      if (publicBaseUrl) {
        useFirecrawl = true;
        console.log(`📸 使用 Firecrawl API 截图，公网地址: ${publicBaseUrl}`);
      } else if (FORCE_FIRECRAWL) {
        throw new Error('FIRECRAWL_FORCE=1 但未配置可用的公网地址（PUBLIC_URL / VERCEL_URL / localtunnel）');
      }
    }

    if (useFirecrawl) {
      results = await processBatchWithFirecrawl(publicBaseUrl, presentations, publicDir, cacheDir);
    } else {
      ({ browser, context } = await launchLocalBrowser());
      results = await processBatchWithPlaywright(context, server, port, presentations, publicDir, cacheDir);
    }
  } catch (err) {
    console.warn(`⚠️ 截图环境不可用，跳过缩略图生成: ${err.message}`);
    results = presentations.map(p => ({ route: p.route, thumbnailUrl: null, ok: false, cached: false }));
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (tunnel) tunnel.close?.().catch(() => {});
    if (server) await new Promise((resolve) => server.close(resolve));
  }

  for (const r of results) {
    if (r.ok && !r.cached) {
      console.log(`✓ ${r.route} → ${r.thumbnailUrl}`);
    }
  }

  return results;
}
