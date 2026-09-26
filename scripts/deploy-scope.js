#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
export const SCOPE = ['content', 'assets/thumbs', 'site', 'templates', 'lib', 'scripts', 'tests', 'build.js', 'routes.json', 'vercel.json', 'package.json', 'package-lock.json', 'README.md', 'brand-spec.md', '.gitignore', 'slides'];
export const inScope = file => SCOPE.some(prefix => file === prefix || file.startsWith(prefix + '/'));
const git = args => execFileSync('git', args, { encoding: 'utf8' });
const command = process.argv[2];
if (command === 'paths') {
  for (const entry of SCOPE) if (fs.existsSync(entry) || git(['ls-files', '-z', '--', entry]).length) process.stdout.write(entry + '\0');
} else if (command === 'check-index') {
  const outside = git(['diff', '--cached', '--name-only', '-z', '--no-renames']).split('\0').filter(Boolean).filter(file => !inScope(file));
  if (outside.length) { console.error('暂存区包含非站点文件，已停止提交（不会改动暂存区）：\n' + outside.map(f => '  ' + f).join('\n')); process.exitCode = 1; }
} else if (command === 'status') {
  const result = git(['status', '--short', '--untracked-files=all', '--', ...SCOPE]);
  console.log(result.trim() || '站点源文件没有待提交改动');
}
