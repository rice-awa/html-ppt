#!/usr/bin/env node
import path from 'node:path';
import { ROOT } from '../lib/collection.js';
import { build } from '../build.js';
import { serveStatic } from '../lib/static-server.js';
try {
  if (!process.argv.includes('--no-build')) await build({ skipScreenshots: true });
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT 必须为 0–65535 的整数');
  const serving = await serveStatic(path.join(ROOT, 'public'), { port });
  console.log('拾页预览：http://127.0.0.1:' + serving.port + '（Ctrl+C 退出）');
  const close = () => { serving.server.closeAllConnections(); serving.server.close(() => process.exit(0)); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
} catch (error) { console.error(error.message); process.exitCode = 1; }
