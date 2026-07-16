#!/usr/bin/env node
import { spawn } from 'child_process';

if (process.env.VERCEL) {
  console.log('Vercel environment detected; skipping Playwright Chromium download.');
  process.exit(0);
}

const child = spawn('npx', ['playwright', 'install', 'chromium'], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
