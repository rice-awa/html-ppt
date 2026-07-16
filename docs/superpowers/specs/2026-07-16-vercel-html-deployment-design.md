# HTML 演示文稿 Vercel 部署系统设计

## 概述

将现有的 HTML 演示文稿项目改造为可通过 Vercel 自动部署的静态网站，支持基于文件名的自动路由，并提供可配置的自定义路由映射。

## 目标

1. **自动部署**：每次在指定目录更新 HTML 文件时，Vercel 自动触发部署
2. **智能路由**：默认根据文件名生成路由路径，支持通过配置文件覆盖
3. **自动索引**：生成首页展示所有演示文稿的列表
4. **CDN 兼容**：保持对外部 CDN 资源（Google Fonts、GSAP 等）的引用，无需特殊处理

## 非目标

- 不引入复杂的构建工具（如 Vite、Next.js）
- 不支持动态内容或后端逻辑
- 不本地化 CDN 资源（保持外部引用）

## 架构设计

### 项目结构

```
htmlppt/
├── vercel.json              # Vercel 配置文件
├── package.json             # Node.js 项目配置（用于构建脚本）
├── build.js                 # 构建脚本：扫描 HTML，生成索引和路由
├── slides/                  # HTML 演示文件存放目录
│   ├── tcp.html
│   ├── TCP-Presentation-v2.html
│   └── UDP演示.html
├── routes.json              # 可选：自定义路由映射（手动维护）
├── public/                  # 构建输出目录（自动生成，不提交到 Git）
│   ├── index.html           # 自动生成的首页
│   ├── tcp.html
│   └── ...
└── README.md
```

### 核心流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. 用户在 slides/ 目录添加/修改 HTML 文件                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. 推送到 Git 仓库                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. Vercel 检测到变更，触发构建                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  4. 执行 npm run build（运行 build.js）                       │
│     - 扫描 slides/ 目录下的所有 .html 文件                    │
│     - 读取 routes.json（如果存在）获取自定义路由                │
│     - 根据路由映射重命名文件（或保持原文件名）                  │
│     - 生成 index.html（首页索引）                             │
│     - 复制所有文件到 public/ 目录                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  5. Vercel 部署 public/ 目录                                 │
│     - cleanUrls: true 自动处理路由（/tcp → /tcp.html）        │
└─────────────────────────────────────────────────────────────┘
```

### 路由规则

**核心机制**：使用 Vercel 的 `cleanUrls` 功能，自动将 `.html` 文件映射为无后缀路由。

#### 默认路由（基于文件名，自动生效）

- `public/tcp.html` → `/tcp`
- `public/TCP-Presentation-v2.html` → `/TCP-Presentation-v2`
- `public/UDP演示.html` → `/UDP演示`（浏览器自动 URL 编码）

**无需任何额外配置**，`cleanUrls: true` 即可自动处理。

#### 自定义路由（通过 routes.json + rewrites）

如需自定义路由路径，创建 `routes.json` 文件：

```json
{
  "UDP演示.html": "/udp",
  "TCP-Presentation-v2.html": "/tcp-v2"
}
```

`build.js` 读取 `routes.json` 后，将对应的 HTML 文件**重命名**复制到 `public/` 目录。例如：
- `slides/UDP演示.html` + 映射 `"/udp"` → 复制为 `public/udp.html` → 自动路由到 `/udp`

**优先级**：`routes.json` 中的配置优先于默认文件名。

#### 路由配置生成

`build.js` 根据 `routes.json` 将文件重命名复制到 `public/`，`vercel.json` 只需配置 `cleanUrls: true`，无需手动维护 rewrites。

### 首页索引（index.html）

自动生成的首页包含：

1. **标题**：HTML 演示文稿集合
2. **演示列表**：每个演示文稿的卡片，包含：
   - 标题（从 `<title>` 标签提取）
   - 描述（可选，从 `<meta name="description">` 提取）
   - 链接（路由路径）
3. **样式**：简洁的卡片布局，响应式设计

**示例**：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>HTML 演示文稿集合</title>
  <style>
    /* 简洁的卡片样式 */
  </style>
</head>
<body>
  <h1>HTML 演示文稿集合</h1>
  <div class="grid">
    <a href="/tcp" class="card">
      <h2>TCP 基本原理</h2>
      <p>Transport Control Protocol</p>
    </a>
    <a href="/udp" class="card">
      <h2>UDP 协议</h2>
      <p>互联网的快枪手</p>
    </a>
  </div>
</body>
</html>
```

### CDN 资源处理

**策略**：保持外部 CDN 引用，无需特殊处理。

**原因**：
- Vercel 默认允许加载外部资源
- 不会触发跨域限制（CORS 仅在 fetch/XHR 时生效）
- Google Fonts、cdnjs、jsdelivr 等主流 CDN 均支持 CORS

**未来扩展**：如需配置 Content Security Policy，可在 `vercel.json` 中添加 headers：

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;"
        }
      ]
    }
  ]
}
```

## 技术细节

### build.js 实现

**功能**：
1. 扫描 `slides/` 目录下的所有 `.html` 文件
2. 读取 `routes.json`（如果存在）
3. 根据路由映射重命名文件，或保持原文件名
4. 提取 HTML 的 `<title>` 和 `<meta name="description">`
5. 生成 `index.html`（首页索引）
6. 复制所有文件到 `public/` 目录

**依赖**：
- Node.js 内置模块：`fs`, `path`
- 无需额外依赖

### vercel.json 配置

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "public",
  "cleanUrls": true,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        }
      ]
    }
  ]
}
```

**说明**：
- `cleanUrls: true`：自动将 `/tcp` 路由到 `/tcp.html`，无需手动配置 rewrites
- `buildCommand`：指定构建命令为 `npm run build`
- `outputDirectory`：指定输出目录为 `public/`

### package.json

```json
{
  "name": "htmlppt",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "node build.js",
    "dev": "node build.js && npx serve public"
  }
}
```

## 部署流程

### 首次部署

1. 初始化 Git 仓库（如果尚未初始化）
2. 创建 Vercel 项目并关联 Git 仓库
3. 配置构建命令：`npm run build`
4. 配置输出目录：`public`
5. 推送代码到 Git 仓库
6. Vercel 自动触发首次部署

### 后续更新

1. 在 `slides/` 目录添加/修改 HTML 文件
2. （可选）更新 `routes.json` 配置自定义路由
3. 提交并推送到 Git 仓库
4. Vercel 自动触发部署

## 测试计划

### 本地测试

1. 运行 `npm run build`，验证：
   - `public/` 目录正确生成
   - `index.html` 包含所有演示文稿链接
   - 自定义路由的文件已正确重命名
2. 运行 `npm run dev`，验证：
   - 首页可访问
   - 各演示文稿可通过路由访问（/tcp、/udp 等）
   - 外部 CDN 资源正常加载

### Vercel 部署测试

1. 验证自动部署触发
2. 验证路由配置生效
3. 验证外部 CDN 资源加载
4. 验证移动端响应式布局

## 迁移计划

### 现有文件迁移

1. 创建 `slides/` 目录
2. 移动现有 HTML 文件到 `slides/`：
   - `tcp.html` → `slides/tcp.html`
   - `TCP-Presentation-v2.html` → `slides/TCP-Presentation-v2.html`
   - `UDP演示.html` → `slides/UDP演示.html`
3. 创建 `routes.json`（可选）：
   ```json
   {
     "UDP演示.html": "/udp"
   }
   ```
4. 创建 `build.js`、`package.json`、`vercel.json`
5. 运行 `npm run build` 验证
6. 提交并推送到 Git

## 未来扩展

1. **子目录支持**：支持 `slides/network/tcp.html` → `/network/tcp`
2. **标签分类**：通过 frontmatter 或目录结构实现分类
3. **搜索功能**：添加客户端搜索
4. **暗色模式**：首页支持暗色主题
5. **预览图**：为每个演示生成缩略图

## 约束与限制

1. **文件名限制**：避免使用 `/`、`\`、`:`、`*`、`?`、`"`、`<`、`>`、`|` 等文件系统保留字符
2. **路由冲突**：确保自定义路由不与系统路径冲突（如 `/index`、`/404`）
3. **文件大小**：单个 HTML 文件建议不超过 10MB（Vercel 限制）
4. **构建时间**：Vercel 免费计划限制构建时间为 45 分钟

## 总结

本设计通过纯静态方案实现 HTML 演示文稿的自动部署和路由，核心优势：

- **简单**：无需复杂构建工具，仅使用 Node.js 脚本
- **灵活**：支持默认路由和自定义路由
- **自动化**：Git 推送即部署
- **兼容**：保持对外部 CDN 的支持

该方案完全满足需求，且易于维护和扩展。
