#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadCollection, readJSON } from '../lib/collection.js';
try {
  const command = process.argv[2] || 'check';
  if (!['check', 'count', 'pending', 'prune', 'summary'].includes(command)) throw new Error('未知命令：' + command);
  const { works, categories, warnings } = loadCollection();
  if (command === 'count') console.log(works.length);
  else if (command === 'pending') {
    const manifest = readJSON(path.join(ROOT, 'assets/thumbs/manifest.json'));
    console.log(works.filter(w => manifest[w.route]?.hash !== w.hash || !fs.existsSync(path.join(ROOT, 'assets/thumbs', w.thumbnailName))).length);
  } else if (command === 'prune') {
    const dir = path.join(ROOT, 'assets/thumbs'); const keep = new Set(works.map(w => w.thumbnailName)); let count = 0;
    if (fs.existsSync(dir)) for (const file of fs.readdirSync(dir)) if (file.endsWith('.webp') && !keep.has(file)) { fs.unlinkSync(path.join(dir, file)); count++; }
    const manifestFile = path.join(dir, 'manifest.json'), manifest = readJSON(manifestFile), routes = new Set(works.map(w => w.route)); let changed = false;
    for (const key of Object.keys(manifest)) if (!routes.has(key)) { delete manifest[key]; changed = true; }
    if (changed) { fs.writeFileSync(manifestFile + '.tmp', JSON.stringify(manifest, null, 2) + '\n'); fs.renameSync(manifestFile + '.tmp', manifestFile); }
    console.log('清理 ' + count + ' 张已删除作品的旧封面');
  } else {
    console.log('✓ ' + works.length + ' 件作品，路由与元数据校验通过');
    for (const category of categories) console.log('  ' + category.name + '：' + works.filter(w => w.categoryId === category.id).length);
    if (command === 'summary') for (const work of works) console.log('  ' + work.url + '  ←  content/' + work.file);
    for (const warning of warnings) console.warn('⚠ ' + warning);
  }
} catch (error) { console.error('内容检查失败：' + error.message); process.exitCode = 1; }
