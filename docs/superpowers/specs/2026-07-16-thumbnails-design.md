# 首页路由缩略图设计方案

## 背景

`htmlppt` 是一个基于 Vercel 自动部署的 HTML 演示文稿集合站点。构建脚本 `build.js` 扫描 `slides/` 目录下的 HTML 文件，生成 `public/index.html` 作为首页索引，并为每个演示文稿生成一张卡片。

目前卡片仅展示标题、描述和路由，用户希望在首页为每个路由添加界面截图缩略图，使索引页更直观。

## 目标

- 在构建时自动为每个路由生成首屏截图。
- 在首页卡片顶部展示缩略图横幅。
- 支持缓存，避免每次构建都重新截图。
- 在缺少浏览器或开发调试时可降级或跳过截图。

## 决策摘要

| 项目 | 选择 |
|------|------|
| 截图方式 | 构建时自动截图（Playwright） |
| 视口 | 桌面端 1280×720 |
| 截图范围 | 首屏（fullPage: false） |
| 缓存键 | 源 HTML 文件内容的 SHA-256 哈希 |
| 缩略图布局 | 卡片顶部横幅 |
| 实现架构 | 新增 `scripts/screenshots.js`，由 `build.js` 调用 |

## 架构

```
build.js
  │
  ├─ 清理并创建 public/
  ├─ 复制 slides/*.html → public/*.html
  ├─ 调用 scripts/screenshots.js
  │     │
  │     ├─ 在 public/ 内启动临时静态服务器
  │     ├─ 对每个路由：检查 .cache/thumbs/{filename}.hash
  │     │            若哈希一致且截图存在，跳过
  │     │            否则用 Playwright 截图并保存到 public/thumbs/{route}.png
  │     └─ 返回每个路由的缩略图 URL 及是否成功
  │
  ├─ 读取 templates/index.html + card.html
  ├─ 注入缩略图 URL 到卡片模板
  └─ 写入 public/index.html
```

## 新增与修改文件

### 新增

- `scripts/screenshots.js`：截图脚本，负责静态服务器、缓存判断、并发截图。
- `.cache/thumbs/`：缓存目录，保存缩略图文件和哈希文件。
- `public/thumbs/`：构建输出目录，保存最终可访问的 PNG。

### 修改

- `package.json`：新增 `playwright` 作为 `devDependency`。
- `build.js`：在渲染首页前调用截图脚本，并将缩略图路径传入 `presentations`。
- `templates/card.html`：改为顶部横幅布局，新增缩略图占位/图片区域。
- `templates/index.html`：新增缩略图相关 CSS。
- `.gitignore`：追加 `.cache/`，避免提交构建缓存。

## 截图脚本行为（scripts/screenshots.js）

1. **跳过开关**：若环境变量 `SKIP_SCREENSHOTS=1`，直接返回空/占位结果，不启动浏览器。
2. **静态服务器**：使用 Node.js 内置 `http` 模块，在随机端口启动，根目录指向 `public/`。
3. **浏览器**：使用 Playwright 的 `chromium.launch()`，默认 `headless: true`。
4. **视口**：`{ width: 1280, height: 720, deviceScaleFactor: 1 }`。
5. **截图**：访问 `http://localhost:{port}{route}`，等待 `networkidle`，截取首屏为 PNG。生成的缩略图文件名基于路由生成，对 `/`、中文、空格等特殊字符进行编码或替换，确保在文件系统和 URL 中可用。
6. **并发**：最多 3 个页面并行，避免资源耗尽。
7. **缓存**：
   - 缓存目录 `.cache/thumbs/`。
   - 计算源 HTML 文件（`slides/{file}`）的 SHA-256 哈希。
   - 与 `.cache/thumbs/{filename}.hash` 比较；一致则把缓存文件复制到 `public/thumbs/{route}.png`。
   - 不一致则重新截图，并更新缓存文件和哈希文件。
8. **失败降级**：某个路由截图失败时，打印警告，该卡片使用占位背景（CSS 渐变 + 标题首字母），构建继续。
9. **返回值**：返回对象数组，每个元素包含 `route`、`thumbnailUrl`、`ok`。

## 首页卡片 UI

### 布局

卡片由横向布局改为纵向布局：

```
┌─────────────────────────────┐
│      缩略图横幅 (140px)      │
├─────────────────────────────┤
│ 标题                         │
│ 描述（可选）                  │
│ 路由标签              →      │
└─────────────────────────────┘
```

### 样式细节

- 缩略图容器高度固定 140px（移动端 100px），宽度与卡片一致。
- 图片使用 `object-fit: cover`，`object-position: top`，保证首屏内容可见。
- 容器 `overflow: hidden`，hover 时图片轻微放大（`transform: scale(1.03)`）。
- 占位状态：使用基于标题首字母生成的渐变背景色（hsl 计算），保证无截图时视觉统一。
- 保留现有暗色主题、动画和响应式。

### 可访问性

- 缩略图作为装饰性图片，设置 `alt=""`。
- 卡片本身仍是链接，整体可点击。

## 错误处理与环境

- **本地开发**：执行 `npm install` 安装 Playwright 及 Chromium；首次下载可能需要一些时间。
- **Vercel 部署**：Vercel 的 Node 18+ 环境支持 Playwright。若浏览器依赖缺失，截图脚本捕获错误并降级为占位图，首页仍可正常构建。
- **快速构建**：`SKIP_SCREENSHOTS=1 npm run build` 可跳过截图，适合频繁调试模板或样式。
- **日志**：成功输出 `✓ {route} → /thumbs/{route}.png`；失败输出 `⚠️ 截图失败: {route} - {error}`。

## 依赖

```json
{
  "devDependencies": {
    "playwright": "^1.45.0"
  }
}
```

## 验证计划

1. 执行 `npm install` 安装 Playwright。
2. 执行 `npm run build`：
   - 确认 Chromium 启动并截图；
   - 确认 `public/thumbs/` 下生成 PNG；
   - 确认首页卡片显示缩略图。
3. 再次执行 `npm run build`：
   - 确认未重新截图（缓存命中）。
4. 修改某个 `slides/*.html`：
   - 确认仅该路由重新截图。
5. 执行 `SKIP_SCREENSHOTS=1 npm run build`：
   - 确认未启动 Chromium，卡片显示占位背景。
6. 执行 `npm run dev`：
   - 在浏览器中打开首页，确认布局无错位。
7. 检查 `.gitignore`：
   - 确认 `.cache/` 和 `public/` 被忽略，不提交构建产物。

## 未涉及范围

- 不实现懒加载或响应式图片（`srcset`），项目规模小，直接 `img` 即可。
- 不实现截图的自定义配置（如不同视口、不同页面区域），保持简单。
- 不将缩略图提交到 Git，完全由构建生成。
