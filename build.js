import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadCollection, readJSON, treeFiles, publicWork } from './lib/collection.js';
import { renderIndex } from './lib/render.js';
import screenshots from './scripts/screenshots.js';

export async function build({ root = ROOT, skipScreenshots = false, refresh = false } = {}) {
  const collection = loadCollection(root); // Validate before touching previous output.
  const assetsDir = path.join(root, 'assets/thumbs');
  const manifestFile = path.join(assetsDir, 'manifest.json');
  const manifest = readJSON(manifestFile);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('封面 manifest.json 必须是对象');
  const stage = fs.mkdtempSync(path.join(root, '.build-'));
  const output = path.join(root, 'public');
  let manifestChanged = false;
  try {
    fs.mkdirSync(path.join(stage, 'thumbs'));
    fs.cpSync(path.join(root, 'site'), path.join(stage, 'site'), { recursive: true });
    for (const work of collection.works) {
      const target = path.join(stage, work.target);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (work.bundleDir) for (const file of treeFiles(work.bundleDir)) {
        const destination = path.join(path.dirname(target), path.relative(work.bundleDir, file));
        fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(file, destination);
      }
      else fs.copyFileSync(work.sourcePath, target);
      const saved = path.join(assetsDir, work.thumbnailName);
      if (fs.existsSync(saved)) fs.copyFileSync(saved, path.join(stage, 'thumbs', work.thumbnailName));
    }
    const pending = collection.works.filter(w => refresh || manifest[w.route]?.hash !== w.hash || !fs.existsSync(path.join(stage, 'thumbs', w.thumbnailName)));
    if (!skipScreenshots && pending.length) {
      console.log('封面：' + pending.length + ' 件需更新，' + (collection.works.length - pending.length) + ' 件复用');
      const result = await screenshots(pending, { publicDir: stage, assetsDir });
      for (const item of result) if (item.ok) {
        const work = collection.works.find(w => w.id === item.id);
        manifest[work.route] = { hash: work.hash, thumbnail: work.thumbnailName }; manifestChanged = true;
      }
    } else console.log('封面：复用预置图片' + (skipScreenshots ? '（跳过截图）' : ''));
    for (const work of collection.works) {
      if (fs.existsSync(path.join(stage, 'thumbs', work.thumbnailName))) work.image = '/thumbs/' + work.thumbnailName;
      else collection.warnings.push('缺少封面，使用文字占位：' + work.file);
      if (skipScreenshots && work.image && manifest[work.route]?.hash !== work.hash) collection.warnings.push('封面可能需要更新：' + work.file);
    }
    fs.writeFileSync(path.join(stage, 'index.html'), renderIndex(root, collection));
    fs.writeFileSync(path.join(stage, 'collection.json'), JSON.stringify({ categories: collection.categories, works: collection.works.map(publicWork) }, null, 2) + '\n');
    // Replace output only after the entire new site has rendered successfully.
    const backup = output + '.previous';
    if (fs.existsSync(backup)) throw new Error('发现 public.previous，请检查上一次构建的备份后再运行');
    if (fs.existsSync(output)) fs.renameSync(output, backup);
    try { fs.renameSync(stage, output); }
    catch (error) { if (fs.existsSync(backup)) fs.renameSync(backup, output); throw error; }
    if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true });
    if (manifestChanged) { fs.writeFileSync(manifestFile + '.tmp', JSON.stringify(manifest, null, 2) + '\n'); fs.renameSync(manifestFile + '.tmp', manifestFile); }
    for (const warning of collection.warnings) console.warn('⚠ ' + warning);
    console.log('✓ 生成拾页静态站点：' + collection.works.length + ' 件作品 → public/');
    return collection;
  } finally { if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(a => !['--skip-screenshots', '--refresh-thumbs'].includes(a))) { console.error('用法：node build.js [--skip-screenshots] [--refresh-thumbs]'); process.exitCode = 1; }
  else try { await build({ skipScreenshots: !!process.env.VERCEL || process.env.SKIP_SCREENSHOTS === '1' || args.includes('--skip-screenshots'), refresh: args.includes('--refresh-thumbs') }); }
  catch (error) { console.error('构建失败：' + error.message); process.exitCode = 1; }
}
