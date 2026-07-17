# 预置缩略图静态部署设计

## 目标

将截图工作从 Vercel 构建时移至本地开发环境，Vercel 仅负责部署预先生成的静态文件。移除所有 Firecrawl / localtunnel 依赖，简化构建流水线。

## 动机

- Vercel 构建环境运行 Playwright 截图不稳定，且依赖 @sparticuz/chromium 体积大
- Firecrawl API 截图依赖外部服务和公网 URL，引入不必要的复杂性
- 实际使用场景：开发者本地修改 slides/ 后 `npm run build` 生成截图，提交 assets/thumbs/ 到 Git，Vercel 构建直接使用

## 目录结构变更

```
├── assets/
│   └── thumbs/        # [新增] 预置缩略图，始终提交到 Git
│       └── *.png
├── .cache/
│   └── thumbs/        # [保留] 本地增量缓存，不提交
│       ├── *.hash
│       └── *.png
├── public/
│   └── thumbs/        # [保留] 构建输出，不提交到 Git
│       └── *.png
```

- `assets/thumbs/` — 唯一新增目录，进入 Git 版本控制
- `.cache/thumbs/` 和 `public/` 继续在 `.gitignore` 中

## 构建流程

### 本地构建（`npm run build`）

```
1. 清空 public/
2. 复制 slides/*.html → public/
3. Playwright 截图阶段：
   a. 遍历 presentations，计算源文件的 SHA-256 哈希
   b. 对比 .cache/thumbs/*.hash：命中则从 .cache/thumbs/ 复制到 public/thumbs/
   c. 未命中：启动 Playwright，截图写入三处：
      - public/thumbs/{name}.png   （部署用）
      - .cache/thumbs/{name}.png   （后续增量缓存）
      - assets/thumbs/{name}.png   （提交 Git）
   d. 写入 .cache/thumbs/{name}.hash
4. 渲染 index.html → public/
```

### Vercel 构建（`npm run build`，VERCEL=1 自动触发）

```
1. 清空 public/
2. 复制 slides/*.html → public/
3. 复制 assets/thumbs/* → public/thumbs/（无截图步骤）
4. 渲染 index.html → public/
```

## 代码变更清单

### `build.js`
- 移除 `import 'dotenv/config'`
- 新增 Vercel 环境检测：`const isVercel = !!process.env.VERCEL`
- 截图调用前判断：`isVercel ? copyAssetsThumbs() : await screenshots(...)`
- 新增 `copyAssetsThumbs()` 函数：将 `assets/thumbs/*` 复制到 `public/thumbs/`

### `scripts/screenshots.js`
- 删除所有 Firecrawl 相关代码（`captureWithFirecrawl`、`processBatchWithFirecrawl`、`resolvePublicBaseUrl`、`FIRECRAWL_*` 常量）
- 删除 localtunnel 相关代码
- 删除 `import 'dotenv/config'`（不再需要）
- `captureWithPlaywright()` 截图后同步写入 `assets/thumbs/`
- `processBatch()` 简化，仅保留 Playwright 路径
- 仍保留 `serveStatic()`、`launchLocalBrowser()` 等本地截图基础设施

### `package.json`
- 移除 `dotenv` 依赖
- 移除 `localtunnel` 依赖
- npm scripts 保持不变（`build`、`dev`、`postinstall`）

### `.gitignore`
- 移除 `.env` 行（不再需要 dotenv）
- `assets/` 内的子目录不需要单独忽略

### 可选清理
- `scripts/install-chromium.js`：可保留，本地 postinstall 时仍需安装 Playwright Chromium；Vercel 上检测到 VERCEL 环境变量会跳过下载

## 环境变量简化

| 变量 | 用途 | 保留/删除 |
|------|------|----------|
| `SKIP_SCREENSHOTS` | 完全跳过截图 | 保留 |
| `HTMLPPT_HEADLESS` | 本地控制 headless | 保留 |
| `VERCEL` | 平台自动设置，判断是否跳过截图 | 保留 |
| `FIRECRAWL_API_KEY` | — | 删除 |
| `FIRECRAWL_API_URL` | — | 删除 |
| `FIRECRAWL_FORCE` | — | 删除 |
| `FIRECRAWL_TUNNEL` | — | 删除 |
| `USE_FIRECRAWL` | — | 删除 |
| `PUBLIC_URL` | — | 删除 |
| `VERCEL_URL` | — | 删除（不再需要公网 URL） |

## 注意事项

- 首次构建后，`assets/thumbs/` 目录及其 PNG 文件需通过 `git add` 加入仓库
- 修改 slides/ 后本地 `npm run build`，assets/thumbs/ 会自动更新对应截图
- 增量缓存机制不变，只重截变更过的幻灯片
- Vercel 构建速度显著提升，不再需要启动 Chromium 或无头浏览器
