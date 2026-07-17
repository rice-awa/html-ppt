# 预置缩略图静态部署 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 Firecrawl/localtunnel 依赖，改为本地 Playwright 截图 + assets/thumbs/ 预置缩略图，Vercel 构建跳过截图直接复制预置图片。

**Architecture:** `assets/thumbs/` 作为预置截图目录提交到 Git。本地构建时 Playwright 截图同步写入 `public/thumbs/`、`.cache/thumbs/`、`assets/thumbs/`。Vercel 构建时检测 VERCEL 环境变量，跳过所有截图步骤，直接从 `assets/thumbs/` 复制到 `public/thumbs/`。

**Tech Stack:** Node.js >=22, Playwright (本地截图), 无外部 API 依赖

## Global Constraints

- Node.js >=22
- 不删除 `@sparticuz/chromium` 依赖（Vercel 不再需要但仍可保留以兼容旧环境）
- `assets/thumbs/` 目录随 Git 提交
- 保持哈希增量缓存逻辑不变

---

### Task 1: 创建 assets/thumbs/ 目录并添加 .gitkeep

**Files:**
- Create: `assets/thumbs/.gitkeep`

**Interfaces:**
- Produces: `assets/thumbs/` 目录可供后续写入缩略图

- [ ] **Step 1: 创建目录和 .gitkeep 文件**

```bash
mkdir -p assets/thumbs
touch assets/thumbs/.gitkeep
```

- [ ] **Step 2: 暂存并提交**

```bash
git add assets/
git commit -m "chore: 创建 assets/thumbs/ 预置缩略图目录"
```

---

### Task 2: 简化 scripts/screenshots.js，移除 Firecrawl 相关代码

**Files:**
- Modify: `scripts/screenshots.js`
  - 删除 import `import vercelChromium from '@sparticuz/chromium';`（第 6 行）
  - 删除 FIRECRAWL_* 常量（第 12-14 行）
  - 删除 `resolvePublicBaseUrl` 函数（第 81-104 行）
  - 删除 `captureWithFirecrawl` 函数（第 106-147 行）
  - 删除 `processBatchWithFirecrawl` 函数（第 167-201 行）
  - 删除 `launchLocalBrowser` 中的 Vercel 分支（第 244-260 行）
  - 重写 `screenshots` 主函数，移除 Firecrawl 决策逻辑（第 262-320 行）
  - 在 `captureWithPlaywright` 中新增写入 `assets/thumbs/`（第 149-165 行）

**Interfaces:**
- Consumes: `presentations`, `{ publicDir }` — 接口不变
- Produces: 返回值 `[{ route, thumbnailUrl, ok, cached }]` 格式不变

- [ ] **Step 1: 修改 screenshots.js**

将文件 `scripts/screenshots.js` 替换为以下精简版本：

```js
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

async function captureWithPlaywright(page, route, publicDir, cacheDir) {
  const routeBase = route.replace(/^\//, '') || 'index';
  const thumbName = sanitizeFilename(routeBase) + '.png';
  const thumbPath = path.join(publicDir, THUMBS_DIR, thumbName);
  const cacheThumbPath = path.join(cacheDir, thumbName);
  const assetsThumbPath = path.join(ASSETS_THUMBS_DIR, thumbName);

  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });

  await page.goto(`http://localhost:${process.env.HTMLPPT_PORT}${route}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: thumbPath, fullPage: false, type: 'png' });

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
```

- [ ] **Step 2: 暂存并提交**

```bash
git add scripts/screenshots.js
git commit -m "refactor: 移除 Firecrawl/localtunnel，简化为纯 Playwright 截图并写入 assets/thumbs/"
```

---

### Task 3: 修改 build.js，Vercel 环境跳过截图改为复制预置图片

**Files:**
- Modify: `build.js`
  - 删除第 1 行 `import 'dotenv/config';`
  - 第 7 行后新增: `const ASSETS_THUMBS_DIR = 'assets/thumbs';`
  - 替换第 108-113 行截图调用为条件逻辑

**Interfaces:**
- Consumes: `assets/thumbs/*`（Vercel 环境只读）
- Produces: `public/thumbs/*`（写入目标目录）

- [ ] **Step 1: 修改 build.js**

文件 `build.js` 共 147 行，做以下三处修改：

**修改 1：** 删除第 1 行 `import 'dotenv/config';`

**修改 2：** 在第 7 行（`const templatesDir = 'templates';`）之后新增一行：

```js
const ASSETS_THUMBS_DIR = 'assets/thumbs';
```

**修改 3：** 替换第 108-113 行：

替换前（第 108-113 行）：
```js
// 生成缩略图
const thumbResults = await screenshots(presentations, { publicDir });
const thumbMap = Object.fromEntries(thumbResults.map(r => [r.route, r.thumbnailUrl]));
for (const p of presentations) {
  p.thumbnailUrl = thumbMap[p.route] || null;
}
```

替换为：
```js
// 生成缩略图：Vercel 环境直接复制预置图片，本地环境运行 Playwright 截图
const isVercel = !!process.env.VERCEL;
if (isVercel) {
  const assetsThumbsPath = path.join(ASSETS_THUMBS_DIR);
  const publicThumbsPath = path.join(publicDir, 'thumbs');
  if (fs.existsSync(assetsThumbsPath)) {
    fs.mkdirSync(publicThumbsPath, { recursive: true });
    for (const f of fs.readdirSync(assetsThumbsPath)) {
      if (f.endsWith('.png')) {
        fs.copyFileSync(path.join(assetsThumbsPath, f), path.join(publicThumbsPath, f));
      }
    }
    console.log(`✓ 从 ${ASSETS_THUMBS_DIR} 复制预置缩略图`);
  }
  for (const p of presentations) {
    const routeBase = p.route.replace(/^\//, '') || 'index';
    const thumbName = routeBase.replace(/[^a-zA-Z0-9_-]/g, '_') + '.png';
    const thumbPath = path.join(publicThumbsPath, thumbName);
    p.thumbnailUrl = fs.existsSync(thumbPath) ? `/thumbs/${thumbName}` : null;
  }
} else {
  const thumbResults = await screenshots(presentations, { publicDir });
  const thumbMap = Object.fromEntries(thumbResults.map(r => [r.route, r.thumbnailUrl]));
  for (const p of presentations) {
    p.thumbnailUrl = thumbMap[p.route] || null;
  }
}
```

- [ ] **Step 2: 暂存并提交**

```bash
git add build.js
git commit -m "refactor: Vercel 环境跳过截图，改为复制 assets/thumbs/ 预置图片"
```

---

### Task 4: 更新 package.json 移除 dotenv 和 localtunnel 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 移除 dotenv 和 localtunnel**

从 `package.json` 的 `devDependencies` 中删除这两行：

```json
"dotenv": "^16.4.0",
"localtunnel": "^2.0.2",
```

- [ ] **Step 2: 执行 npm install 更新 lock 文件**

```bash
npm install
```

- [ ] **Step 3: 暂存并提交**

```bash
git add package.json package-lock.json
git commit -m "chore: 移除 dotenv 和 localtunnel 依赖"
```

---

### Task 5: 更新 .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: 删除 .env 行**

删除 `.gitignore` 最后一行的 `.env`。

- [ ] **Step 2: 删除本地 .env 文件**

```bash
rm -f .env
```

- [ ] **Step 3: 暂存并提交**

```bash
git add .gitignore
git rm --cached .env 2>/dev/null || true
git commit -m "chore: 移除 .env 及相关 gitignore 规则"
```

---

### Task 6: 本地构建验证

- [ ] **Step 1: 运行本地构建**

```bash
npm run build
```

预期输出：构建成功，生成 `public/index.html` 及各幻灯片，`public/thumbs/` 有对应 PNG 缩略图，同时 `assets/thumbs/` 同步更新。

- [ ] **Step 2: 本地 dev 启动验证**

```bash
npm run dev
```

在浏览器打开显示的地址，确认首页卡片有缩略图。

- [ ] **Step 3: 暂存新生成的 assets/thumbs/ 并提交**

```bash
rm assets/thumbs/.gitkeep
git add assets/thumbs/
git commit -m "chore: 预置缩略图初始版本"
```
