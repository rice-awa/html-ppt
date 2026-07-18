import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const presentationUrl = new URL('../slides/Agent-Harness-Presentation.html', import.meta.url);
const readPresentation = () => fs.readFileSync(presentationUrl, 'utf8');
const count = (source, pattern) => [...source.matchAll(pattern)].length;
const visibleText = source => source
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const expectedLabels = [
  '01 Cover', '02 Same Model', '03 Equation', '04 Definition',
  '05 Next Token', '06 Failure Trail', '07 Anatomy', '08 Agent Loop',
  '09 Context', '10 Tools and MCP', '11 Guardrails and HITL',
  '12 Persistence', '13 Orchestration', '14 Observability',
  '15 Grok Evidence', '16 Inner and Outer Harness',
  '17 Complexity Ladder', '18 Recap',
];

test('declares the fixed-canvas presentation shell and 18 labeled slides', () => {
  const html = readPresentation();
  assert.match(html, /--deck-width:\s*1920px/);
  assert.match(html, /--deck-height:\s*1080px/);
  assert.equal(count(html, /<section\b[^>]*class="slide\b/g), 18);
  const labels = [...html.matchAll(/data-screen-label="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(labels, expectedLabels);
});

test('provides keyboard, button, fullscreen, progress and persistence hooks', () => {
  const html = readPresentation();
  assert.match(html, /id="prevBtn"/);
  assert.match(html, /id="nextBtn"/);
  assert.match(html, /id="fullscreenBtn"/);
  assert.match(html, /id="progressBar"/);
  assert.match(html, /event\.key === 'ArrowRight'/);
  assert.match(html, /event\.key === 'ArrowLeft'/);
  assert.match(html, /event\.key === ' '/);
  assert.match(html, /agent-harness-presentation-page/);
  assert.match(html, /window\.HarnessDeck/);
});

test('keeps controls outside the scaled deck and exposes accessible labels', () => {
  const html = readPresentation();
  const deckClose = html.indexOf('</main>');
  const prevButton = html.indexOf('id="prevBtn"');
  assert.ok(deckClose > 0 && prevButton > deckClose, 'controls must follow the scaled deck');
  assert.match(html, /id="prevBtn"[^>]*aria-label="上一页"/);
  assert.match(html, /id="nextBtn"[^>]*aria-label="下一页"/);
  assert.match(html, /id="fullscreenBtn"[^>]*aria-label="切换全屏"/);
});

test('contains the approved opening narrative and equation', () => {
  const text = visibleText(readPresentation());
  for (const phrase of [
    'AI Agent 为什么不只是一颗模型？',
    '同一颗大脑，为什么表现差这么多？',
    'AGENT − MODEL = HARNESS',
    '不是模型的部分，就是 Harness',
    '裸模型其实只会 “接着说”',
    '让它独自去办事，会发生什么？',
    'Harness 的全景剖面',
  ]) assert.ok(text.replace(/\s/g, '').includes(phrase.replace(/\s/g, '')), `missing visible phrase: ${phrase}`);
});

test('declares HTML fallbacks for the first three Three.js scenes', () => {
  const html = readPresentation();
  assert.match(html, /data-three-scene="cover"[\s\S]*?class="three-fallback"/);
  assert.match(html, /data-three-scene="equation"[\s\S]*?class="three-fallback"/);
  assert.match(html, /data-three-scene="anatomy"[\s\S]*?class="three-fallback"/);
});

test('covers the seven Harness mechanisms with beginner-facing conclusions', () => {
  const text = visibleText(readPresentation());
  for (const phrase of [
    'Agent 的心跳', 'THINK', 'ACT', 'OBSERVE', 'REPEAT',
    '不是知道得多，而是此刻看对东西',
    '给大脑一双手', '统一插座',
    '刹车不是最后才装',
    '任务跑一半挂了，不必从头来',
    '一个 Agent 不够时，才分工',
    '没有仪表盘，就是盲飞',
  ]) assert.ok(text.replace(/\s/g, '').includes(phrase.replace(/\s/g, '')), `missing mechanism copy: ${phrase}`);
});

test('marks the single repeating 2D loop and lifecycle-owned timers', () => {
  const html = readPresentation();
  assert.match(html, /data-loop-animation/);
  assert.match(html, /data-checkpoint-animation/);
  assert.match(html, /data-trace-animation/);
});


test('closes with the approved evidence, practice and simplicity argument', () => {
  const text = visibleText(readPresentation());
  for (const phrase of ['6.7%', '68.3%', 'EDIT TOOL FORMAT', '特定模型与评测案例', '厂商搭一层，团队还要再搭一层', '运行时无法预知所有步骤', '模型决定它有多聪明', 'Harness 决定它能否把事做好']) assert.ok(text.replace(/\s/g, '').includes(phrase.replace(/\s/g, '')), `missing closing copy: ${phrase}`);
});

test('uses Three.js on exactly four approved slides', () => {
  const html = readPresentation();
  const scenes = [...html.matchAll(/data-three-scene="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(scenes, ['cover', 'equation', 'anatomy', 'evidence']);
});

test('defines deterministic 2D motion with cleanup and reduced-motion support', () => {
  const html = readPresentation();
  assert.match(html, /window\.HarnessMotion\s*=\s*\{\s*enter,\s*leave\s*\}/);
  assert.match(html, /animation\.cancel\(\)/);
  assert.match(html, /clearInterval\(intervalId\)/);
  assert.match(html, /cancelAnimationFrame\(frameId\)/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
  assert.match(html, /reduceMotion\.matches/);
});

test('pins modern Three.js and implements reusable renderer lifecycle', () => {
  const html = readPresentation();
  assert.match(html, /"three":\s*"https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.185\.0\/build\/three\.module\.js"/);
  assert.match(html, /import\('three'\)/);
  assert.match(html, /setAnimationLoop\(null\)/);
  assert.match(html, /geometry\.dispose\(\)/);
  assert.match(html, /material\.dispose\(\)/);
  assert.match(html, /texture\.dispose\(\)/);
  assert.match(html, /renderer\.dispose\(\)/);
  assert.match(html, /window\.HarnessThree\s*=\s*\{\s*activate,\s*deactivate,\s*dispose\s*\}/);
  assert.doesNotMatch(html, /OrbitControls|Chart\.js|anime\.min\.js|react/i);
});

test('enforces palette, body-size, fallback and active-slide accessibility contracts', () => {
  const html = readPresentation();
  for (const color of ['#F2EBDD', '#111111', '#FF5A36', '#3157E1', '#B8D84A', '#FFFFFF']) assert.ok(html.includes(color));
  assert.match(html, /font-size:\s*24px/);
  assert.match(html, /three-unavailable[\s\S]*?\.three-mount/);
  assert.match(html, /aria-hidden/);
  assert.match(html, /slide\.setAttribute\('aria-hidden'/);
  assert.doesNotMatch(html, /TWEAKS|purple|pink|linear-gradient\([^)]*#3157E1[^)]*#FF5A36/i);
});

test('keeps the central equation consistent across the deck', () => {
  const html = readPresentation();
  assert.ok(count(html, /HARNESS[\s\S]{0,80}(?:=|−)[\s\S]{0,80}(?:AGENT|MODEL)/gi) >= 2);
  assert.ok(html.includes('模型决定它有多聪明；'));
});

test('guards engine inputs, no-ops same-page targets and isolates optional hooks', () => {
  const html = readPresentation();
  assert.match(html, /!Number\.isFinite\(index\)\s*\|\|\s*!Number\.isInteger\(index\)/);
  assert.match(html, /nextIndex === current/);
  assert.match(html, /hasNativeKeyboardBehavior\(event\.target\)/);
  assert.match(html, /function runHook/);
  assert.match(html, /result\.catch\(/);
});
