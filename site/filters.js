export function readFilters(search, categories, tags) {
  const params = new URLSearchParams(search);
  const category = params.get('category');
  return {
    q: params.get('q') || '',
    category: categories.some(c => c.id === category) ? category : 'all',
    tags: [...new Set(params.getAll('tag'))].filter(t => tags.includes(t)),
    sort: ['name', 'category'].includes(params.get('sort')) ? params.get('sort') : 'curated',
    list: params.get('view') === 'list',
  };
}
export function selectWorks(works, state) {
  const query = state.q.trim().normalize('NFKC').toLocaleLowerCase();
  const result = works.filter(w => (state.category === 'all' || w.categoryId === state.category) && state.tags.every(t => w.tags.includes(t)) && (!query || [w.title, w.description, w.category, w.route, ...w.tags].join(' ').normalize('NFKC').toLocaleLowerCase().includes(query)));
  if (state.sort === 'name') result.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  if (state.sort === 'category') result.sort((a, b) => a.category.localeCompare(b.category, 'zh-CN'));
  return result;
}
export function filterParams(state) {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category !== 'all') params.set('category', state.category);
  for (const tag of state.tags) params.append('tag', tag);
  if (state.sort !== 'curated') params.set('sort', state.sort);
  if (state.list) params.set('view', 'list');
  return params;
}
