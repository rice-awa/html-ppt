import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROOT, loadCollection, htmlMetadata, validateRoute, thumbnailName } from '../lib/collection.js';
import { build } from '../build.js';
function fixture(run) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shiye-content-')); fs.mkdirSync(path.join(root,'content/games'),{recursive:true}); return Promise.resolve().then(() => run(root)).finally(() => fs.rmSync(root,{recursive:true,force:true})); }
const put = (root, file, value) => { const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value); };
test('HTML metadata handles attribute order, single quotes, multiline titles and entities', () => {
  assert.deepEqual(htmlMetadata("<title> One\n &amp; Two </title><meta content='A &quot;test&quot;' name='description'><meta name='gallery-tags' content='AI，3D,AI'>"), { title: 'One & Two', description: 'A "test"', tags: ['AI','3D','AI'] });
});
test('new standalone HTML inherits its directory category, title and tags without a catalog entry', () => fixture(root => {
  put(root,'content/games/hello world.html','<title>Hello</title><meta name="keywords" content="游戏,游戏,离线">');
  const [work]=loadCollection(root).works;
  assert.equal(work.category,'游戏');assert.equal(work.route,'/hello world');assert.equal(work.url,'/hello%20world');assert.deepEqual(work.tags,['游戏','离线']);
}));
test('catalog metadata overrides HTML and stale entries are reported', () => fixture(root => {
  put(root,'content/games/test.html','<title>Old</title>');
  put(root,'content/catalog.json',JSON.stringify({'games/test.html':{title:'New',tags:[' A ','A']},'games/removed.html':{}}));
  const result=loadCollection(root);assert.equal(result.works[0].title,'New');assert.deepEqual(result.works[0].tags,['A']);assert.equal(result.warnings.length,1);
}));
test('folder bundles include resources, preserve paths, and invalidate thumbnails on resource changes', () => fixture(async root => {
  put(root,'content/games/demo/index.html','<link rel="stylesheet" href="assets/main.css"><title>Demo</title>');put(root,'content/games/demo/assets/main.css','body{color:red}');
  const first=loadCollection(root).works[0];assert.equal(first.url,'/demo/');assert.equal(first.target,'demo/index.html');
  put(root,'content/games/demo/assets/main.css','body{color:green}');assert.notEqual(loadCollection(root).works[0].hash,first.hash);
  for(const dir of ['site','templates'])fs.cpSync(path.join(ROOT,dir),path.join(root,dir),{recursive:true});
  await build({root,skipScreenshots:true});assert.equal(fs.readFileSync(path.join(root,'public/demo/assets/main.css'),'utf8'),'body{color:green}');
}));
test('duplicate routes fail before replacing the previous public output', () => fixture(async root => {
  put(root,'content/games/demo.html','test');put(root,'content/websites/demo.html','duplicate');put(root,'public/sentinel.txt','last working output');
  await assert.rejects(build({root,skipScreenshots:true}),/路由冲突/);assert.equal(fs.readFileSync(path.join(root,'public/sentinel.txt'),'utf8'),'last working output');
}));
test('custom routes resolve duplicate names and keep source category out of published URLs', () => fixture(root => {
  put(root,'content/games/demo.html','one');put(root,'content/websites/demo.html','two');put(root,'routes.json',JSON.stringify({'games/demo.html':'/game-demo'}));
  assert.deepEqual(loadCollection(root).works.map(w=>w.route).sort(),['/demo','/game-demo']);
}));
test('invalid routes cannot escape or overwrite site assets', () => {
  for(const route of ['/','/../bad','/site/test','/thumbs/test','/index','/collection','/a%2fb','//a','/a\\b','/foo?x=1','/foo.html'])assert.throws(()=>validateRoute(route),undefined,route);
  assert.equal(validateRoute('/专题/学习'),'/专题/学习');
  assert.notEqual(thumbnailName('/a/b'),thumbnailName('/a_b'));assert.notEqual(thumbnailName('/中文'),thumbnailName('/作品'));
});
test('symlinks and malformed metadata stop content collection', () => fixture(root => {
  put(root,'content/games/test.html','test');put(root,'content/catalog.json',JSON.stringify({'games/test.html':{tags:'not an array'}}));assert.throws(()=>loadCollection(root),/tags/);
  put(root,'content/catalog.json','{}');fs.symlinkSync(path.join(root,'content/games/test.html'),path.join(root,'content/games/link.html'));assert.throws(()=>loadCollection(root),/符号链接/);
}));
test('bundle routes cannot contain another work output', () => fixture(root => {
  put(root,'content/games/demo/index.html','test');put(root,'content/websites/child.html','test');put(root,'routes.json',JSON.stringify({'websites/child.html':'/demo/child'}));assert.throws(()=>loadCollection(root),/资源目录/);
}));
