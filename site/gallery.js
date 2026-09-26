import { readFilters, selectWorks, filterParams } from './filters.js';

const $ = id => document.getElementById(id);
const { works, categories } = JSON.parse($('collection-data').textContent);
const allTags = [...new Set(works.flatMap(w => w.tags))];
const cards = new Map([...document.querySelectorAll('.card')].map(card => [card.dataset.workId, card]));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const colorScheme = matchMedia('(prefers-color-scheme: dark)');
const easeOut = 'cubic-bezier(0.23, 1, 0.32, 1)';
let state = readFilters(location.search, categories, allTags);
let chosenTheme = null;
try { const saved = localStorage.getItem('shiye-theme'); if (['light', 'dark'].includes(saved)) chosenTheme = saved; } catch { /* Theme still works when storage is unavailable. */ }

function reflectTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('theme-toggle').setAttribute('aria-pressed', String(theme === 'dark'));
  $('theme-toggle').setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
  $('theme-toggle').title = theme === 'dark' ? '切换到浅色主题' : '切换到深色主题';
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#20251f' : '#f6f5f0';
}
reflectTheme(chosenTheme || (colorScheme.matches ? 'dark' : 'light'));
// Enable transitions only after the initial persisted/system theme has painted.
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('theme-ready')));
$('theme-toggle').addEventListener('click', event => {
  chosenTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  if (event.detail === 0) document.documentElement.classList.remove('theme-ready');
  reflectTheme(chosenTheme);
  if (event.detail === 0) requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('theme-ready')));
  try { localStorage.setItem('shiye-theme', chosenTheme); } catch { /* Private browsing: keep the choice for this visit. */ }
});
colorScheme.addEventListener('change', event => { if (!chosenTheme) reflectTheme(event.matches ? 'dark' : 'light'); });
window.addEventListener('storage', event => {
  if (event.key === 'shiye-theme' || event.key === null) {
    chosenTheme = ['light', 'dark'].includes(event.newValue) ? event.newValue : null;
    reflectTheme(chosenTheme || (colorScheme.matches ? 'dark' : 'light'));
  }
});

function syncURL(mode) {
  const query = filterParams(state).toString();
  const target = location.pathname + (query ? '?' + query : '') + location.hash;
  if (target !== location.pathname + location.search + location.hash) history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', target);
}
function cancelCardMotion() { for (const card of cards.values()) (card.getAnimations?.() || []).forEach(animation => animation.cancel()); }
function render({ animate = false, historyMode = null } = {}) {
  const motion = animate && !reducedMotion.matches && typeof Element.prototype.animate === 'function';
  const before = new Map();
  if (motion) for (const [id, card] of cards) if (!card.hidden) before.set(id, card.getBoundingClientRect());
  cancelCardMotion();
  const visible = selectWorks(works, state), visibleIds = new Set(visible.map(w => w.id));
  document.body.classList.toggle('list-mode', state.list);
  for (const [id, card] of cards) card.hidden = !visibleIds.has(id);
  const fragment = document.createDocumentFragment();
  for (const work of visible) fragment.append(cards.get(work.id));
  $('cards').append(fragment);
  if (motion) for (const work of visible) {
    const card = cards.get(work.id), previous = before.get(work.id), current = card.getBoundingClientRect();
    // Do not animate far-offscreen rows; keep filtering fast in a larger collection.
    if (current.bottom < 0 || current.top > innerHeight) continue;
    if (previous) {
      const dx = previous.left - current.left, dy = previous.top - current.top;
      if (Math.abs(dx) + Math.abs(dy) > 1) card.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }], { duration: 220, easing: easeOut });
    } else card.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: easeOut });
  }
  $('empty').hidden = visible.length !== 0 || works.length === 0;
  $('result-count').textContent = '显示 ' + visible.length + ' / ' + works.length + ' 件作品' + (state.tags.length > 1 ? ' · 标签同时匹配' : '');
  $('reset').hidden = !(state.q || state.category !== 'all' || state.tags.length);
  $('search').value = state.q; $('sort').value = state.sort;
  document.querySelectorAll('[data-category]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.category === state.category)));
  document.querySelectorAll('[data-tag]').forEach(b => b.setAttribute('aria-pressed', String(state.tags.includes(b.dataset.tag))));
  $('grid-view').setAttribute('aria-pressed', String(!state.list)); $('list-view').setAttribute('aria-pressed', String(state.list));
  $('random-work').disabled = visible.length === 0;
  if (historyMode) syncURL(historyMode);
}
function reset(animate) { state = { ...state, q: '', category: 'all', tags: [] }; render({ animate, historyMode: 'push' }); }

const closing = new WeakMap();
function openModal(id, animate) {
  const dialog = $(id); clearTimeout(closing.get(dialog)); closing.delete(dialog);
  dialog.inert = false;
  dialog.classList.toggle('instant', !animate || reducedMotion.matches);
  if (!dialog.open) dialog.showModal();
  dialog.getBoundingClientRect();
  dialog.classList.add('is-visible');
}
function closeModal(dialog, animate) {
  clearTimeout(closing.get(dialog));
  if (!animate || reducedMotion.matches) { dialog.classList.remove('is-visible'); dialog.close(); dialog.inert = false; return; }
  dialog.classList.remove('is-visible'); dialog.inert = true;
  closing.set(dialog, setTimeout(() => { dialog.close(); dialog.inert = false; closing.delete(dialog); }, 220));
}
function preview(id, animate) {
  const work = works.find(w => w.id === id); if (!work) return;
  $('preview-title').textContent = work.title;
  $('preview-category').textContent = [work.category, ...work.tags].join(' / ');
  $('preview-description').textContent = work.description || '打开作品，体验完整内容。';
  $('preview-image').hidden = !work.image;
  if (work.image) { $('preview-image').src = work.image; $('preview-image').alt = work.title + '的页面截图'; }
  else $('preview-image').removeAttribute('src');
  $('preview-link').href = work.url;
  $('preview-note').textContent = work.image ? '真实封面预览 · 打开原作即可交互。' : '暂未生成封面，仍可直接打开作品。';
  openModal('preview-dialog', animate);
}
// Build-time HTML remains fully readable without JavaScript; enhance tags only now.
for (const label of document.querySelectorAll('.card-tag-static')) {
  const b = document.createElement('button'); b.className = 'card-tag'; b.textContent = label.textContent;
  b.dataset.tag = label.textContent; b.setAttribute('aria-label', '筛选标签 ' + label.textContent); label.replaceWith(b);
}
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  const animate = event.detail !== 0;
  if (button.dataset.category) { state.category = button.dataset.category; render({ animate, historyMode: 'push' }); }
  if (button.dataset.tag) { const tag = button.dataset.tag; state.tags = state.tags.includes(tag) ? state.tags.filter(t => t !== tag) : [...state.tags, tag]; render({ animate, historyMode: 'push' }); }
  if (button.dataset.preview) preview(button.dataset.preview, animate);
  if (button.dataset.open) openModal(button.dataset.open, animate);
  if (button.hasAttribute('data-close')) closeModal(button.closest('dialog'), animate);
});
$('search').addEventListener('input', () => { state.q = $('search').value; render({ historyMode: 'replace' }); });
$('sort').addEventListener('change', () => { state.sort = $('sort').value; render({ historyMode: 'push' }); });
$('reset').addEventListener('click', event => reset(event.detail !== 0));
$('empty-reset').addEventListener('click', event => { reset(event.detail !== 0); $('search').focus({ preventScroll: true }); });
for (const [id, list] of [['grid-view', false], ['list-view', true]]) $(id).addEventListener('click', event => { state.list = list; render({ animate: event.detail !== 0, historyMode: 'push' }); });
$('random-work').addEventListener('click', event => { const choices = selectWorks(works, state); if (choices.length) preview(choices[Math.floor(Math.random() * choices.length)].id, event.detail !== 0); });
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeModal(dialog, false); });
  dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeModal(dialog, true); });
  dialog.addEventListener('close', () => { clearTimeout(closing.get(dialog)); dialog.inert = false; dialog.classList.remove('is-visible'); });
}
document.addEventListener('keydown', event => {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]') || event.target.closest('input,textarea,select,[contenteditable]')) return;
  event.preventDefault(); $('search').focus();
});
window.addEventListener('popstate', () => { state = readFilters(location.search, categories, allTags); render(); });
window.addEventListener('resize', cancelCardMotion, { passive: true });
reducedMotion.addEventListener('change', event => { if (event.matches) { cancelCardMotion(); for (const dialog of document.querySelectorAll('dialog[open]')) if (closing.has(dialog)) closeModal(dialog, false); } });
document.documentElement.classList.add('js');
render();
