import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { ROOT, loadCollection } from '../lib/collection.js';
import { renderIndex } from '../lib/render.js';
import { build } from '../build.js';
import { serveStatic } from '../lib/static-server.js';

function collectionWithImages() {
  const result = loadCollection();
  for (const w of result.works) if (fs.existsSync(path.join(ROOT, 'assets/thumbs', w.thumbnailName))) w.image = '/thumbs/' + w.thumbnailName;
  return result;
}
test('stylesheet URL changes with CSS content and remains stable otherwise', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shiye-css-'));
  try {
    for (const dir of ['templates', 'site']) fs.cpSync(path.join(ROOT, dir), path.join(root, dir), { recursive: true });
    const collection = collectionWithImages();
    const stylesheet = () => renderIndex(root, collection).match(/rel="stylesheet" href="([^"]+)"/)[1];
    const original = stylesheet();
    assert.match(original, /^\/site\/gallery\.[a-f0-9]+\.css$/);
    assert.equal(stylesheet(), original);
    fs.appendFileSync(path.join(root, 'site/gallery.css'), '\n.nav-link{color:inherit}\n');
    assert.notEqual(stylesheet(), original);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('production homepage renders all works without requiring JavaScript', () => {
  const collection = collectionWithImages(), html = renderIndex(ROOT, collection);
  assert.equal((html.match(/data-work-id=/g) || []).length, collection.works.length);
  for (const work of collection.works) assert.ok(html.includes('href="' + work.url.replaceAll('&', '&amp;') + '"'));
  assert.doesNotMatch(html, /import-dialog|import-form|添加作品|提交作品|prototype-bar|data-variant|__COLLECTION_DATA__|\{\{[A-Z_]+\}\}/);
  const data = JSON.parse(html.match(/<script id="collection-data" type="application\/json">([^]*?)<\/script>/)[1]);
  assert.equal(data.works.length, collection.works.length);
  assert.ok(data.works.every(w => !('sourcePath' in w) && !('bundleDir' in w)));
});
test('thumbnails have stable dimensions, meaningful alt text and lazy loading', () => {
  const html = renderIndex(ROOT, collectionWithImages());
  const images = [...html.matchAll(/<img\s+[^>]*>/g)].map(m => m[0]);
  const actual = images.filter(image => image.includes('src='));
  assert.ok(actual.length > 0);
  for (const image of actual) { assert.match(image, /width="1280" height="720"/); assert.match(image, /decoding="async"/); }
  assert.match(actual[0], /fetchpriority="high"/);
  if (actual.length > 6) assert.ok(actual.some(image => image.includes('loading="lazy"')));
});
test('metadata cannot break out of the embedded JSON or HTML', () => {
  const collection = collectionWithImages();
  collection.works[0] = { ...collection.works[0], title: '</script><script>alert(1)</script>', tags: ['"><img src=x onerror=alert(1)>'] };
  const html = renderIndex(ROOT, collection);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>|<img src=x/);
  const data = JSON.parse(html.match(/<script id="collection-data" type="application\/json">([^]*?)<\/script>/)[1]);
  assert.equal(data.works[0].title, collection.works[0].title);
});
test('empty collections render a useful message without broken hero images', () => {
  const collection = loadCollection(); collection.works = [];
  const html = renderIndex(ROOT, collection);
  assert.match(html, /作品正在整理中/); assert.doesNotMatch(html, /src="(?:undefined|null)"/);
});
test('theme boot honors saved preferences, system preference and unavailable storage', () => {
  const template = fs.readFileSync(path.join(ROOT, 'templates/index.html'), 'utf8');
  const script = template.match(/<script>([^]*?)<\/script>/)[1];
  for (const [saved, systemDark, unavailable, expected] of [['light',true,false,'light'],['dark',false,false,'dark'],[null,true,false,'dark'],['invalid',false,false,'light'],[null,true,true,'dark']]) {
    const document = { documentElement: { dataset: {} } };
    vm.runInNewContext(script, { document, localStorage: { getItem() { if (unavailable) throw new Error('blocked'); return saved; } }, matchMedia: () => ({ matches: systemDark }) });
    assert.equal(document.documentElement.dataset.theme, expected);
  }
  assert.ok(template.indexOf('<script>') < template.indexOf('rel="stylesheet"'), 'restore theme before first styled paint');
});
test('client scripts compile and DOM references exist in the built HTML', () => {
  const html = renderIndex(ROOT, collectionWithImages());
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate IDs');
  for (const file of ['site/gallery.js', 'site/filters.js']) {
    const check = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr);
  }
  const js = fs.readFileSync(path.join(ROOT, 'site/gallery.js'), 'utf8');
  for (const match of js.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), 'missing DOM target ' + match[1]);
});
test('static build and HTTP preview serve every route and local frontend asset', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shiye-build-')); let server;
  try {
    for (const dir of ['content', 'templates', 'site', 'assets/thumbs']) fs.cpSync(path.join(ROOT, dir), path.join(root, dir), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'routes.json'), path.join(root, 'routes.json'));
    const collection = await build({ root, skipScreenshots: true });
    const serving = await serveStatic(path.join(root, 'public')); server = serving.server;
    const origin = 'http://127.0.0.1:' + serving.port;
    const html = await (await fetch(origin)).text();
    const stylesheet = html.match(/rel="stylesheet" href="([^"]+)"/)[1];
    const css = await fetch(origin + stylesheet);
    assert.equal(css.status, 200);
    assert.equal(await css.text(), fs.readFileSync(path.join(root, 'site/gallery.css'), 'utf8'));
    for (const route of ['/', '/site/gallery.css', '/site/gallery.js', '/site/filters.js', '/site/favicon.svg', '/collection.json', ...collection.works.map(w => w.url)]) {
      const response = await fetch(origin + route); assert.equal(response.status, 200, route); await response.arrayBuffer();
    }
    assert.equal((await fetch(origin + '/missing-work')).status, 404);
    assert.equal((await fetch(origin + '/%E0%A4%A')).status, 400);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/collection.json')));
    assert.equal(manifest.works.length, collection.works.length);
    for (const work of collection.works) assert.deepEqual(fs.readFileSync(path.join(root, 'public', work.target)), fs.readFileSync(work.sourcePath), 'source HTML remains byte-identical');
  } finally { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } fs.rmSync(root, { recursive: true, force: true }); }
});
