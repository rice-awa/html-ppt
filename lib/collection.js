import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const CATEGORIES = [
  { id: 'presentations', name: '演示文稿' },
  { id: 'websites', name: '网站' },
  { id: 'experiments', name: '交互实验' },
  { id: 'games', name: '游戏' },
];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const encodePath = value => value.split('/').map(encodeURIComponent).join('/');
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function readJSON(file, fallback = {}) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error('无法读取 JSON：' + file + ' — ' + error.message); }
}
function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, key) => {
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    if (key[0] !== '#') return entities[key.toLowerCase()] ?? whole;
    const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : whole;
  });
}
export function htmlMetadata(source) {
  const html = source.replace(/<!--[^]*?-->/g, '').replace(/<script\b[^>]*>[^]*?<\/script>/gi, '');
  const title = decodeEntities((html.match(/<title\b[^>]*>([^]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim());
  const meta = {};
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const attr of match[0].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[attr[1].toLowerCase()] = decodeEntities(attr[2] ?? attr[3] ?? attr[4]);
    if (attrs.name && attrs.content) meta[attrs.name.toLowerCase()] = attrs.content;
  }
  return { title, description: meta.description || '', tags: (meta['gallery-tags'] || meta.keywords || '').split(/[,，、]/).map(t => t.trim()).filter(Boolean) };
}
export function treeFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (entry.isSymbolicLink()) throw new Error('内容目录不允许符号链接：' + path.join(directory, entry.name));
    if (entry.name.startsWith('.')) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...treeFiles(file));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}
export function sourceHash(sourcePath, bundleDir = null) {
  const hash = crypto.createHash('sha256');
  if (bundleDir) for (const file of treeFiles(bundleDir)) { hash.update(path.relative(bundleDir, file).split(path.sep).join('/')); hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0'); }
  else hash.update(fs.readFileSync(sourcePath));
  return hash.digest('hex');
}
export function validateRoute(route) {
  if (typeof route !== 'string' || !route.startsWith('/') || route === '/' || route.endsWith('/') || /[?#\\%:\x00-\x1f]/.test(route)) throw new Error('非法路由：' + String(route));
  const parts = route.slice(1).split('/');
  if (parts.some(p => !p || p.startsWith('.') || p.trim() !== p) || /\.(html?|json|css|js)$/i.test(route)) throw new Error('路由必须是不含扩展名的有效路径：' + route);
  if (['index', 'site', 'thumbs', 'collection', 'favicon.ico'].includes(parts[0].toLowerCase())) throw new Error('路由占用站点保留路径：' + route);
  return route;
}
export function thumbnailName(route) {
  const slug = route.slice(1).replace(/[^a-zA-Z0-9_-]/g, '_');
  // Preserve all previous ASCII thumbnail names. Disambiguate nested/Unicode routes.
  return slug + (/^\/[a-zA-Z0-9_-]+$/.test(route) ? '' : '-' + crypto.createHash('sha256').update(route).digest('hex').slice(0, 10)) + '.webp';
}
export function loadCollection(root = ROOT) {
  const contentDir = path.join(root, 'content');
  if (!fs.existsSync(contentDir)) throw new Error('缺少 content/ 目录');
  const catalog = readJSON(path.join(contentDir, 'catalog.json'));
  const routes = readJSON(path.join(root, 'routes.json'));
  if (!object(catalog) || !object(routes)) throw new Error('catalog.json 与 routes.json 顶层必须是对象');
  const warnings = [], works = [], usedRoutes = new Set(), usedCatalog = new Set();
  for (const entry of fs.readdirSync(contentDir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('content/ 不允许符号链接：' + entry.name);
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory() && !CATEGORIES.some(c => c.id === entry.name)) throw new Error('未知分类目录：content/' + entry.name);
    if (entry.isFile() && /\.html?$/i.test(entry.name)) throw new Error('请将 HTML 放入分类目录：' + entry.name);
  }
  for (const category of CATEGORIES) {
    const dir = path.join(contentDir, category.id);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.isSymbolicLink()) throw new Error('不允许符号链接：' + entry.name);
      if (entry.name.startsWith('.')) continue;
      let sourcePath, bundleDir = null;
      if (entry.isFile() && /\.html?$/i.test(entry.name)) sourcePath = path.join(dir, entry.name);
      else if (entry.isDirectory()) {
        bundleDir = path.join(dir, entry.name); sourcePath = path.join(bundleDir, 'index.html');
        if (!fs.existsSync(sourcePath)) throw new Error('作品文件夹必须包含 index.html：' + bundleDir);
        treeFiles(bundleDir); // Reject symlinks before copying or hashing.
      } else continue;
      const file = path.relative(contentDir, sourcePath).split(path.sep).join('/');
      const metadata = Object.hasOwn(catalog, file) ? catalog[file] : {};
      if (!object(metadata)) throw new Error('作品元数据必须是对象：' + file);
      for (const key of ['title', 'description']) if (metadata[key] !== undefined && typeof metadata[key] !== 'string') throw new Error(file + ': ' + key + ' 必须是字符串');
      if (metadata.tags !== undefined && (!Array.isArray(metadata.tags) || metadata.tags.some(t => typeof t !== 'string'))) throw new Error(file + ': tags 必须是字符串数组');
      if (metadata.order !== undefined && (typeof metadata.order !== 'number' || !Number.isFinite(metadata.order))) throw new Error(file + ': order 必须是有效数字');
      usedCatalog.add(file);
      const basename = path.basename(sourcePath);
      const defaultSlug = bundleDir ? entry.name : basename.replace(/\.html?$/i, '');
      const key = Object.hasOwn(routes, file) ? file : (!bundleDir && Object.hasOwn(routes, basename) ? basename : null);
      const route = validateRoute(key ? routes[key] : '/' + defaultSlug);
      if (key) usedRoutes.add(key);
      const parsed = htmlMetadata(fs.readFileSync(sourcePath, 'utf8'));
      works.push({ id: file, file, sourcePath, bundleDir, category: category.name, categoryId: category.id,
        title: metadata.title?.trim() || parsed.title || defaultSlug,
        description: metadata.description ?? parsed.description,
        tags: [...new Set((metadata.tags ?? parsed.tags).map(t => t.trim()).filter(Boolean))],
        order: metadata.order ?? Number.MAX_SAFE_INTEGER,
        route, url: encodePath(route) + (bundleDir ? '/' : ''),
        target: route.slice(1) + (bundleDir ? '/index.html' : '.html'),
        thumbnailName: thumbnailName(route), hash: sourceHash(sourcePath, bundleDir), image: null,
      });
    }
  }
  const seen = new Map();
  for (const work of works) {
    const key = work.route.toLowerCase();
    if (seen.has(key)) throw new Error('路由冲突 ' + work.route + '：' + seen.get(key) + ' 与 ' + work.file + '，请在 routes.json 指定不同地址');
    seen.set(key, work.file);
    for (const other of works) if (other !== work && work.bundleDir && other.route.toLowerCase().startsWith(key + '/')) throw new Error('路由落入其他作品的资源目录：' + other.route + ' / ' + work.route);
  }
  for (const key of Object.keys(catalog)) if (!usedCatalog.has(key)) warnings.push('元数据已无对应作品：' + key);
  for (const key of Object.keys(routes)) if (!usedRoutes.has(key)) warnings.push('路由配置已无对应作品：' + key);
  works.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-CN'));
  return { works, categories: CATEGORIES, warnings };
}
export function publicWork(work) {
  const { id, title, description, tags, category, categoryId, route, url, image } = work;
  return { id, title, description, tags, category, categoryId, route, url, image };
}
