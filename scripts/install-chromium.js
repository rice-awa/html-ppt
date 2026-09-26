#!/usr/bin/env node
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (process.env.VERCEL || process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1') {
  console.log('当前环境跳过浏览器下载。');
} else {
  try {
    const { chromium } = await import('playwright');
    if (fs.existsSync(chromium.executablePath())) console.log('Chromium 已安装，无需重复下载。');
    else {
      const cli = fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url));
      const child = spawn(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit', shell: false });
      child.on('error', error => { console.error(error.message); process.exitCode = 1; });
      child.on('exit', code => { process.exitCode = code ?? 1; });
    }
  } catch (error) { console.error('请先运行 npm ci：' + error.message); process.exitCode = 1; }
}
