# 首页路由缩略图实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在构建时自动为每个路由生成 1280×720 首屏截图，并在首页卡片顶部展示为缩略图横幅。

**Architecture:** 新增 `scripts/screenshots.js` 负责启动临时静态服务器、并发截图、缓存判断；`build.js` 在渲染首页前调用它；卡片模板和首页样式改造成顶部缩略图横幅布局。

**Tech Stack:** Node.js 22+, Playwright (chromium), ES Modules, 原生 `http` 静态服务器。

## Global Constraints

- 视口固定为 `1280×720`，`deviceScaleFactor: 1`。
- 截图只截首屏，`fullPage: false`。
- 缓存键使用源 HTML 文件内容的 SHA-256 哈希。
- 并发上限 3 个页面。
- 环境变量 `SKIP_SCREENSHOTS=1` 可跳过截图。
- 截图失败不中断构建，使用占位背景。
- `.cache/` 和 `public/` 不提交到 Git。

---

## File Structure

- `package.json`：新增 `playwright` devDependency。
- `scripts/screenshots.js`：新增截图脚本，含静态服务器、缓存、并发、降级。
- `build.js`：调用截图脚本，把缩略图 URL 写入 `presentations`。
- `templates/card.html`：改成顶部缩略图横幅 + 下方标题描述的纵向布局。
- `templates/index.html`：新增缩略图容器、占位图、hover 等 CSS。
- `.gitignore`：追加 `.cache/`。

---

## Task 1: 添加 Playwright 依赖

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: 无
- Produces: 项目安装 `playwright` 包，后续脚本可 `import { chromium } from 'playwright'`。

- [ ] **Step 1: 修改 package.json**

```json
{
  "name": "htmlppt",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "node build.js",
    "dev": "node build.js && npx serve public"
  },
  "devDependencies": {
    "playwright": "^1.45.0"
  }
}
```

- [ ] **Step 2: 安装依赖**

Run: `npm install`

Expected: 生成 `package-lock.json`，`node_modules/playwright/` 存在。

- [ ] **Step 3: 验证安装**

Run: `node -e "import('playwright').then(p => console.log(typeof p.chromium))"`

Expected: 输出 `function`（首次运行会自动下载 Chromium，可能需要等待）。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add playwright for screenshot generation"
```

---

## Task 2: 创建截图脚本

**Files:**
- Create: `scripts/screenshots.js`

**Interfaces:**
- Consumes: 无
- Produces: 导出默认函数 `screenshots(presentations, options)`，返回 `Promise<Array<{ route: string, thumbnailUrl: string | null, ok: boolean }>>`。

- [ ] **Step 1: 创建 scripts/screenshots.js**

```javascript
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
        return { route: p.route, thumbnailUrl: thumbUrl, ok: true };
      }

      try {
        const page = await browser.newPage();
        const url = await capture(page, p.route, publicDir, cacheDir);
        await page.close();
        fs.writeFileSync(hashFile, hash);
        return { route: p.route, thumbnailUrl: url, ok: true };
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
    if (r.ok) {
      console.log(`✓ ${r.route} → ${r.thumbnailUrl}`);
    }
  }

  return results;
}
```

- [ ] **Step 2: 验证脚本语法**

Run: `node --check scripts/screenshots.js`

Expected: 无错误输出。

- [ ] **Step 3: Commit**

```bash
git add scripts/screenshots.js
git commit -m "feat: add screenshot generation script"
```

---

## Task 3: 在 build.js 中集成截图

**Files:**
- Modify: `build.js`

**Interfaces:**
- Consumes: `screenshots(presentations, { publicDir })` 返回 `Array<{ route, thumbnailUrl, ok }>`。
- Produces: `presentations` 数组新增 `thumbnailUrl` 字段，供卡片模板使用。

- [ ] **Step 1: 修改 build.js 导入并调用截图脚本**

在 `build.js` 顶部新增：

```javascript
import screenshots from './scripts/screenshots.js';
```

在 `presentations` 数组构建完成后（复制完 HTML 文件后）、渲染模板前，插入截图调用：

```javascript
// 截图生成
const thumbResults = await screenshots(presentations, { publicDir });
const thumbMap = Object.fromEntries(thumbResults.map(r => [r.route, r.thumbnailUrl]));

for (const p of presentations) {
  p.thumbnailUrl = thumbMap[p.route] || null;
}
```

注意：当前 `presentations` 数组中的对象需要包含 `sourcePath` 字段，以便截图脚本计算缓存哈希。在循环中复制 HTML 时，同步添加 `sourcePath`：

```javascript
presentations.push({
  title,
  description,
  route,
  file: slideFile,
  sourcePath
});
```

- [ ] **Step 2: 修改 build.js 完整版本**

```javascript
import fs from 'fs';
import path from 'path';
import screenshots from './scripts/screenshots.js';

const slidesDir = 'slides';
const publicDir = 'public';
const routesFile = 'routes.json';
const templatesDir = 'templates';

const escapeHtml = (str) =>
  str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

// 清理并创建 public 目录
if (fs.existsSync(publicDir)) {
  fs.rmSync(publicDir, { recursive: true });
}
fs.mkdirSync(publicDir);

// 读取自定义路由配置
let routes = {};
if (fs.existsSync(routesFile)) {
  routes = JSON.parse(fs.readFileSync(routesFile, 'utf-8'));
}

// 扫描 slides 目录
const slides = fs.readdirSync(slidesDir).filter(f => f.endsWith('.html'));

const presentations = [];

for (const slideFile of slides) {
  const sourcePath = path.join(slidesDir, slideFile);
  const content = fs.readFileSync(sourcePath, 'utf-8');

  // 提取标题
  const titleMatch = content.match(/<title>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : slideFile.replace('.html', '');

  // 提取描述
  const descMatch = content.match(/<meta\s+name="description"\s+content="(.*?)"/i);
  const description = descMatch ? descMatch[1] : '';

  // 确定目标文件名
  let targetFile = slideFile;
  if (routes[slideFile]) {
    const routePath = routes[slideFile];
    targetFile = routePath.replace(/^\//, '') + '.html';
  }

  const targetPath = path.join(publicDir, targetFile);
  fs.copyFileSync(sourcePath, targetPath);

  // 生成路由路径（用于索引页）
  const route = '/' + targetFile.replace(/\.html$/, '');

  presentations.push({
    title,
    description,
    route,
    file: slideFile,
    sourcePath
  });

  console.log(`✓ ${slideFile} → ${route}`);
}

// 生成缩略图
const thumbResults = await screenshots(presentations, { publicDir });
const thumbMap = Object.fromEntries(thumbResults.map(r => [r.route, r.thumbnailUrl]));
for (const p of presentations) {
  p.thumbnailUrl = thumbMap[p.route] || null;
}

// 生成首页索引（模板位于 templates/ 目录）
const indexTemplate = fs.readFileSync(path.join(templatesDir, 'index.html'), 'utf-8');

let listHtml;
if (presentations.length > 0) {
  const cardTemplate = fs.readFileSync(path.join(templatesDir, 'card.html'), 'utf-8');
  listHtml = presentations.map((p, i) => {
    const descBlock = p.description
      ? `          <p class="deck-desc">${escapeHtml(p.description)}</p>`
      : '';
    const thumbBlock = p.thumbnailUrl
      ? `        <div class="deck-thumb"><img src="${escapeHtml(p.thumbnailUrl)}" alt=""></div>`
      : `        <div class="deck-thumb deck-thumb-placeholder"><span>${escapeHtml(p.title.slice(0, 1))}</span></div>`;
    return cardTemplate
      .replaceAll('{{INDEX}}', String(i))
      .replaceAll('{{INDEX_LABEL}}', String(i + 1).padStart(2, '0'))
      .replaceAll('{{TITLE}}', escapeHtml(p.title))
      .replaceAll('{{DESC_BLOCK}}', descBlock)
      .replaceAll('{{THUMB_BLOCK}}', thumbBlock)
      .replaceAll('{{ROUTE}}', p.route);
  }).join('\n');
} else {
  listHtml = `      <div class="empty-state">暂无演示文稿，将 HTML 文件放入 <code>slides/</code> 目录后重新构建。</div>`;
}

const indexHtml = indexTemplate
  .replaceAll('{{CARDS}}', listHtml)
  .replaceAll('{{COUNT}}', String(presentations.length));

fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml);
console.log(`\n✓ 生成首页索引，包含 ${presentations.length} 个演示文稿`);
```

- [ ] **Step 3: 运行构建**

Run: `npm run build`

Expected: 输出 `✓ {route} → /thumbs/{name}.png` 等日志，无报错。

- [ ] **Step 4: 检查生成物**

Run: `ls public/thumbs/`

Expected: 看到若干 PNG 文件。

- [ ] **Step 5: Commit**

```bash
git add build.js
git commit -m "feat: integrate screenshot generation into build"
```

---

## Task 4: 改造卡片模板

**Files:**
- Modify: `templates/card.html`

**Interfaces:**
- Consumes: `{{THUMB_BLOCK}}` 占位符（由 build.js 注入完整 HTML 字符串）。
- Produces: 卡片结构变为顶部缩略图 + 下方标题描述的纵向布局。

- [ ] **Step 1: 重写 templates/card.html**

```html
<a href="{{ROUTE}}" class="deck-card" style="--i:{{INDEX}}">
  {{THUMB_BLOCK}}
  <div class="deck-body">
    <h2 class="deck-title">{{TITLE}}</h2>
{{DESC_BLOCK}}
  </div>
  <div class="deck-meta">
    <span class="deck-index">{{INDEX_LABEL}}</span>
    <span class="deck-route">{{ROUTE}}</span>
    <span class="deck-arrow" aria-hidden="true">&rarr;</span>
  </div>
</a>
```

- [ ] **Step 2: 验证模板替换**

Run: `npm run build && node -e "const html=require('fs').readFileSync('public/index.html','utf-8'); const n=(html.match(/deck-thumb/g)||[]).length; console.log(n);"`

Expected: 输出数量等于演示文稿数量（每个卡片一个 `deck-thumb`）。

- [ ] **Step 3: Commit**

```bash
git add templates/card.html
git commit -m "feat: redesign card template with top thumbnail banner"
```

---

## Task 5: 更新首页样式

**Files:**
- Modify: `templates/index.html`

**Interfaces:**
- Consumes: `deck-card` 结构中的 `.deck-thumb`、`.deck-thumb-placeholder`、`.deck-title`、`.deck-desc`、`.deck-meta`、`.deck-index`、`.deck-route`、`.deck-arrow`。
- Produces: 新的卡片样式，保持暗色主题、动画和响应式。

- [ ] **Step 1: 在 templates/index.html 的 `<style>` 中替换卡片相关样式**

打开 `templates/index.html`，先删除旧的 `.deck-card`、`.deck-index`、`.deck-body`、`.deck-title`、`.deck-desc`、`.deck-meta`、`.deck-route`、`.deck-arrow` 以及 `@media (max-width: 640px)` 中与卡片横向布局相关的规则（如 `.deck-card { display: flex; ... }`、`.deck-index { width: 32px; }`、`.deck-meta { flex-shrink: 0; }` 等），然后在 `<style>` 末尾追加新的卡片样式：

```css
  .deck-card {
    display: block;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    text-decoration: none;
    color: inherit;
    position: relative;
    overflow: hidden;
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                border-color 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                box-shadow 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    opacity: 0;
    animation: rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    animation-delay: calc(0.3s + var(--i) * 0.07s);
  }

  .deck-card:hover,
  .deck-card:focus-visible {
    transform: translateY(-3px);
    border-color: var(--border-hover);
    box-shadow: 0 16px 40px -20px rgba(0, 0, 0, 0.6), 0 0 0 1px var(--accent-soft);
  }

  .deck-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .deck-thumb {
    height: 140px;
    overflow: hidden;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .deck-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
    transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .deck-card:hover .deck-thumb img {
    transform: scale(1.03);
  }

  .deck-thumb-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, hsl(calc(var(--i) * 60), 60%, 20%), hsl(calc(var(--i) * 60 + 40), 50%, 12%));
  }

  .deck-thumb-placeholder span {
    font-family: var(--font-display);
    font-size: 3rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.18);
    text-transform: uppercase;
  }

  .deck-body {
    padding: 22px 28px 10px;
  }

  .deck-title {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.2rem;
    letter-spacing: -0.01em;
    margin-bottom: 6px;
    text-wrap: pretty;
  }

  .deck-desc {
    font-size: 0.92rem;
    color: var(--text-secondary);
    text-wrap: pretty;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .deck-meta {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 28px 24px;
  }

  .deck-index {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text-tertiary);
    letter-spacing: 0.04em;
    transition: color 0.35s ease;
  }

  .deck-card:hover .deck-index { color: var(--accent); }

  .deck-route {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 5px 10px;
    white-space: nowrap;
    margin-left: auto;
  }

  .deck-arrow {
    color: var(--text-tertiary);
    font-size: 18px;
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), color 0.35s ease;
  }

  .deck-card:hover .deck-arrow {
    transform: translateX(4px);
    color: var(--accent);
  }
```

同时移除旧的 `.deck-index` 宽度 32px、`.deck-card` 横向 flex、`.deck-meta` 的 `flex-shrink: 0` 等不再适用的样式。

- [ ] **Step 2: 调整响应式样式**

在 `@media (max-width: 640px)` 中追加：

```css
  @media (max-width: 640px) {
    .deck-thumb { height: 100px; }
    .deck-body { padding: 18px 22px 8px; }
    .deck-meta { padding: 0 22px 18px; }
    .deck-thumb-placeholder span { font-size: 2.4rem; }
  }
```

并移除旧的 `.deck-card { flex-wrap: wrap; ... }` 等规则。

- [ ] **Step 3: 验证样式生成**

Run: `npm run build`

Expected: 构建成功。用浏览器打开 `public/index.html` 检查卡片是否为顶部缩略图布局。

- [ ] **Step 4: Commit**

```bash
git add templates/index.html
git commit -m "feat: add thumbnail banner styles to index template"
```

---

## Task 6: 忽略缓存目录

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 无
- Produces: `.cache/` 不会被提交。

- [ ] **Step 1: 修改 .gitignore**

```
node_modules/
public/
.cache/
.DS_Store
```

- [ ] **Step 2: 验证未被跟踪**

Run: `git status --short .cache/`

Expected: 无输出（.cache/ 已被忽略）。

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .cache directory"
```

---

## Task 7: 验证缓存与跳过开关

**Files:**
- 无新增/修改
- 测试：运行构建命令

- [ ] **Step 1: 首次完整构建**

Run: `npm run build`

Expected: 看到 Playwright 截图日志，生成 `public/thumbs/` PNG。

- [ ] **Step 2: 再次构建测试缓存**

Run: `npm run build`

Expected: 控制台不应再输出 `✓ {route} → /thumbs/...`（因为缓存命中），构建速度明显快于首次。

- [ ] **Step 3: 修改单个源文件测试增量缓存**

Run: `printf '\n<!-- cache-test -->\n' >> slides/tcp.html && npm run build`

Expected: 只有 `tcp` 路由的缩略图重新生成，其他路由使用缓存。

Note: 测试完成后可手动从 `slides/tcp.html` 移除追加的注释，避免污染源文件。

- [ ] **Step 4: 测试 SKIP_SCREENSHOTS**

Run: `rm -rf public && SKIP_SCREENSHOTS=1 npm run build`

Expected: 未启动 Chromium，卡片显示 `.deck-thumb-placeholder` 占位背景。

- [ ] **Step 5: 测试 dev 命令**

Run: `npm run dev`

Expected: 构建成功，终端提示服务启动，浏览器打开首页可见缩略图。

- [ ] **Step 6: 最终验证（无未提交构建产物）**

Run: `git status --short`

Expected: 仅显示本次修改的源码文件，不显示 `public/` 或 `.cache/`。

- [ ] **Step 7: Commit（如有临时调整）**

若验证过程中发现小修复，单独提交；无则跳过。

---

## Self-Review Checklist

1. **Spec coverage:**
   - 构建时自动截图 → Task 1、2、3。
   - 顶部缩略图横幅 → Task 4、5。
   - 缓存机制 → Task 2、7。
   - SKIP_SCREENSHOTS → Task 2、7。
   - 失败降级 → Task 2。
   - 1280×720 视口 → Task 2。
   - `.gitignore` → Task 6。

2. **Placeholder scan:** 无 TBD/TODO，每个代码步骤均给出完整实现。

3. **类型一致性:** `screenshots` 函数签名与 `build.js` 调用一致；`presentations` 新增 `sourcePath` 和 `thumbnailUrl` 字段，模板使用 `{{THUMB_BLOCK}}`。

4. **边界:** 空 `slides/` 目录时，截图脚本传入空数组，无错误；首页仍显示空状态。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-16-thumbnails-plan.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
