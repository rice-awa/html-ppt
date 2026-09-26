import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { escapeHtml as esc, publicWork } from './collection.js';
export function stylesheetURL(root) {
  const hash = createHash('sha256').update(fs.readFileSync(path.join(root, 'site/gallery.css'))).digest('hex').slice(0, 16);
  return '/site/gallery.' + hash + '.css';
}
function fill(template, values) {
  const output = template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!Object.hasOwn(values, key)) throw new Error('缺少模板字段：' + key);
    return values[key];
  });
  return output;
}
function image(work, index, hero = false) {
  if (!work.image) return '<span class="empty-placeholder">封面待补充 · ' + esc(work.title) + '</span>';
  return '<img src="' + esc(work.image) + '" alt="' + esc(work.title) + '的页面截图" width="1280" height="720" loading="' + (hero || index < 3 ? 'eager' : 'lazy') + '" fetchpriority="' + (hero && index === 0 ? 'high' : (index < 3 ? 'auto' : 'low')) + '" decoding="async">';
}
function hero(works) {
  const featured = works.filter(w => w.image).slice(0, 2);
  if (!featured.length) return '';
  return '<div class="hero-art" aria-label="作品选览"><div class="art-backdrop"></div>' + featured.map((w, i) => '<a class="paper-preview paper-' + (i ? 'front' : 'back') + '" href="' + esc(w.url) + '" target="_blank" rel="noopener" aria-label="打开 ' + esc(w.title) + '">' + image(w, i, true) + '<span class="paper-caption">' + esc(w.title) + '<svg aria-hidden="true"><use href="#i-arrow"/></svg></span></a>').join('') + '<span class="art-note">Made to be explored.<svg viewBox="0 0 40 30" aria-hidden="true"><path d="M2 24Q28 29 33 5m-8 5 9-7 3 11"/></svg></span></div>';
}
export function renderIndex(root, collection) {
  const template = fs.readFileSync(path.join(root, 'templates/index.html'), 'utf8');
  const card = fs.readFileSync(path.join(root, 'templates/card.html'), 'utf8');
  const { works, categories } = collection;
  const tags = [...new Set(works.flatMap(w => w.tags))];
  const allCategories = [{ id: 'all', name: '全部' }, ...categories];
  const data = { categories, works: works.map(publicWork) };
  return fill(template, {
    STYLESHEET_URL: stylesheetURL(root),
    COUNT: String(works.length), HERO: hero(works),
    CATEGORIES: allCategories.map(c => '<button class="category" data-category="' + c.id + '" aria-pressed="' + (c.id === 'all') + '">' + c.name + '<span>' + String(c.id === 'all' ? works.length : works.filter(w => w.categoryId === c.id).length).padStart(2, '0') + '</span></button>').join(''),
    TAGS: tags.map(t => '<button class="tag" data-tag="' + esc(t) + '" aria-pressed="false">' + esc(t) + '</button>').join(''),
    CARDS: works.length ? works.map((w, i) => fill(card, { ID: esc(w.id), URL: esc(w.url), TITLE: esc(w.title), DESCRIPTION: esc(w.description || '打开这一页，探索作品的完整内容。'), IMAGE: image(w, i), CATEGORY: esc(w.category), TAGS: w.tags.map(t => '<span class="card-tag card-tag-static">' + esc(t) + '</span>').join('') })).join('\n') : '<p class="empty">作品正在整理中，欢迎稍后再来。</p>',
    DATA: JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'),
  });
}
