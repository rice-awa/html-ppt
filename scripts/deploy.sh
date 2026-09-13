#!/usr/bin/env bash
#
# 一键构建并推送：把 HTML 丢进 slides/ 后运行
#
#   ./scripts/deploy.sh
#
# 它会依次：构建 public/ → 校验缩略图 → 清理废弃缩略图 → 提交 → 推送。
# 推送后 Vercel 会自动部署。
#
# 选项：
#   -m, --message "文案"  自定义提交信息（默认按新增/修改的文稿自动生成）
#   -n, --no-push         只构建并提交，不推送
#       --no-commit       只构建，不提交、不推送
#       --no-prune        保留 slides/ 中已删除文稿的旧缩略图
#   -h, --help            显示帮助
#
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; CYAN=''; RESET=''
fi

step() { printf '\n%s▸ %s%s\n' "$BOLD$CYAN" "$1" "$RESET"; }
info() { printf '  %s\n' "$1"; }
ok()   { printf '  %s✓ %s%s\n' "$GREEN" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }
die()  { printf '\n%s✗ %s%s\n' "$RED" "$1" "$RESET" >&2; exit 1; }

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }

DO_PUSH=1
DO_COMMIT=1
DO_PRUNE=1
MSG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message) MSG="${2:-}"; shift 2 ;;
    -n|--no-push) DO_PUSH=0; shift ;;
    --no-commit)  DO_COMMIT=0; DO_PUSH=0; shift ;;
    --no-prune)   DO_PRUNE=0; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            die "未知参数: $1（用 -h 查看用法）" ;;
  esac
done

# ---------- 环境检查 ----------
step "检查环境"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "当前目录不是 git 仓库"
[[ -d slides ]] || die "找不到 slides/ 目录"
command -v node >/dev/null 2>&1 || die "未找到 node，请先安装 Node 22+"
command -v npm  >/dev/null 2>&1 || die "未找到 npm"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" == "HEAD" ]] && die "处于 detached HEAD 状态，请先切回分支"
info "分支：$BRANCH"

# ---------- 记录构建前的 slides 改动，用于生成提交信息 ----------
SLIDES_ADDED=(); SLIDES_MODIFIED=(); SLIDES_DELETED=()
while IFS=' ' read -r xy path rest; do
  [[ -n "${path:-}" ]] || continue
  case "$xy" in R*|C*) path="${rest##*-> }" ;; esac
  case "$path" in *.html) ;; *) continue ;; esac
  case "$xy" in
    '??'|?A|A?|A) SLIDES_ADDED+=("$path") ;;
    *D*)          SLIDES_DELETED+=("$path") ;;
    *)            SLIDES_MODIFIED+=("$path") ;;
  esac
done < <(git status --porcelain -- slides)

slide_count=$(find slides -maxdepth 1 -name '*.html' | wc -l | tr -d ' ')
info "slides/ 中有 $slide_count 个演示文稿"

if [[ -z "$(git status --porcelain)" ]] && [[ -z "$(git log --branches --not --remotes --oneline)" ]]; then
  info "工作区干净且没有待推送的提交，无需操作"
  exit 0
fi

# ---------- 依赖 ----------
if [[ ! -d node_modules ]]; then
  step "安装依赖"
  if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
fi

# ---------- 构建 ----------
step "构建 public/"
npm run build
[[ -f public/index.html ]] || die "构建失败：没有生成 public/index.html"

# ---------- 缩略图：按 slides/ + routes.json 算出应有文件名（与 build.js 保持一致） ----------
expected_thumbs() {
  node --input-type=module -e '
    import fs from "node:fs";
    let routes = {};
    try { routes = JSON.parse(fs.readFileSync("routes.json", "utf8")); } catch {}
    for (const f of fs.readdirSync("slides").filter((f) => f.endsWith(".html")).sort()) {
      const target = routes[f] ? String(routes[f]).replace(/^\//, "") + ".html" : f;
      const route = "/" + target.replace(/\.html$/, "");
      process.stdout.write(route.replace(/^\//, "").replace(/[^a-zA-Z0-9_-]/g, "_") + ".webp\n");
    }
  '
}

step "校验缩略图"
EXPECTED=()
while IFS= read -r line; do [[ -n "$line" ]] && EXPECTED+=("$line"); done < <(expected_thumbs)

if (( slide_count > 0 )) && (( ${#EXPECTED[@]} == 0 )); then
  die "无法解析 slides/ 中的文稿（检查 routes.json 是否是合法 JSON）"
fi

mkdir -p assets/thumbs
missing=(); synced=0
for name in "${EXPECTED[@]}"; do
  [[ -f "public/thumbs/$name" ]] || missing+=("$name")
  if [[ ! -f "assets/thumbs/$name" ]] && [[ -f "public/thumbs/$name" ]]; then
    cp "public/thumbs/$name" "assets/thumbs/$name"   # 命中缓存时 build 不会回写 assets/
    synced=$((synced + 1))
  fi
done

if (( ${#missing[@]} > 0 )); then
  warn "以下缩略图没有生成，首页会显示占位符：${missing[*]}"
  warn "可尝试：npx playwright install chromium 后重新运行本脚本"
elif (( synced > 0 )); then
  ok "补写 $synced 张缩略图到 assets/thumbs/"
else
  ok "缩略图齐全"
fi

# ---------- 清理 slides/ 中已不存在的文稿留下的缩略图 ----------
if (( DO_PRUNE )) && (( slide_count > 0 )); then
  pruned=0
  for f in assets/thumbs/*.webp; do
    [[ -e "$f" ]] || continue
    name="$(basename "$f")"
    keep=0
    for keep_name in "${EXPECTED[@]}"; do
      [[ "$name" == "$keep_name" ]] && { keep=1; break; }
    done
    if (( keep == 0 )); then
      rm -f "$f"
      warn "删除废弃缩略图 assets/thumbs/$name（slides/ 中已无对应文稿）"
      pruned=$((pruned + 1))
    fi
  done
  if (( pruned == 0 )); then ok "没有废弃缩略图"; fi
fi

# ---------- 提交信息 ----------
join_names() {
  local out=() f
  for f in "$@"; do out+=("$(basename "$f" .html)"); done
  local joined; printf -v joined '%s、' "${out[@]}"
  printf '%s' "${joined%、}"
}

if [[ -z "$MSG" ]] && (( DO_COMMIT )); then
  total=$(( ${#SLIDES_ADDED[@]} + ${#SLIDES_MODIFIED[@]} + ${#SLIDES_DELETED[@]} ))
  if (( total > 3 )); then
    MSG="feat: rebuild slides ($total decks)"
  else
    parts=()
    if (( ${#SLIDES_ADDED[@]}    > 0 )); then parts+=("add $(join_names "${SLIDES_ADDED[@]}") slides"); fi
    if (( ${#SLIDES_MODIFIED[@]} > 0 )); then parts+=("update $(join_names "${SLIDES_MODIFIED[@]}") slides"); fi
    if (( ${#SLIDES_DELETED[@]}  > 0 )); then parts+=("remove $(join_names "${SLIDES_DELETED[@]}") slides"); fi
    if (( ${#parts[@]} == 0 )); then
      if [[ -n "$(git status --porcelain -- routes.json)" ]]; then
        MSG="chore: update routes.json"
      else
        MSG="chore: rebuild slides"
      fi
    else
      joined=""; for p in "${parts[@]}"; do joined+="$p and "; done
      MSG="feat: ${joined% and }"
    fi
  fi
fi

# ---------- 提交 ----------
if (( ! DO_COMMIT )); then
  step "跳过提交（--no-commit）"
  info "构建产物在 public/，可运行 npm run dev 本地预览"
  exit 0
fi

step "提交改动"
git add -A
if git diff --cached --quiet; then
  info "没有需要提交的改动"
else
  git commit -m "$MSG"
  ok "$(git log -1 --pretty=%s)"
fi

# ---------- 推送 ----------
step "推送远程"
if (( ! DO_PUSH )); then
  info "已跳过推送（--no-push）"
elif git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git push
  ok "已推送到 $(git rev-parse --abbrev-ref '@{u}')，Vercel 将自动部署"
else
  git push -u origin HEAD
  ok "已推送到 origin/$BRANCH（已设置上游），Vercel 将自动部署"
fi

# ---------- 汇总 ----------
step "完成"
routes="$(grep -oE '<span class="deck-route">[^<]+' public/index.html | sed 's/.*>//' | sort || true)"
if [[ -n "$routes" ]]; then
  info "线上路由（共 $slide_count 个）："
  while IFS= read -r r; do [[ -n "$r" ]] && printf '  %s%s%s\n' "$DIM" "$r" "$RESET"; done <<< "$routes"
fi
