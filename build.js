import fs from 'fs';
import path from 'path';
import screenshots from './scripts/screenshots.js';

const slidesDir = 'slides';
const publicDir = 'public';
const routesFile = 'routes.json';
const templatesDir = 'templates';
const ASSETS_THUMBS_DIR = 'assets/thumbs';

const escapeHtml = (str) =>
  str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

const replaceSinglePlaceholder = (template, placeholder, value) => {
  const count = template.split(placeholder).length - 1;
  if (count !== 1) {
    throw new Error(`模板占位符 ${placeholder} 应出现 1 次，实际出现 ${count} 次`);
  }
  return template.replace(placeholder, () => value);
};

// 清理并创建 public 目录
if (fs.existsSync(publicDir)) {
  fs.rmSync(publicDir, { recursive: true });
}
fs.mkdirSync(publicDir);

// 读取自定义路由配置
let routes = {};
if (fs.existsSync(routesFile)) {
  try {
    routes = JSON.parse(fs.readFileSync(routesFile, 'utf-8'));
  } catch (err) {
    console.error(`❌ 读取 ${routesFile} 失败: ${err.message}`);
    process.exit(1);
  }
}

// 确保 slides 目录存在
if (!fs.existsSync(slidesDir)) {
  fs.mkdirSync(slidesDir, { recursive: true });
  console.log(`ℹ️ 创建 ${slidesDir} 目录`);
}

// 检查模板文件是否存在
const indexTemplatePath = path.join(templatesDir, 'index.html');
const cardTemplatePath = path.join(templatesDir, 'card.html');
for (const tplPath of [indexTemplatePath, cardTemplatePath]) {
  if (!fs.existsSync(tplPath)) {
    console.error(`❌ 缺少模板文件: ${tplPath}`);
    process.exit(1);
  }
}

// 扫描 slides 目录
const slides = fs.readdirSync(slidesDir).filter(f => f.endsWith('.html'));

const presentations = [];
const publicDirAbs = path.resolve(publicDir);

for (const slideFile of slides) {
  const sourcePath = path.join(slidesDir, slideFile);
  const content = fs.readFileSync(sourcePath, 'utf-8');

  // 提取标题
  const titleMatch = content.match(/<title>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : slideFile.replace('.html', '');

  // 提取描述
  const descMatch = content.match(/<meta\s+name="description"\s+content="(.*?)"/i);
  const description = descMatch ? descMatch[1] : '';

  // 确定目标文件名
  let targetFile = slideFile;
  if (routes[slideFile]) {
    const routePath = routes[slideFile];
    targetFile = String(routePath).replace(/^\//, '') + '.html';
  }

  const targetPath = path.resolve(publicDirAbs, targetFile);

  // 防止路径越界
  if (targetPath !== publicDirAbs && !targetPath.startsWith(publicDirAbs + path.sep)) {
    console.error(`❌ 跳过越界路由: ${slideFile} → ${targetFile}`);
    continue;
  }

  // 确保目标目录存在
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);

  // 生成路由路径（用于索引页）
  const route = '/' + targetFile.replace(/\.html$/, '');

  presentations.push({
    title,
    description,
    route,
    file: slideFile,
    sourcePath
  });

  console.log(`✓ ${slideFile} → ${route}`);
}

// 生成缩略图：Vercel 环境直接复制预置图片，本地环境运行 Playwright 截图
const isVercel = !!process.env.VERCEL;
if (isVercel) {
  const assetsThumbsPath = path.join(ASSETS_THUMBS_DIR);
  const publicThumbsPath = path.join(publicDir, 'thumbs');
  if (fs.existsSync(assetsThumbsPath)) {
    fs.mkdirSync(publicThumbsPath, { recursive: true });
    for (const f of fs.readdirSync(assetsThumbsPath)) {
      if (f.endsWith('.png')) {
        fs.copyFileSync(path.join(assetsThumbsPath, f), path.join(publicThumbsPath, f));
      }
    }
    console.log(`✓ 从 ${ASSETS_THUMBS_DIR} 复制预置缩略图`);
  }
  for (const p of presentations) {
    const routeBase = p.route.replace(/^\//, '') || 'index';
    const thumbName = routeBase.replace(/[^a-zA-Z0-9_-]/g, '_') + '.png';
    const thumbPath = path.join(publicThumbsPath, thumbName);
    p.thumbnailUrl = fs.existsSync(thumbPath) ? `/thumbs/${thumbName}` : null;
  }
} else {
  const thumbResults = await screenshots(presentations, { publicDir });
  const thumbMap = Object.fromEntries(thumbResults.map(r => [r.route, r.thumbnailUrl]));
  for (const p of presentations) {
    p.thumbnailUrl = thumbMap[p.route] || null;
  }
}

// 生成首页索引（模板位于 templates/ 目录）
const indexTemplate = fs.readFileSync(indexTemplatePath, 'utf-8');
const cardTemplate = fs.readFileSync(cardTemplatePath, 'utf-8');

let listHtml;
if (presentations.length > 0) {
  listHtml = presentations.map((p, i) => {
    const descBlock = p.description
      ? `          <p class="deck-desc">${escapeHtml(p.description)}</p>`
      : '';
    const loading = i < 3 ? 'eager' : 'lazy';
    const fetchPriority = i === 0 ? 'high' : (i < 3 ? 'auto' : 'low');
    const thumbBlock = p.thumbnailUrl
      ? `        <div class="deck-thumb"><img src="${escapeHtml(p.thumbnailUrl)}" alt="" width="1280" height="720" loading="${loading}" fetchpriority="${fetchPriority}" decoding="async"></div>`
      : `        <div class="deck-thumb deck-thumb-placeholder"><span>${escapeHtml(p.title.slice(0, 1) || '?')}</span></div>`;
    return cardTemplate
      .replaceAll('{{INDEX}}', String(i))
      .replaceAll('{{INDEX_LABEL}}', String(i + 1).padStart(2, '0'))
      .replaceAll('{{TITLE}}', escapeHtml(p.title))
      .replaceAll('{{DESC_BLOCK}}', descBlock)
      .replaceAll('{{THUMB_BLOCK}}', thumbBlock)
      .replaceAll('{{ROUTE}}', p.route);
  }).join('\n');
} else {
  listHtml = `      <div class="empty-state">暂无演示文稿，将 HTML 文件放入 <code>slides/</code> 目录后重新构建。</div>`;
}

const indexHtml = replaceSinglePlaceholder(
  replaceSinglePlaceholder(indexTemplate, '{{COUNT}}', String(presentations.length)),
  '{{CARDS}}',
  listHtml
);

fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml);
console.log(`\n✓ 生成首页索引，包含 ${presentations.length} 个演示文稿`);
