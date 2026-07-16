import fs from 'fs';
import path from 'path';
import screenshots from './scripts/screenshots.js';

const slidesDir = 'slides';
const publicDir = 'public';
const routesFile = 'routes.json';
const templatesDir = 'templates';

const escapeHtml = (str) =>
  str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

// 清理并创建 public 目录
if (fs.existsSync(publicDir)) {
  fs.rmSync(publicDir, { recursive: true });
}
fs.mkdirSync(publicDir);

// 读取自定义路由配置
let routes = {};
if (fs.existsSync(routesFile)) {
  routes = JSON.parse(fs.readFileSync(routesFile, 'utf-8'));
}

// 扫描 slides 目录
const slides = fs.readdirSync(slidesDir).filter(f => f.endsWith('.html'));

const presentations = [];

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
    targetFile = routePath.replace(/^\//, '') + '.html';
  }

  const targetPath = path.join(publicDir, targetFile);
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

// 生成缩略图
const thumbResults = await screenshots(presentations, { publicDir });
const thumbMap = Object.fromEntries(thumbResults.map(r => [r.route, r.thumbnailUrl]));
for (const p of presentations) {
  p.thumbnailUrl = thumbMap[p.route] || null;
}

// 生成首页索引（模板位于 templates/ 目录）
const indexTemplate = fs.readFileSync(path.join(templatesDir, 'index.html'), 'utf-8');

let listHtml;
if (presentations.length > 0) {
  const cardTemplate = fs.readFileSync(path.join(templatesDir, 'card.html'), 'utf-8');
  listHtml = presentations.map((p, i) => {
    const descBlock = p.description
      ? `          <p class="deck-desc">${escapeHtml(p.description)}</p>`
      : '';
    const thumbBlock = p.thumbnailUrl
      ? `        <div class="deck-thumb"><img src="${escapeHtml(p.thumbnailUrl)}" alt=""></div>`
      : `        <div class="deck-thumb deck-thumb-placeholder"><span>${escapeHtml(p.title.slice(0, 1))}</span></div>`;
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

const indexHtml = indexTemplate
  .replaceAll('{{CARDS}}', listHtml)
  .replaceAll('{{COUNT}}', String(presentations.length));

fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml);
console.log(`\n✓ 生成首页索引，包含 ${presentations.length} 个演示文稿`);
