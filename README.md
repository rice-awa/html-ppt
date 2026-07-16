# HTML 演示文稿集合

基于 Vercel 自动部署的 HTML 演示文稿展示网站。

## 使用方法

### 添加演示文稿

1. 将 HTML 文件放入 `slides/` 目录
2. 提交并推送到 Git 仓库
3. Vercel 自动部署

### 自定义路由

创建或编辑 `routes.json` 文件：

```json
{
  "UDP演示.html": "/udp",
  "tcp.html": "/my-tcp-demo"
}
```

### 本地开发

```bash
npm install
npm run build
npm run dev
```

访问 http://localhost:3000 查看效果。

### 部署到 Vercel

1. 在 Vercel 导入此 Git 仓库
2. 构建命令：`npm run build`
3. 输出目录：`public`
4. 点击部署

## 项目结构

```
htmlppt/
├── slides/          # HTML 演示文件
├── public/          # 构建输出（自动生成）
├── build.js         # 构建脚本
├── routes.json      # 自定义路由配置
└── vercel.json      # Vercel 配置
```

## 路由规则

- 默认：文件名即路由（`tcp.html` → `/tcp`）
- 自定义：通过 `routes.json` 配置
