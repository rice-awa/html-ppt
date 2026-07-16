# 索引页响应式布局优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `templates/index.html` 的索引卡片改为响应式 3-2-1 列网格，统一 16:10 缩略图比例，并添加桌面端悬停完整预览。

**Architecture:** 仅修改 `templates/index.html` 的内联样式，不改动 `templates/card.html` 与 `build.js`。使用 CSS Grid 实现响应式列数，使用 `aspect-ratio` 统一缩略图容器，使用绝对定位 overlay 实现悬停预览。

**Tech Stack:** HTML5, CSS3 (Grid, aspect-ratio, object-fit, media queries), Node.js 构建脚本

## Global Constraints

- 仅修改 `templates/index.html`，不动 `templates/card.html` 与 `build.js` 结构。
- 缩略图插槽 `{{THUMB_BLOCK}}` 生成的结构不变，仅通过 CSS 控制展示。
- 保持现有深色主题、动画、`prefers-reduced-motion`、`focus-visible` 等可访问性处理。
- 悬停预览仅在桌面端生效（`@media (hover: hover) and (pointer: fine)`）。
- 断点：桌面 3 列 `>=1024px`，平板 2 列 `>=640px`，手机 1 列 `<640px`。

---

### Task 1: 放宽页面容器并建立响应式网格

**Files:**
- Modify: `templates/index.html`

**Interfaces:**
- Consumes: `.page` 容器与 `.deck-list` 卡片列表
- Produces: 响应式 CSS Grid 布局

- [ ] **Step 1: 修改 `.page` 最大宽度**

  将 `.page` 从 `max-width: 860px` 放宽到 `1200px`，让 3 列网格有充足空间。

  ```css
  .page {
    position: relative;
    z-index: 1;
    max-width: 1200px;
    margin: 0 auto;
    padding: clamp(64px, 12vw, 128px) 24px 80px;
  }
  ```

- [ ] **Step 2: 将 `.deck-list` 改为 CSS Grid**

  替换现有 `.deck-list` 的 flex column 定义：

  ```css
  .deck-list {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  ```

- [ ] **Step 3: 为 footer 同步放宽宽度**

  ```css
  footer {
    max-width: 1200px;
    margin: 64px auto 0;
    padding: 24px;
    text-align: center;
  }
  ```

- [ ] **Step 4: 在现有 `@media (max-width: 640px)` 前增加平板断点**

  在文件 `@media` 区域新增：

  ```css
  @media (max-width: 1023px) {
    .deck-list {
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
  }
  ```

- [ ] **Step 5: 验证当前构建产物**

  Run: `npm run build`
  Expected: 构建成功，`public/index.html` 生成，无报错。

---

### Task 2: 统一缩略图比例为 16:10

**Files:**
- Modify: `templates/index.html`

**Interfaces:**
- Consumes: `.deck-thumb`、`.deck-thumb img`、`.deck-thumb-placeholder`
- Produces: 统一比例的缩略图容器

- [ ] **Step 1: 修改 `.deck-thumb` 使用 aspect-ratio**

  移除固定高度，改为比例容器：

  ```css
  .deck-thumb {
    aspect-ratio: 16 / 10;
    overflow: hidden;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  ```

- [ ] **Step 2: 确保图片填满容器**

  现有 `.deck-thumb img` 规则已满足，保留：

  ```css
  .deck-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
    transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }
  ```

- [ ] **Step 3: 调整占位图高度**

  占位图使用 flex 居中，父容器已有 `aspect-ratio`，因此去掉内部固定尺寸相关代码，仅保留居中和文字样式：

  ```css
  .deck-thumb-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, hsl(calc(var(--i) * 60), 60%, 20%), hsl(calc(var(--i) * 60 + 40), 50%, 12%));
  }

  .deck-thumb-placeholder span {
    font-family: var(--font-display);
    font-size: 2.4rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.18);
    text-transform: uppercase;
  }
  ```

- [ ] **Step 4: 调整移动端缩略图相关覆盖**

  在 `@media (max-width: 640px)` 中删除 `.deck-thumb { height: 100px; }`，因为比例已由 `aspect-ratio` 控制：

  ```css
  @media (max-width: 640px) {
    .deck-list {
      grid-template-columns: 1fr;
      gap: 14px;
    }
    .deck-body { padding: 18px 22px 8px; }
    .deck-meta { padding: 0 22px 18px; }
    .deck-thumb-placeholder span { font-size: 2rem; }
  }
  ```

- [ ] **Step 5: 构建并预览**

  Run: `npm run build && npx serve public`
  Expected: 打开 `http://localhost:3000`，桌面端看到 3 列卡片，缩略图高度一致。

---

### Task 3: 添加桌面端悬停完整预览

**Files:**
- Modify: `templates/index.html`

**Interfaces:**
- Consumes: `.deck-thumb` 内的 `img`
- Produces: 悬停时切换为完整显示的缩略图

- [ ] **Step 1: 为 `.deck-thumb` 添加相对定位**

  在 Task 2 的 `.deck-thumb` 基础上增加 `position: relative`，为后续可能的 overlay 做准备（本任务暂不使用伪元素 overlay，但保留定位习惯）。

  ```css
  .deck-thumb {
    aspect-ratio: 16 / 10;
    overflow: hidden;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    position: relative;
  }
  ```

- [ ] **Step 2: 让 `object-fit` 可切换**

  为 `.deck-thumb img` 增加 `object-fit` 到 transition 列表（该属性本身不可插值，但声明后浏览器会在变化时立即应用新值）：

  ```css
  .deck-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
    transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), object-fit 0.35s ease;
  }
  ```

- [ ] **Step 3: 添加桌面端 hover 完整显示规则**

  默认保持 `object-fit: cover` 作为封面效果；桌面端悬停卡片时切换为 `object-fit: contain`，完整显示原始截图：

  ```css
  @media (hover: hover) and (pointer: fine) {
    .deck-card:hover .deck-thumb img {
      object-fit: contain;
      transform: scale(1);
    }
  }
  ```

- [ ] **Step 4: 构建并验证 hover 效果**

  Run: `npm run build && npx serve public`
  Expected: 桌面端鼠标悬停卡片时，缩略图从 cover 切换为 contain，完整显示原始截图；移开鼠标后恢复 cover 封面效果。

---

### Task 4: 多列下的文字与间距微调

**Files:**
- Modify: `templates/index.html`

**Interfaces:**
- Consumes: `.deck-title`、`.deck-desc`、`.deck-body`、`.deck-meta`
- Produces: 更适配窄卡片的文字大小与间距

- [ ] **Step 1: 在多列下略微缩小标题字号**

  为保持 3 列下卡片高度一致，标题不要换行太多。添加响应式字号：

  ```css
  .deck-title {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.1rem;
    letter-spacing: -0.01em;
    margin-bottom: 6px;
    text-wrap: pretty;
  }
  ```

- [ ] **Step 2: 描述文字保持两行截断**

  现有 `.deck-desc` 已使用 `-webkit-line-clamp: 2`，保持不变。

- [ ] **Step 3: 调整 body 与 meta 的内边距**

  在多列下减少一些内边距：

  ```css
  .deck-body {
    padding: 18px 20px 8px;
  }

  .deck-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 20px 20px;
  }
  ```

- [ ] **Step 4: 为桌面端增加列数变化的过渡**

  可选：为 `.deck-list` 添加 `transition: grid-template-columns 0.3s ease`（Grid 模板本身不可过渡，可忽略）。

- [ ] **Step 5: 构建并跨宽度检查**

  Run: `npm run build && npx serve public`
  Expected: 在 1200px、800px、375px 三种宽度下，文字与间距均协调，无溢出或过度拥挤。

---

### Task 5: 最终验证

**Files:**
- Modify: 无（验证步骤）
- Test: `public/index.html`（构建产物）

- [ ] **Step 1: 构建项目**

  Run: `npm run build`
  Expected: 输出 `✓ 生成首页索引，包含 N 个演示文稿`，无错误。

- [ ] **Step 2: 检查生成的 `public/index.html`**

  Run: `grep -E "grid-template-columns|aspect-ratio" public/index.html`
  Expected: 看到 `grid-template-columns` 与 `aspect-ratio` 相关 CSS。

- [ ] **Step 3: 启动本地服务器并截图/目视检查**

  Run: `npx serve public`
  Expected: 浏览器打开 `http://localhost:3000`，桌面端 3 列、平板 2 列、手机 1 列，缩略图高度一致，hover 时完整显示。

- [ ] **Step 4: 运行 git diff 确认改动范围**

  Run: `git diff -- templates/index.html`
  Expected: 仅 `templates/index.html` 有变更，无其它文件意外改动。

---

## Self-Review Checklist

- [ ] Spec coverage：响应式 3-2-1 列、统一 16:10 缩略图、桌面 hover 完整预览均已覆盖。
- [ ] Placeholder scan：无 TBD/TODO/"适当处理"等占位描述。
- [ ] Type consistency：CSS 类名与现有模板一致，无新增需要跨文件同步的接口。
- [ ] Scope：仅修改 `templates/index.html`，符合设计文档约束。
