# HTML 演示文稿集合

基于 Vercel 自动部署的 HTML 演示文稿展示网站。

## 使用方法

### 一键构建并推送

把 HTML 文件丢进 `slides/`，然后运行：

```bash
./scripts/deploy.sh
```

脚本会依次：构建 `public/` → 生成/校验缩略图 → 提交 → 推送，Vercel 随即自动部署。

| 选项 | 说明 |
| --- | --- |
| `-m, --message "文案"` | 自定义提交信息（默认按新增/修改的文稿自动生成） |
| `-n, --no-push` | 只构建并提交，不推送 |
| `--no-commit` | 只构建，不提交、不推送 |
| `--no-prune` | 保留 `slides/` 中已删除文稿的旧缩略图 |

### 添加演示文稿（手动流程）

1. 将 HTML 文件放入 `slides/` 目录
2. 提交并推送到 Git 仓库（记得带上 `assets/thumbs/` 里新生成的缩略图，Vercel 构建时从这里取图）
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
├── assets/thumbs/   # 缩略图（提交到仓库，供 Vercel 构建使用）
├── scripts/         # deploy.sh 一键部署脚本 / 缩略图截图
├── build.js         # 构建脚本
├── routes.json      # 自定义路由配置
└── vercel.json      # Vercel 配置
```

## 路由规则

- 默认：文件名即路由（`tcp.html` → `/tcp`）
- 自定义：通过 `routes.json` 配置
