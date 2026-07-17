import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const presentationUrl = new URL('../slides/Agent-Harness-Presentation.html', import.meta.url);
const readPresentation = () => fs.readFileSync(presentationUrl, 'utf8');
const count = (source, pattern) => [...source.matchAll(pattern)].length;

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
