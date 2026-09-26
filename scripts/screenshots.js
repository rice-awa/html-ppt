import fs from 'node:fs';
import path from 'node:path';
import { serveStatic } from '../lib/static-server.js';

// PNG -> WebP via Chromium's canvas encoder; no additional image dependency.
async function encodeWebp(context, png) {
  const page = await context.newPage();
  try {
    const url = await page.evaluate(async base64 => {
      const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0); return canvas.toDataURL('image/webp', 0.85);
    }, png.toString('base64'));
    return Buffer.from(url.split(',')[1], 'base64');
  } finally { await page.close().catch(() => {}); }
}
export default async function screenshots(works, { publicDir, assetsDir } = {}) {
  if (!works.length) return [];
  let server, browser;
  const results = [];
  try {
    const { chromium } = await import('playwright');
    const serving = await serveStatic(publicDir); server = serving.server;
    browser = await chromium.launch({ headless: process.env.GALLERY_HEADLESS !== '0' });
    // Independent contexts prevent one work's cookies/storage from affecting another.
    for (let i = 0; i < works.length; i += 3) {
      results.push(...await Promise.all(works.slice(i, i + 3).map(async work => {
        let context;
        try {
          context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
          const page = await context.newPage();
          await page.goto('http://127.0.0.1:' + serving.port + work.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]));
          await page.waitForTimeout(1200); // Let canvas/WebGL works paint; never wait for networkidle.
          const png = await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled', timeout: 12000 });
          const webp = await encodeWebp(context, png);
          fs.mkdirSync(assetsDir, { recursive: true });
          const target = path.join(assetsDir, work.thumbnailName);
          fs.writeFileSync(target + '.tmp', webp); fs.renameSync(target + '.tmp', target);
          fs.copyFileSync(target, path.join(publicDir, 'thumbs', work.thumbnailName));
          console.log('✓ 更新封面 ' + work.route);
          return { id: work.id, ok: true };
        } catch (error) {
          console.warn('⚠ 截图失败，保留已有封面：' + work.route + ' — ' + error.message.split('\n')[0]);
          return { id: work.id, ok: false };
        } finally { if (context) await context.close().catch(() => {}); }
      })));
    }
  } catch (error) {
    console.warn('⚠ 截图环境不可用，保留已有封面；可运行 npm run setup:browser。' + error.message.split('\n')[0]);
    return works.map(w => ({ id: w.id, ok: false }));
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
  return results;
}
