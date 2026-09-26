#!/usr/bin/env bash
# 拾页：校验 → 增量构建/封面 → 测试 → 仅提交站点文件 → 推送。
set -Eeuo pipefail
usage() {
  cat <<'HELP'
用法：./scripts/deploy.sh [选项]
  -m, --message TEXT   自定义提交信息
  -n, --no-push        构建并提交，不推送
      --no-commit      构建和检查，不暂存、不提交、不推送
      --dry-run        只校验内容并显示计划，不修改文件
      --skip-screenshots  只复用已有封面，不启动或下载浏览器
      --refresh-thumbs 强制重新生成所有封面
      --no-prune       保留已删除作品的旧封面
  -h, --help           显示帮助

添加作品：放入 content/{presentations,websites,experiments,games}/。
可选信息：content/catalog.json；自定义地址：routes.json。
HELP
}
step() { printf '\n▸ %s\n' "$1"; }
die() { printf '\n✗ %s\n' "$1" >&2; exit 1; }
DO_PUSH=1; DO_COMMIT=1; DO_PRUNE=1; DRY_RUN=0; SKIP_SHOTS=0; REFRESH=0; MSG=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message) [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || die '--message 后需要提交信息'; MSG="$2"; shift 2 ;;
    -n|--no-push) DO_PUSH=0; shift ;;
    --no-commit) DO_COMMIT=0; DO_PUSH=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --skip-screenshots) SKIP_SHOTS=1; shift ;;
    --refresh-thumbs) REFRESH=1; shift ;;
    --no-prune) DO_PRUNE=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数：$1（使用 --help 查看帮助）" ;;
  esac
done
(( ! SKIP_SHOTS || ! REFRESH )) || die '--skip-screenshots 和 --refresh-thumbs 不能同时使用'
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"
command -v node >/dev/null || die '需要安装 Node.js 22+'
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' || die '需要 Node.js 22+'
command -v npm >/dev/null || die '需要安装 npm'
command -v git >/dev/null || die '需要安装 Git'
[[ "$(git rev-parse --show-toplevel 2>/dev/null)" == "$PROJECT_ROOT" ]] || die '脚本必须位于项目 Git 仓库的 scripts/ 目录'
step '校验分类、元数据和路由'
node scripts/content.js check
SCOPE=()
while IFS= read -r -d '' entry; do SCOPE+=("$entry"); done < <(node scripts/deploy-scope.js paths)
(( ${#SCOPE[@]} > 0 )) || die '无法确定站点文件范围'
if (( DO_COMMIT )); then
  BRANCH="$(git symbolic-ref --quiet --short HEAD)" || die '处于 detached HEAD；切回分支，或使用 --no-commit'
  node scripts/deploy-scope.js check-index
  if (( DO_PUSH && ! DRY_RUN )); then
    if ! git rev-parse --verify '@{upstream}' >/dev/null 2>&1; then
      git remote get-url origin >/dev/null 2>&1 || die '没有 origin 远程；使用 --no-push 或先配置远程'
    fi
  fi
fi
if (( DRY_RUN )); then
  step '预演：以下为站点改动，不执行构建、提交或推送'
  node scripts/deploy-scope.js status
  printf '计划：增量构建 → 测试 → 清理封面=%s → 提交=%s → 推送=%s\n' "$DO_PRUNE" "$DO_COMMIT" "$DO_PUSH"
  exit 0
fi
mkdir -p .cache
LOCK_DIR='.cache/deploy.lock'
mkdir "$LOCK_DIR" 2>/dev/null || die '另一个发布进程正在运行；若上次被强制终止，请确认后移除 .cache/deploy.lock'
printf '%s\n' "$$" > "$LOCK_DIR/pid"
cleanup() { local status=$?; rm -f "$LOCK_DIR/pid"; rmdir "$LOCK_DIR" 2>/dev/null || true; if (( status != 0 )); then printf '\n✗ 发布中止，未强制推送；修复错误后可重新运行。\n' >&2; fi; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
step '检查构建依赖'
LOCK_HASH="$(node -e 'const fs=require("fs"),c=require("crypto");process.stdout.write(c.createHash("sha256").update(fs.readFileSync("package-lock.json")).digest("hex"))')"
if [[ ! -d node_modules/playwright || ! -f .cache/dependencies.hash || "$(cat .cache/dependencies.hash)" != "$LOCK_HASH" ]]; then
  npm ci --no-audit --no-fund
  printf '%s' "$LOCK_HASH" > .cache/dependencies.hash
fi
if (( ! SKIP_SHOTS )); then
  PENDING="$(node scripts/content.js pending)"
  if (( REFRESH || PENDING > 0 )); then
    if ! node scripts/install-chromium.js; then printf '⚠ 浏览器安装失败，将保留已有封面并继续；缺少封面的作品显示占位。\n' >&2; fi
  fi
fi
step '构建静态站点'
BUILD_ARGS=()
if (( SKIP_SHOTS )); then BUILD_ARGS+=(--skip-screenshots); fi
if (( REFRESH )); then BUILD_ARGS+=(--refresh-thumbs); fi
node build.js "${BUILD_ARGS[@]}"
[[ -s public/index.html && -s public/collection.json ]] || die '构建产物不完整'
step '验证站点逻辑与发布脚本'
npm test
git diff --check -- "${SCOPE[@]}"
git diff --cached --check -- "${SCOPE[@]}"
if (( DO_PRUNE )); then node scripts/content.js prune; fi
step '作品地址'
node scripts/content.js summary
if (( ! DO_COMMIT )); then
  printf '\n✓ 构建与检查完成，未改动暂存区。运行 npm run preview 查看。\n'
  exit 0
fi
step '提交站点文件'
node scripts/deploy-scope.js check-index
node scripts/deploy-scope.js status
git add -A -- "${SCOPE[@]}"
if git diff --cached --quiet; then
  printf '没有新改动，继续处理可能尚未推送的提交。\n'
else
  if [[ -z "$MSG" ]]; then MSG="chore: publish gallery ($(node scripts/content.js count) works)"; fi
  git commit -m "$MSG"
fi
if (( DO_PUSH )); then
  step '推送远程'
  if git rev-parse --verify '@{upstream}' >/dev/null 2>&1; then git push; else git push -u origin "$BRANCH"; fi
  printf '\n✓ 已推送；已关联的静态站点部署将由 Git 更新触发。\n'
else
  printf '\n✓ 已完成本地提交，按 --no-push 跳过推送。\n'
fi
