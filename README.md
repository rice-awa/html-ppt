# 拾页 · HTML Gallery

纯静态 HTML 作品展示站：搜索、分类、多标签筛选、网格/列表、封面预览、平滑明暗主题切换。没有上传表单或管理后端。

## 添加作品

将 HTML 放入对应目录，分类自动确定：

| 目录 | 分类 |
| --- | --- |
| `content/presentations/` | 演示文稿 |
| `content/websites/` | 网站 |
| `content/experiments/` | 交互实验 |
| `content/games/` | 游戏 |

例如 `content/games/my-game.html` 对应 `/my-game`。无需在脚本中登记。

```html
<title>我的小游戏</title>
<meta name="description" content="用方向键探索一个小世界。">
<meta name="gallery-tags" content="创意编程,游戏">
```

标签也支持 keywords。带资源的作品使用目录入口：

```text
content/games/my-game/
├── index.html
├── styles.css
├── game.js
└── images/
```

对应 `/my-game/`，资源使用相对引用。辅助 HTML 不会重复收录。隐藏文件和目录不发布，不支持符号链接。

## 编辑信息与路由

可选的 `content/catalog.json` 覆盖展示信息，无需改动原作：

```json
{
  "games/my-game.html": {
    "title": "我的小游戏",
    "description": "简短介绍",
    "tags": ["创意编程", "游戏"],
    "order": 10
  }
}
```

字段可省略，order 越小越靠前。目录决定分类，移动后同步修改元数据键。删除作品后建议清理对应记录，残留记录会给出提示。

自定义地址写在 `routes.json`：

```json
{
  "games/my-game.html": "/play",
  "websites/my-site/index.html": "/portfolio"
}
```

路由不写 .html 或末尾斜杠，文件夹作品链接自动补斜杠。重名、越界、占用首页或保留路径会在构建前报错。原有 13 个作品保留原地址，包括 `/UDP` 的大小写。

## 本地预览

需要 Node.js 22+。

```bash
npm ci
npm run dev
```

打开 http://127.0.0.1:3000 。开发预览复用封面，修改后运行 `npm run build:fast` 并刷新。可用 `PORT=3001 npm run dev` 更换端口。

| 命令 | 用途 |
| --- | --- |
| `npm run check` | 校验内容和路由 |
| `npm run build` | 增量生成封面并构建 |
| `npm run build:fast` | 复用封面快速构建 |
| `npm run preview` | 预览已有 public/ |
| `npm run setup:browser` | 安装截图需要的 Chromium |
| `npm run thumbnails` | 强制更新全部封面 |
| `npm test` | 运行内容、筛选、主题、路由和发布测试 |

首次主题跟随系统，手动选择后记住。筛选地址可分享，后退恢复筛选。关闭 JavaScript 仍可浏览作品和打开原作。

## 一键发布

```bash
./scripts/deploy.sh
```

支持从任何目录调用。顺序：校验 → 依赖检查 → 增量构建 → 测试 → 清理封面 → 提交站点文件 → 推送。

```bash
# 本地构建检查，不暂存、不提交、不推送
./scripts/deploy.sh --no-commit
# 只显示计划，不修改文件
./scripts/deploy.sh --dry-run
# 不下载或启动截图浏览器
./scripts/deploy.sh --no-commit --skip-screenshots
# 自定义提交信息
./scripts/deploy.sh -m "feat: add my-game"
```

| 参数 | 行为 |
| --- | --- |
| `-m, --message TEXT` | 自定义提交信息 |
| `-n, --no-push` | 构建并提交，不推送 |
| `--no-commit` | 构建检查，不修改暂存区 |
| `--dry-run` | 只校验并显示计划 |
| `--skip-screenshots` | 复用已有封面 |
| `--refresh-thumbs` | 强制更新封面，不能与上一项同时使用 |
| `--no-prune` | 保留已删除作品的旧封面 |

只暂存站点内容、代码、测试、配置、品牌规范和 README，不自动包含报告、历史原型和其他文件。如果已有范围外文件暂存，脚本停止且保留暂存区。推送失败保留本地提交，不强制推送。

封面按内容及资源哈希更新。截图失败保留旧图，缺图显示占位，下次重试。发布锁在 `.cache/deploy.lock`；若进程被强制终止，确认没有发布任务后再移除锁。

## 部署与目录

保留 Vercel 配置：构建 `npm run build`，输出 public，cleanUrls 开启。Vercel 只复制仓库中的封面，不启动浏览器。其他静态服务器需将 /name 映射至 /name.html、目录映射至 index.html。默认部署在域名根目录。

```text
content/                 # 四类作品与 catalog.json
site/                    # CSS、浏览器脚本、图标
templates/              # 首页和卡片模板
lib/                     # 内容扫描、渲染、静态服务
assets/thumbs/           # 封面与哈希清单
scripts/                 # 发布、预览、校验、截图
tests/                  # 自动化测试
docs/prototypes/        # 历史原型，不部署
reports/                 # 研究资料，不部署
public/                  # 构建输出，不提交
build.js                 # 构建入口
routes.json              # 自定义地址
vercel.json              # 托管配置
```

构建先写临时目录，成功后替换 public；校验或渲染失败时保留上一份产物。
