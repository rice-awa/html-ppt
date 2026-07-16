# Vercel 兼容截图运行时实施计划

> 目标：在 Vercel 构建环境中使用 `@sparticuz/chromium` 生成真实缩略图；本地开发保持 Playwright 自带 Chromium 不变。

## 背景

当前 `scripts/screenshots.js` 在 Vercel 上因系统库缺失（`libnspr4.so`）无法启动 Playwright 自带的 Chromium。已加入降级逻辑：启动失败时返回占位图，保证构建不中断。本计划在此基础上，在 Vercel 构建环境中切换为 `@sparticuz/chromium` 提供的无头 Chromium，从而恢复真实缩略图生成。

## 决策

- 截图时机：构建时（`npm run build`），保持现有流程。
- 集成方式：条件切换（方案 A）。检测到 `VERCEL` 环境变量时，使用 `@sparticuz/chromium` 的 `executablePath` 与 `args`；否则使用 Playwright 默认 Chromium。
- 依赖：`playwright` 保留，`@sparticuz/chromium@126.0.0` 加入 `devDependencies`（匹配 Playwright 1.45.0 的 Chromium 126）。
- `postinstall`：在 Vercel 上跳过 Playwright 浏览器下载，避免下载一个用不上的二进制。

## 文件变更

- `package.json`：新增 `@sparticuz/chromium`，修改 `postinstall`。
- `scripts/screenshots.js`：条件选择 Chromium 启动方式，保留启动失败降级。

## Task 1：更新依赖与安装脚本

**Files:** `package.json`

- 在 `devDependencies` 中添加 `"@sparticuz/chromium": "126.0.0"`。
- 修改 `postinstall`：
  - 推荐用跨平台 Node 脚本 `node scripts/install-chromium.js`。
  - 该脚本逻辑：若 `process.env.VERCEL` 存在，直接退出；否则执行 `npx playwright install chromium`。
  - 这样 Vercel 构建时不会下载 Playwright Chromium，本地 `npm install` 仍会自动下载。

**Verification:**

```bash
node -e "console.log(!!process.env.VERCEL)"  # 本地应输出 false
node scripts/install-chromium.js              # 本地应尝试下载（若已存在则很快完成）
```

## Task 2：改造截图脚本

**Files:** `scripts/screenshots.js`

- 顶部新增导入：

```javascript
import vercelChromium from '@sparticuz/chromium';
```

- 在 `screenshots` 函数中，把 `chromium.launch(...)` 替换为条件调用：

```javascript
const launchOptions = process.env.VERCEL
  ? {
      args: vercelChromium.args,
      executablePath: await vercelChromium.executablePath(),
      headless: true,
    }
  : {
      headless: process.env.HTMLPPT_HEADLESS !== '0',
    };

browser = await chromium.launch(launchOptions);
```

- 保留已经存在的 `try/catch` 包装：若 `@sparticuz/chromium` 的 `executablePath` 或启动仍失败，继续降级为占位图。
- `context.newContext` 视口设置保持不变。

**Verification:**

- 本地构建：

```bash
rm -rf public .cache
npm run build
ls public/thumbs/
```

期望看到 4 张 PNG，且命令退出码为 0。

- 模拟 Vercel 环境（本地 Linux）：

```bash
rm -rf public .cache
VERCEL=1 npm run build
ls public/thumbs/
```

期望同样生成 4 张 PNG，且退出码为 0。若本地环境无法运行 `@sparticuz/chromium` 的二进制，应命中降级逻辑，构建仍成功。

- 降级验证：

```bash
rm -rf public
PLAYWRIGHT_BROWSERS_PATH=/nonexistent npm run build
```

期望看到 `⚠️ 截图环境不可用，跳过缩略图生成`，构建成功，无 `public/thumbs/`。

## Task 3：清理与提交

- 确保 `.cache/` 和 `public/` 不在 Git 跟踪中（已配置 `.gitignore`）。
- 检查 `git status`，只应显示源码文件变更。
- 提交：

```bash
git add package.json package-lock.json scripts/screenshots.js scripts/install-chromium.js docs/superpowers/plans/...
git commit -m "feat: use @sparticuz/chromium for screenshots on Vercel"
```

## 风险与回退

- `@sparticuz/chromium` 的 `executablePath` 在 Vercel 上若因版本或运行时检测失败，已有的 `try/catch` 会降级为占位图，构建不会再次崩溃。
- 若未来升级 Playwright，需同步升级 `@sparticuz/chromium` 到对应 Chromium 大版本。
- 本地非 Linux 开发者仍会走 Playwright 默认路径，不受影响。
