# Agent Harness HTML Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an 18-slide, 1920×1080, single-file HTML presentation that explains Agent Harness to beginners through an “Agent teardown” narrative, with clear 2D causal motion and four selectively used Three.js scenes.

**Architecture:** Create one self-contained presentation file with static semantic slide markup, shared CSS tokens/components, a deterministic slide engine, a native Web Animations motion controller, and a lazily loaded Three.js scene manager. Three.js uses one reusable renderer, builds a scene only when a 3D slide becomes active, disposes scene resources on exit, and leaves an always-meaningful HTML/SVG fallback underneath. Static Node tests enforce slide count, copy, visual contracts, navigation hooks, accessibility, reduced-motion behavior, and Three.js lifecycle markers.

**Tech Stack:** HTML5, CSS custom properties, SVG, vanilla JavaScript, Web Animations API, Three.js `0.185.0` via pinned CDN ES Module/import map, Node.js `node:test`, Playwright for final runtime verification.

## Global Constraints

- Create `slides/Agent-Harness-Presentation.html`; preserve `slides/TCP-Presentation-v2.html` and the earlier `slides/agent-harness-ppt.html` draft unchanged.
- Internal canvas is exactly `1920×1080`; scaling must preserve 16:9 with centered letterboxing and no stretching or cropping.
- Deliver exactly 18 slides with 1-indexed `data-screen-label` values from `01 Cover` through `18 Recap`.
- Use the approved palette only: paper `#F2EBDD`, ink `#111111`, model orange `#FF5A36`, harness blue `#3157E1`, success/recovery `#B8D84A`, panel white `#FFFFFF`.
- Use `Space Grotesk` for English/display formulas, `Noto Sans SC` for Chinese, and `JetBrains Mono` for status/code labels; projected body copy must be at least `24px`.
- Use Three.js only on slides 01, 03, 07, and 15; use no OrbitControls, Chart.js, React, Anime.js, Tweaks panel, particle starfield, neon gradients, or decorative emoji.
- Pin Three.js to `0.185.0`; use an import map and dynamic `import('three')` so module failure can be caught.
- Keep HTML/SVG fallbacks readable before Three.js loads and when WebGL is unavailable.
- Respect `prefers-reduced-motion`; disable camera travel, rotation, path travel, and scale choreography while preserving final states and comprehension.
- Every page transition must stop timers, requestAnimationFrame work, Web Animations, and Three.js animation loops owned by the previous slide.
- Store the current zero-based index in `localStorage` under `agent-harness-presentation-page`; reject invalid or out-of-range saved values.
- The approved single-file deliverable is an explicit exception to the normal “split files over 1000 lines” preference.

## File Map

- Create: `slides/Agent-Harness-Presentation.html` — static content, design tokens, slide engine, 2D motion, Three.js integration, fallbacks, and controls.
- Create: `tests/agent-harness-presentation.test.js` — fast structural/content/lifecycle contracts using Node’s built-in test runner.
- Create: `tests/agent-harness-presentation.browser.test.js` — focused Playwright runtime checks for scaling, navigation, persistence, fallback, and console errors.
- Reference only: `docs/superpowers/specs/2026-07-18-agent-harness-presentation-design.md` — approved requirements.
- Reference only: `reports/agent-harness-research-report.md` — source wording and citations.
- Reference only: `slides/TCP-Presentation-v2.html` — interaction and visual-language reference.

---

### Task 1: Lock the presentation contract and build the slide engine shell

**Files:**
- Create: `tests/agent-harness-presentation.test.js`
- Create: `slides/Agent-Harness-Presentation.html`

**Interfaces:**
- Produces: `window.HarnessDeck` with `show(index: number)`, `next()`, `previous()`, `current(): number`, and `total(): number`.
- Emits: `harness:slideleave` with `{ index, slide }`, then `harness:slideenter` with `{ index, slide }`.
- Consumes later: optional `window.HarnessMotion.leave/enter` and `window.HarnessThree.deactivate/activate` hooks.

- [ ] **Step 1: Write the failing structural and engine contract tests**

Create `tests/agent-harness-presentation.test.js` with:

```js
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
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
```

Expected: FAIL with `ENOENT` for `slides/Agent-Harness-Presentation.html`.

- [ ] **Step 3: Create the fixed-canvas shell, 18 labeled empty sections, external controls, and deterministic engine**

Create `slides/Agent-Harness-Presentation.html` with this top-level shape. The 18 section labels must match the test exactly; keep each section empty except for the common chrome until Tasks 2–4 insert content.

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>Agent Harness · 把模型变成会做事的系统</title>
<meta name="description" content="面向初学者的 Agent Harness 科普演示：Agent = Model + Harness。">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Noto+Sans+SC:wght@400;500;700;900&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --deck-width: 1920px;
  --deck-height: 1080px;
  --paper: #F2EBDD;
  --ink: #111111;
  --orange: #FF5A36;
  --blue: #3157E1;
  --lime: #B8D84A;
  --white: #FFFFFF;
  --muted: color-mix(in srgb, var(--ink) 58%, var(--paper));
  --grid: color-mix(in srgb, var(--ink) 10%, transparent);
  --ease-out: cubic-bezier(.22, 1, .36, 1);
  --font-display: "Space Grotesk", "Noto Sans SC", sans-serif;
  --font-zh: "Noto Sans SC", sans-serif;
  --font-mono: "JetBrains Mono", monospace;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { background: #111; color: var(--ink); font-family: var(--font-zh); }
.viewport { position: fixed; inset: 0; overflow: hidden; }
.deck {
  position: absolute; left: 0; top: 0;
  width: var(--deck-width); height: var(--deck-height);
  transform-origin: top left; background: var(--paper); overflow: hidden;
  box-shadow: 0 48px 120px rgba(0,0,0,.38);
}
.deck::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 48px 48px; opacity: .72;
}
.slide { position: absolute; inset: 0; display: none; padding: 88px 96px 92px; overflow: hidden; }
.slide.active { display: flex; flex-direction: column; }
.slide-chrome { position: absolute; left: 96px; right: 96px; display: flex; justify-content: space-between; font: 14px var(--font-mono); letter-spacing: .08em; color: var(--muted); }
.slide-chrome.top { top: 34px; }
.slide-chrome.bottom { bottom: 34px; }
.slide-chrome .brand { display: flex; align-items: center; gap: 10px; }
.slide-chrome .brand::before { content: ""; width: 10px; height: 10px; border-radius: 2px; background: var(--orange); }
.progress { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: color-mix(in srgb, var(--ink) 8%, transparent); }
.progress > i { display: block; height: 100%; width: 0; background: var(--orange); transition: width .45s var(--ease-out); }
.nav, .fullscreen { position: fixed; z-index: 100; border: 1px solid #333; color: #fff; background: #191919; cursor: pointer; font-family: var(--font-mono); }
.nav { top: 50%; width: 48px; height: 48px; border-radius: 50%; transform: translateY(-50%); font-size: 22px; }
.nav:hover, .nav:focus-visible, .fullscreen:hover, .fullscreen:focus-visible { background: var(--orange); border-color: var(--orange); outline: 3px solid rgba(255,90,54,.28); outline-offset: 3px; }
.nav.prev { left: 24px; } .nav.next { right: 24px; }
.fullscreen { top: 18px; right: 18px; height: 42px; padding: 0 16px; border-radius: 999px; font-size: 12px; }
.page-info { position: fixed; z-index: 100; left: 50%; bottom: 16px; transform: translateX(-50%); color: #999; font: 12px var(--font-mono); letter-spacing: .1em; }
</style>
</head>
<body>
<div class="viewport">
<main class="deck" id="deck" aria-label="Agent Harness 科普演示">
  <section class="slide active" data-screen-label="01 Cover"></section>
  <section class="slide" data-screen-label="02 Same Model"></section>
  <section class="slide" data-screen-label="03 Equation"></section>
  <section class="slide" data-screen-label="04 Definition"></section>
  <section class="slide" data-screen-label="05 Next Token"></section>
  <section class="slide" data-screen-label="06 Failure Trail"></section>
  <section class="slide" data-screen-label="07 Anatomy"></section>
  <section class="slide" data-screen-label="08 Agent Loop"></section>
  <section class="slide" data-screen-label="09 Context"></section>
  <section class="slide" data-screen-label="10 Tools and MCP"></section>
  <section class="slide" data-screen-label="11 Guardrails and HITL"></section>
  <section class="slide" data-screen-label="12 Persistence"></section>
  <section class="slide" data-screen-label="13 Orchestration"></section>
  <section class="slide" data-screen-label="14 Observability"></section>
  <section class="slide" data-screen-label="15 Grok Evidence"></section>
  <section class="slide" data-screen-label="16 Inner and Outer Harness"></section>
  <section class="slide" data-screen-label="17 Complexity Ladder"></section>
  <section class="slide" data-screen-label="18 Recap"></section>
  <div class="progress" aria-hidden="true"><i id="progressBar"></i></div>
</main>
</div>
<button class="nav prev" id="prevBtn" type="button" aria-label="上一页">‹</button>
<button class="nav next" id="nextBtn" type="button" aria-label="下一页">›</button>
<button class="fullscreen" id="fullscreenBtn" type="button" aria-label="切换全屏">FULLSCREEN</button>
<div class="page-info" id="pageInfo" aria-live="polite">01 / 18</div>
<script>
(() => {
  const STORAGE_KEY = 'agent-harness-presentation-page';
  const deck = document.getElementById('deck');
  const slides = [...document.querySelectorAll('.slide')];
  const progressBar = document.getElementById('progressBar');
  const pageInfo = document.getElementById('pageInfo');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  let current = Number.parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
  if (!Number.isInteger(current) || current < 0 || current >= slides.length) current = 0;

  function fitDeck() {
    const viewport = window.visualViewport;
    const width = viewport ? viewport.width : document.documentElement.clientWidth;
    const height = viewport ? viewport.height : document.documentElement.clientHeight;
    const scale = Math.min(width / 1920, height / 1080);
    deck.style.transform = `translate(${(width - 1920 * scale) / 2}px, ${(height - 1080 * scale) / 2}px) scale(${scale})`;
  }

  function show(index) {
    const nextIndex = Math.max(0, Math.min(index, slides.length - 1));
    const previousSlide = slides[current];
    if (previousSlide && previousSlide.classList.contains('active')) {
      window.dispatchEvent(new CustomEvent('harness:slideleave', { detail: { index: current, slide: previousSlide } }));
      window.HarnessMotion?.leave(previousSlide);
      window.HarnessThree?.deactivate();
    }
    current = nextIndex;
    slides.forEach((slide, slideIndex) => slide.classList.toggle('active', slideIndex === current));
    progressBar.style.width = `${((current + 1) / slides.length) * 100}%`;
    pageInfo.textContent = `${String(current + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
    localStorage.setItem(STORAGE_KEY, String(current));
    const active = slides[current];
    window.HarnessMotion?.enter(active);
    window.HarnessThree?.activate(active);
    window.dispatchEvent(new CustomEvent('harness:slideenter', { detail: { index: current, slide: active } }));
  }

  const next = () => show(current + 1);
  const previous = () => show(current - 1);
  document.getElementById('nextBtn').addEventListener('click', next);
  document.getElementById('prevBtn').addEventListener('click', previous);
  document.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); next(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
  });
  fullscreenBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      console.warn('Fullscreen request failed:', error);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreenBtn.textContent = document.fullscreenElement ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
    fitDeck();
  });
  window.addEventListener('resize', fitDeck);
  window.visualViewport?.addEventListener('resize', fitDeck);
  window.addEventListener('beforeunload', () => window.HarnessThree?.dispose());
  window.HarnessDeck = { show, next, previous, current: () => current, total: () => slides.length };
  fitDeck();
  show(current);
})();
</script>
</body>
</html>
```

Add this exact common chrome inside each section while later tasks add each slide’s unique body between the top and bottom chrome:

```html
<div class="slide-chrome top"><span class="brand">AGENT HARNESS / TEARDOWN LAB</span><span>01 / 18</span></div>
<div class="slide-chrome bottom"><span>按 → 或空格翻页</span><span>HARNESS = AGENT − MODEL</span></div>
```

Use the actual 1-indexed page number for each section’s top-right span.

- [ ] **Step 4: Run the contract test and verify it passes**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the shell**

```bash
git add slides/Agent-Harness-Presentation.html tests/agent-harness-presentation.test.js
git commit -m "feat: scaffold Agent Harness presentation"
```

---

### Task 2: Implement slides 01–07 and the teardown visual vocabulary

**Files:**
- Modify: `slides/Agent-Harness-Presentation.html`
- Modify: `tests/agent-harness-presentation.test.js`

**Interfaces:**
- Consumes: the 18 static sections and chrome from Task 1.
- Produces: `.three-stage[data-three-scene]`, `.three-mount`, `.three-fallback`, `.machine-core`, `.harness-module`, `.failure-step`, and `.anatomy-module` elements used by later motion/Three.js tasks.

- [ ] **Step 1: Add failing tests for the opening-act copy and 3D fallback contracts**

Append:

```js
test('contains the approved opening narrative and equation', () => {
  const html = readPresentation();
  for (const phrase of [
    'AI Agent 为什么不只是一颗模型？',
    '同一颗大脑，为什么表现差这么多？',
    'AGENT − MODEL = HARNESS',
    '不是模型的部分，就是 Harness',
    '裸模型其实只会“接着说”',
    '让它独自去办事，会发生什么？',
    'Harness 的全景剖面',
  ]) assert.ok(html.includes(phrase), `missing phrase: ${phrase}`);
});

test('declares HTML fallbacks for the first three Three.js scenes', () => {
  const html = readPresentation();
  assert.match(html, /data-three-scene="cover"[\s\S]*?class="three-fallback"/);
  assert.match(html, /data-three-scene="equation"[\s\S]*?class="three-fallback"/);
  assert.match(html, /data-three-scene="anatomy"[\s\S]*?class="three-fallback"/);
});
```

- [ ] **Step 2: Run tests and verify the two new tests fail**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
```

Expected: FAIL on the missing opening phrases and `data-three-scene` containers.

- [ ] **Step 3: Add the shared headings, panels, machine, module, trail, and fallback CSS**

Insert into the existing `<style>`:

```css
h1, h2, h3, p { text-wrap: pretty; }
.display { font: 700 122px/.93 var(--font-display); letter-spacing: -.045em; }
.title { font: 700 78px/1.02 var(--font-display); letter-spacing: -.035em; }
.subtitle { margin-top: 24px; max-width: 840px; font-size: 28px; line-height: 1.5; color: var(--muted); }
.eyebrow { align-self: flex-start; display: inline-flex; align-items: center; gap: 10px; padding: 8px 15px; border: 2px solid var(--ink); border-radius: 999px; background: var(--white); box-shadow: 0 2px 0 var(--ink); font: 600 14px var(--font-mono); letter-spacing: .12em; text-transform: uppercase; }
.eyebrow::before { content: ""; width: 9px; height: 9px; border-radius: 2px; background: var(--orange); }
.panel { position: relative; border: 2px solid var(--ink); border-radius: 24px; background: var(--white); box-shadow: 0 3px 0 var(--ink), 0 22px 42px rgba(17,17,17,.08); }
.panel.blue { background: var(--blue); color: var(--white); }
.panel.orange { background: var(--orange); color: var(--white); }
.mono { font-family: var(--font-mono); }
.tag { display: inline-flex; padding: 6px 11px; border: 1.5px solid currentColor; border-radius: 999px; font: 600 13px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; }
[data-reveal] { will-change: transform, opacity; }
.three-stage { position: relative; min-height: 650px; }
.three-mount, .three-fallback { position: absolute; inset: 0; }
.three-mount { z-index: 2; pointer-events: none; }
.three-mount canvas { width: 100%; height: 100%; display: block; }
.three-fallback { z-index: 1; display: grid; place-items: center; transition: opacity .25s ease; }
.three-stage.three-ready .three-fallback { opacity: 0; }
.machine { position: relative; width: 660px; height: 560px; display: grid; place-items: center; }
.machine-core { position: relative; z-index: 2; width: 210px; height: 210px; display: grid; place-items: center; border: 3px solid var(--ink); border-radius: 42px; background: var(--orange); color: var(--white); box-shadow: 0 8px 0 var(--ink); font: 700 28px var(--font-mono); }
.harness-module { position: absolute; min-width: 150px; padding: 20px 22px; border: 2px solid var(--ink); border-radius: 16px; background: var(--blue); color: var(--white); box-shadow: 0 5px 0 var(--ink); font: 600 16px var(--font-mono); text-align: center; }
.module-loop { top: 40px; left: 60px; } .module-context { top: 34px; right: 44px; }
.module-tools { top: 240px; left: 0; } .module-guard { top: 240px; right: 0; }
.module-state { bottom: 24px; left: 74px; } .module-eval { right: 56px; bottom: 22px; }
.split-hero { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; flex: 1; align-items: center; padding-top: 74px; }
.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 48px; flex: 1; }
.agent-card { padding: 34px; display: flex; flex-direction: column; }
.agent-card h3 { margin-top: 18px; font: 700 42px var(--font-display); }
.agent-card p { margin-top: 14px; font-size: 25px; line-height: 1.5; }
.agent-status { margin-top: auto; display: flex; gap: 10px; flex-wrap: wrap; }
.formula { margin: auto 0; display: flex; align-items: center; justify-content: center; gap: 24px; font: 700 70px var(--font-mono); }
.formula .operator { color: var(--muted); }
.failure-trail { display: grid; grid-template-columns: repeat(5, 1fr); gap: 18px; margin-top: 52px; flex: 1; align-items: stretch; }
.failure-step { padding: 28px 24px; border: 2px solid var(--ink); border-radius: 20px; background: var(--white); display: flex; flex-direction: column; }
.failure-step b { font: 700 52px var(--font-mono); color: var(--orange); }
.failure-step h3 { margin-top: 22px; font: 700 27px var(--font-display); }
.failure-step p { margin-top: 12px; font-size: 21px; line-height: 1.45; color: var(--muted); }
.anatomy-labels { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
.anatomy-module { position: absolute; width: 250px; padding: 15px 18px; border: 2px solid var(--ink); border-radius: 14px; background: var(--white); font-size: 20px; box-shadow: 0 3px 0 var(--ink); }
.anatomy-module strong { display: block; font: 600 14px var(--font-mono); color: var(--blue); margin-bottom: 5px; }
```

- [ ] **Step 4: Replace the empty bodies of slides 01–07 with the approved semantic content**

Use the following unique bodies between each section’s top and bottom chrome. Preserve the exact text because later static tests and the approved narrative depend on it.

```html
<!-- 01 -->
<div class="split-hero">
  <div>
    <div class="eyebrow" data-reveal>AI Agent 工程科普</div>
    <h1 class="display" data-reveal>AI Agent<br>为什么不只是<br><span style="color:var(--orange)">一颗模型？</span></h1>
    <p class="subtitle" data-reveal>把“会说话”的模型，拆开看它如何被一整套 Harness 变成“会做事”的系统。</p>
  </div>
  <div class="three-stage" data-three-scene="cover" aria-label="Agent 装置爆炸拆解图">
    <div class="three-mount" aria-hidden="true"></div>
    <div class="three-fallback" aria-hidden="true">
      <div class="machine">
        <div class="machine-core">MODEL</div>
        <div class="harness-module module-loop">LOOP</div>
        <div class="harness-module module-context">CONTEXT</div>
        <div class="harness-module module-tools">TOOLS</div>
        <div class="harness-module module-guard">GUARDRAILS</div>
        <div class="harness-module module-state">STATE</div>
        <div class="harness-module module-eval">EVAL</div>
      </div>
    </div>
  </div>
</div>

<!-- 02 -->
<div style="padding-top:72px">
  <div class="eyebrow" data-reveal>先看一个反常识现象</div>
  <h2 class="title" data-reveal>同一颗大脑，为什么表现差这么多？</h2>
</div>
<div class="compare-grid">
  <article class="panel agent-card" data-reveal>
    <span class="tag">同一个模型</span><h3>裸模型 Agent</h3>
    <p>停在第一步、忘记进度、工具乱调，失败后只能从头再来。</p>
    <div class="agent-status"><span class="tag">中断</span><span class="tag">失忆</span><span class="tag">不可追踪</span></div>
  </article>
  <article class="panel blue agent-card" data-reveal>
    <span class="tag">同一个模型</span><h3>强 Harness Agent</h3>
    <p>持续行动、按需取上下文、受控调用工具，并能验证和恢复。</p>
    <div class="agent-status"><span class="tag">继续</span><span class="tag">受控</span><span class="tag">可恢复</span></div>
  </article>
</div>

<!-- 03 -->
<div class="eyebrow" data-reveal style="margin-top:72px">核心公式</div>
<h2 class="title" data-reveal style="margin-top:22px">把一台 Agent 拆开。</h2>
<div class="three-stage" data-three-scene="equation" aria-label="Agent 减去模型得到 Harness 的空间拆解">
  <div class="three-mount" aria-hidden="true"></div>
  <div class="three-fallback">
    <div class="formula" data-reveal><span>AGENT</span><span class="operator">−</span><span style="color:var(--orange)">MODEL</span><span class="operator">=</span><span style="color:var(--blue)">HARNESS</span></div>
  </div>
</div>

<!-- 04 -->
<div style="margin:auto 0">
  <div class="eyebrow" data-reveal>一句话定义</div>
  <h2 class="display" data-reveal style="font-size:112px;margin-top:28px">不是模型的部分，<br>就是 <span style="color:var(--blue)">Harness</span>。</h2>
  <p class="subtitle" data-reveal>它是 Agent 系统里除模型之外的代码、配置和执行逻辑：让智能拥有状态、工具、反馈回路和可执行的约束。</p>
</div>

<!-- 05 -->
<div class="split-hero">
  <div>
    <div class="eyebrow" data-reveal>裸模型的能力边界</div>
    <h2 class="title" data-reveal>裸模型其实只会<br><span style="color:var(--orange)">“接着说”</span>。</h2>
    <p class="subtitle" data-reveal>它读取输入，然后预测下一个 token。它本身不会运行任务循环，也没有长期记忆、工具权限和恢复机制。</p>
  </div>
  <div class="panel" data-reveal style="padding:46px">
    <div class="mono" style="font-size:18px;color:var(--muted)">INPUT</div>
    <div style="margin-top:24px;font-size:30px">“帮我完成一个真实任务”</div>
    <div class="mono" style="margin:42px 0;font-size:50px;color:var(--orange)">TOKEN → TOKEN → TOKEN</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:22px">
      <span class="tag">没有循环</span><span class="tag">没有长期记忆</span><span class="tag">没有执行权限</span><span class="tag">没有恢复机制</span>
    </div>
  </div>
</div>

<!-- 06 -->
<div style="padding-top:72px">
  <div class="eyebrow" data-reveal>把任务直接丢给它</div>
  <h2 class="title" data-reveal>让它独自去办事，会发生什么？</h2>
</div>
<div class="failure-trail">
  <article class="failure-step" data-reveal><b>01</b><h3>停在第一步</h3><p>回答了一次，却没人让它继续。</p></article>
  <article class="failure-step" data-reveal><b>02</b><h3>忘记进度</h3><p>新一轮不知道上一轮做过什么。</p></article>
  <article class="failure-step" data-reveal><b>03</b><h3>工具乱调</h3><p>参数、权限和执行环境无人校验。</p></article>
  <article class="failure-step" data-reveal><b>04</b><h3>失败清零</h3><p>中途崩溃后只能从头重做。</p></article>
  <article class="failure-step" data-reveal><b>05</b><h3>无法诊断</h3><p>只看到错答案，不知道哪一步出错。</p></article>
</div>

<!-- 07 -->
<div class="eyebrow" data-reveal style="margin-top:60px">把外围设施全部展开</div>
<h2 class="title" data-reveal style="margin-top:20px">Harness 的全景剖面</h2>
<div class="three-stage" data-three-scene="anatomy" aria-label="围绕模型核心的 Harness 七模块剖面" style="flex:1">
  <div class="three-mount" aria-hidden="true"></div>
  <div class="three-fallback" aria-hidden="true"><div class="machine"><div class="machine-core">MODEL</div></div></div>
  <div class="anatomy-labels">
    <div class="anatomy-module" style="left:30px;top:70px"><strong>01 / LOOP</strong>循环控制</div>
    <div class="anatomy-module" style="left:10px;top:260px"><strong>02 / CONTEXT</strong>上下文与记忆</div>
    <div class="anatomy-module" style="left:90px;bottom:55px"><strong>03 / TOOLS</strong>工具与 MCP</div>
    <div class="anatomy-module" style="right:40px;top:45px"><strong>04 / GUARD</strong>护栏</div>
    <div class="anatomy-module" style="right:8px;top:230px"><strong>05 / HUMAN</strong>人类在环</div>
    <div class="anatomy-module" style="right:44px;bottom:120px"><strong>06 / STATE</strong>持久化与编排</div>
    <div class="anatomy-module" style="right:360px;bottom:22px"><strong>07 / EVAL</strong>评测与可观测</div>
  </div>
</div>
```

- [ ] **Step 5: Run tests and verify they pass**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
```

Expected: 5 tests PASS.

- [ ] **Step 6: Commit the opening act**

```bash
git add slides/Agent-Harness-Presentation.html tests/agent-harness-presentation.test.js
git commit -m "feat: add Agent teardown opening act"
```

---

### Task 3: Implement slides 08–14 as 2D causal explanations

**Files:**
- Modify: `slides/Agent-Harness-Presentation.html`
- Modify: `tests/agent-harness-presentation.test.js`

**Interfaces:**
- Produces: `.loop-orbit`, `.signal`, `.context-card`, `.filter-gate`, `.tool-call`, `.approval-card`, `.checkpoint`, `.complexity-step`, and `.trace-step` for Task 5 motion.
- Consumes: shared tokens, panels, headings, tags, and reveal markers from Task 2.

- [ ] **Step 1: Add failing tests for all seven middle-act concepts**

Append:

```js
test('covers the seven Harness mechanisms with beginner-facing conclusions', () => {
  const html = readPresentation();
  for (const phrase of [
    'Agent 的心跳', 'THINK', 'ACT', 'OBSERVE', 'REPEAT',
    '不是知道得多，而是此刻看对东西',
    '给大脑一双手', '统一插座',
    '刹车不是最后才装',
    '任务跑一半挂了，不必从头来',
    '一个 Agent 不够时，才分工',
    '没有仪表盘，就是盲飞',
  ]) assert.ok(html.includes(phrase), `missing mechanism copy: ${phrase}`);
});

test('marks the single repeating 2D loop and lifecycle-owned timers', () => {
  const html = readPresentation();
  assert.match(html, /data-loop-animation/);
  assert.match(html, /data-checkpoint-animation/);
  assert.match(html, /data-trace-animation/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
```

Expected: FAIL because slides 08–14 are still empty.

- [ ] **Step 3: Add the middle-act layout CSS**

Insert:

```css
.loop-layout, .context-layout, .tools-layout, .guard-layout, .persist-layout, .observe-layout { display: grid; grid-template-columns: 1.08fr .92fr; gap: 38px; flex: 1; padding-top: 36px; }
.loop-orbit { position: relative; min-height: 560px; border: 2px solid var(--ink); border-radius: 50%; background: var(--white); }
.loop-node { position: absolute; width: 180px; height: 94px; display: grid; place-items: center; border: 2px solid var(--ink); border-radius: 18px; background: var(--blue); color: var(--white); font: 700 19px var(--font-mono); box-shadow: 0 5px 0 var(--ink); }
.loop-node:nth-child(1) { left: 50%; top: 30px; transform: translateX(-50%); }
.loop-node:nth-child(2) { right: 26px; top: 50%; transform: translateY(-50%); }
.loop-node:nth-child(3) { left: 50%; bottom: 28px; transform: translateX(-50%); }
.loop-node:nth-child(4) { left: 24px; top: 50%; transform: translateY(-50%); }
.signal { position: absolute; width: 22px; height: 22px; border: 2px solid var(--ink); border-radius: 50%; background: var(--orange); left: calc(50% - 11px); top: 10px; }
.explainer { padding: 34px; display: flex; flex-direction: column; justify-content: center; }
.explainer h3 { font: 700 38px var(--font-display); }
.explainer p { margin-top: 18px; font-size: 25px; line-height: 1.55; }
.context-stack { position: relative; min-height: 600px; }
.context-card { position: absolute; width: 300px; padding: 20px; border: 2px solid var(--ink); border-radius: 16px; background: var(--white); font-size: 19px; box-shadow: 0 4px 0 var(--ink); }
.context-card:nth-child(1) { left: 20px; top: 34px; transform: rotate(-4deg); }
.context-card:nth-child(2) { left: 130px; top: 180px; transform: rotate(3deg); }
.context-card:nth-child(3) { left: 20px; top: 340px; transform: rotate(-2deg); }
.context-card:nth-child(4) { left: 190px; top: 460px; transform: rotate(4deg); }
.filter-gate { position: absolute; right: 30px; top: 100px; bottom: 80px; width: 190px; display: grid; place-items: center; border: 3px solid var(--ink); border-radius: 22px; background: var(--blue); color: var(--white); font: 700 20px var(--font-mono); writing-mode: vertical-rl; letter-spacing: .12em; }
.tool-flow { display: grid; grid-template-columns: 1fr 70px 1fr 70px 1fr; gap: 12px; align-items: center; margin-top: 56px; }
.tool-call { min-height: 260px; padding: 30px; display: flex; flex-direction: column; justify-content: space-between; }
.flow-arrow { text-align: center; font: 700 42px var(--font-mono); color: var(--orange); }
.approval-card { padding: 38px; display: grid; grid-template-columns: 1fr auto; gap: 32px; align-items: center; }
.approval-actions { display: grid; gap: 12px; }
.approval-actions span { min-width: 150px; padding: 13px 18px; border: 2px solid currentColor; border-radius: 999px; text-align: center; font: 600 15px var(--font-mono); }
.timeline-track { position: relative; margin-top: 80px; height: 280px; border-top: 5px solid var(--ink); }
.checkpoint { position: absolute; top: -28px; width: 58px; height: 58px; display: grid; place-items: center; border: 3px solid var(--ink); border-radius: 14px; background: var(--lime); font: 700 14px var(--font-mono); }
.checkpoint:nth-child(1) { left: 8%; } .checkpoint:nth-child(2) { left: 34%; } .checkpoint:nth-child(3) { left: 62%; } .checkpoint:nth-child(4) { right: 7%; }
.crash-gap { position: absolute; left: 48%; top: -18px; width: 120px; height: 40px; background: var(--paper); border-left: 4px solid var(--orange); border-right: 4px solid var(--orange); }
.complexity-ladder { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; align-items: end; flex: 1; margin-top: 42px; }
.complexity-step { padding: 24px; border: 2px solid var(--ink); border-radius: 20px 20px 0 0; background: var(--white); }
.complexity-step:nth-child(1) { height: 220px; } .complexity-step:nth-child(2) { height: 290px; } .complexity-step:nth-child(3) { height: 360px; } .complexity-step:nth-child(4) { height: 430px; } .complexity-step:nth-child(5) { height: 500px; background: var(--blue); color: var(--white); }
.trace { display: grid; gap: 12px; }
.trace-step { display: grid; grid-template-columns: 120px 1fr 120px 120px; gap: 18px; align-items: center; padding: 18px 22px; border: 2px solid var(--ink); border-radius: 16px; background: var(--white); font-size: 19px; }
.trace-step .state { font: 600 14px var(--font-mono); color: var(--blue); }
```

- [ ] **Step 4: Fill slides 08–14 with the exact approved mechanisms**

Use these bodies:

```html
<!-- 08 -->
<div style="padding-top:62px"><div class="eyebrow" data-reveal>循环控制</div><h2 class="title" data-reveal>Agent 的心跳</h2></div>
<div class="loop-layout">
  <div class="loop-orbit" data-loop-animation data-reveal><div class="loop-node">THINK</div><div class="loop-node">ACT</div><div class="loop-node">OBSERVE</div><div class="loop-node">REPEAT</div><div class="signal"></div></div>
  <article class="panel explainer" data-reveal><span class="tag">关键不是“让模型想”</span><h3>跑循环的是 Harness。</h3><p>模型只负责提出下一步动作。Harness 负责执行、回填观察结果、判断是否继续，以及何时停止。</p></article>
</div>

<!-- 09 -->
<div style="padding-top:62px"><div class="eyebrow" data-reveal>上下文工程</div><h2 class="title" data-reveal>不是知道得多，而是此刻看对东西。</h2></div>
<div class="context-layout">
  <div class="context-stack" data-reveal><div class="context-card">当前任务与最近几步</div><div class="context-card">过去项目的相关经验</div><div class="context-card">稳定知识与项目规则</div><div class="context-card">冗长工具输出与旧对话</div><div class="filter-gate">DYNAMIC CONTEXT</div></div>
  <article class="panel explainer" data-reveal><h3>只把当前步骤需要的信息送进去。</h3><p>工作记忆负责眼前任务；长期记忆负责找回过去；检索与压缩负责对抗上下文腐烂。窗口越满，推理不一定越好。</p></article>
</div>

<!-- 10 -->
<div style="padding-top:62px"><div class="eyebrow" data-reveal>工具与 MCP</div><h2 class="title" data-reveal>给大脑一双手，再给所有工具一个统一插座。</h2></div>
<div class="tool-flow">
  <article class="panel tool-call" data-reveal><span class="tag">MODEL</span><h3>提出结构化动作</h3><code class="mono">read_file({ path })</code></article><div class="flow-arrow">→</div>
  <article class="panel blue tool-call" data-reveal><span class="tag">HARNESS</span><h3>校验并执行</h3><p>参数 · 权限 · 沙箱</p></article><div class="flow-arrow">→</div>
  <article class="panel tool-call" data-reveal><span class="tag">MCP</span><h3>统一插座</h3><p>文件 · 数据库 · 浏览器 · 服务</p></article>
</div>
<p class="subtitle" data-reveal>MCP 让工具层标准化、可组合、可插拔：一个工具服务写一次，所有支持协议的 Agent 都能接入。</p>

<!-- 11 -->
<div style="padding-top:62px"><div class="eyebrow" data-reveal>护栏与人类在环</div><h2 class="title" data-reveal>刹车不是最后才装。</h2></div>
<div class="guard-layout">
  <article class="panel approval-card" data-reveal><div><span class="tag">DANGEROUS ACTION · PAUSED</span><h3 style="font:700 42px var(--font-display);margin-top:22px">准备删除生产数据</h3><p style="font-size:24px;line-height:1.5;margin-top:14px">动作在执行前冻结，等待人类确认。</p></div><div class="approval-actions"><span style="color:var(--lime)">批准</span><span style="color:var(--orange)">拒绝</span><span style="color:var(--blue)">修改</span></div></article>
  <article class="panel explainer" data-reveal><h3>护栏铺满整条管道。</h3><p>输入检查意图与敏感信息；工具层检查参数和权限；输出层检查格式与事实；记忆层防止跨会话泄露。</p></article>
</div>

<!-- 12 -->
<div style="padding-top:62px"><div class="eyebrow" data-reveal>持久化与长程 Agent</div><h2 class="title" data-reveal>任务跑一半挂了，不必从头来。</h2></div>
<div class="panel" data-checkpoint-animation data-reveal style="padding:56px;margin-top:44px;flex:1">
  <div class="timeline-track"><div class="checkpoint">INIT</div><div class="checkpoint">C1</div><div class="checkpoint">C2</div><div class="checkpoint">DONE</div><div class="crash-gap"></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:18px"><p style="font-size:24px;line-height:1.5"><b>Initializer</b> 先搭环境、写进度文件、建立初始提交。</p><p style="font-size:24px;line-height:1.5"><b>接班 Agent</b> 读取 progress + git history，从最后一个 checkpoint 继续。</p></div>
</div>

<!-- 13 -->
<div style="padding-top:62px"><div class="eyebrow" data-reveal>编排</div><h2 class="title" data-reveal>一个 Agent 不够时，才分工。</h2></div>
<div class="complexity-ladder">
  <article class="complexity-step" data-reveal><span class="tag">01</span><h3>单次调用</h3><p>一步能完成</p></article>
  <article class="complexity-step" data-reveal><span class="tag">02</span><h3>Prompt Chain</h3><p>固定顺序</p></article>
  <article class="complexity-step" data-reveal><span class="tag">03</span><h3>Routing</h3><p>分类分发</p></article>
  <article class="complexity-step" data-reveal><span class="tag">04</span><h3>Parallel Workers</h3><p>多路并行</p></article>
  <article class="complexity-step" data-reveal><span class="tag">05</span><h3>Evaluator-Optimizer</h3><p>生成与评审迭代</p></article>
</div>

<!-- 14 -->
<div style="padding-top:62px"><div class="eyebrow" data-reveal>评测与可观测</div><h2 class="title" data-reveal>没有仪表盘，就是盲飞。</h2></div>
<div class="observe-layout">
  <div class="trace" data-trace-animation data-reveal>
    <div class="trace-step"><span class="mono">STEP 01</span><span>检索项目规则</span><span>120 ms</span><span class="state">PASS</span></div>
    <div class="trace-step"><span class="mono">STEP 02</span><span>调用代码工具</span><span>860 ms</span><span class="state">PASS</span></div>
    <div class="trace-step"><span class="mono">STEP 03</span><span>运行验证</span><span>1.4 s</span><span class="state" style="color:var(--orange)">FAIL</span></div>
    <div class="trace-step"><span class="mono">STEP 04</span><span>修正并重试</span><span>920 ms</span><span class="state">PASS</span></div>
  </div>
  <article class="panel explainer" data-reveal><h3>不只看答案，还要看轨迹。</h3><p>任务是否完成、在哪一步失败、调用了什么工具、花了多少时间和成本，决定系统能否诊断和改进。</p></article>
</div>
```

- [ ] **Step 5: Run tests and verify pass**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
```

Expected: 7 tests PASS.

- [ ] **Step 6: Commit the mechanism slides**

```bash
git add slides/Agent-Harness-Presentation.html tests/agent-harness-presentation.test.js
git commit -m "feat: explain Harness mechanisms"
```

---

### Task 4: Implement slides 15–18 and close the argument

**Files:**
- Modify: `slides/Agent-Harness-Presentation.html`
- Modify: `tests/agent-harness-presentation.test.js`

**Interfaces:**
- Produces: the fourth `.three-stage[data-three-scene="evidence"]`, `.evidence-number`, `.interface-card`, `.rings`, `.ladder`, and final `.recap-grid`.
- Consumes: shared 3D mount/fallback contract and semantic color roles.

- [ ] **Step 1: Add failing tests for evidence caveat, outer Harness, complexity rule, and recap**

Append:

```js
test('closes with the approved evidence, practice and simplicity argument', () => {
  const html = readPresentation();
  for (const phrase of [
    '6.7%', '68.3%', 'EDIT TOOL FORMAT',
    '特定模型与评测案例',
    '厂商搭一层，团队还要再搭一层',
    '运行时无法预知所有步骤',
    '模型决定它有多聪明',
    'Harness 决定它能否把事做好',
  ]) assert.ok(html.includes(phrase), `missing closing copy: ${phrase}`);
});

test('uses Three.js on exactly four approved slides', () => {
  const html = readPresentation();
  const scenes = [...html.matchAll(/data-three-scene="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(scenes, ['cover', 'equation', 'anatomy', 'evidence']);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
```

Expected: FAIL on missing closing copy and the missing `evidence` scene.

- [ ] **Step 3: Add closing-act CSS**

Insert:

```css
.evidence-layout { display: grid; grid-template-columns: 1fr 1.1fr; gap: 46px; flex: 1; padding-top: 36px; align-items: center; }
.evidence-number { font: 700 116px/.9 var(--font-mono); letter-spacing: -.06em; }
.interface-card { width: 330px; padding: 26px; border: 3px solid var(--ink); border-radius: 20px; background: var(--blue); color: var(--white); box-shadow: 0 8px 0 var(--ink); text-align: center; font: 700 20px var(--font-mono); }
.rings { position: relative; min-height: 560px; display: grid; place-items: center; }
.ring { position: absolute; border: 3px solid var(--ink); border-radius: 50%; }
.ring.outer { width: 620px; height: 620px; background: color-mix(in srgb, var(--blue) 12%, transparent); }
.ring.inner { width: 360px; height: 360px; background: var(--white); }
.ring-label { position: absolute; padding: 11px 16px; border: 2px solid var(--ink); border-radius: 999px; background: var(--white); font: 600 15px var(--font-mono); }
.decision-ladder { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-top: 64px; }
.decision-step { position: relative; min-height: 330px; padding: 28px; display: flex; flex-direction: column; }
.decision-step:not(:last-child)::after { content: "→"; position: absolute; right: -19px; top: 46%; z-index: 2; font: 700 32px var(--font-mono); color: var(--orange); }
.decision-step h3 { margin-top: 18px; font: 700 31px var(--font-display); }
.decision-step p { margin-top: 16px; font-size: 22px; line-height: 1.45; }
.recap-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: auto; }
.recap-item { padding: 22px 24px; border: 2px solid var(--ink); border-radius: 18px; background: var(--white); font-size: 23px; }
.recap-item strong { color: var(--blue); }
.caveat { margin-top: 22px; max-width: 690px; font-size: 18px; line-height: 1.45; color: var(--muted); }
```

- [ ] **Step 4: Fill slides 15–18 with the approved closing bodies**

```html
<!-- 15 -->
<div style="padding-top:56px"><div class="eyebrow" data-reveal>一个把公式砸实的案例</div><h2 class="title" data-reveal>模型没变，表现却从 6.7% 到 68.3%。</h2></div>
<div class="evidence-layout">
  <div data-reveal><div class="evidence-number"><span style="color:var(--muted)">6.7%</span><br><span style="color:var(--orange)">→</span> <span style="color:var(--blue)">68.3%</span></div><p class="subtitle">Grok Code Fast 1 · SWE-bench</p><p class="caveat">这是报告引用的特定模型与评测案例，用来说明 Harness 可能释放能力；它不是所有 Harness 改动都能获得同等比例提升的承诺。</p></div>
  <div class="three-stage" data-three-scene="evidence" aria-label="替换编辑工具接口而不改变模型核心">
    <div class="three-mount" aria-hidden="true"></div>
    <div class="three-fallback"><div class="machine"><div class="machine-core">MODEL<br>UNCHANGED</div><div class="interface-card">EDIT TOOL FORMAT</div></div></div>
  </div>
</div>

<!-- 16 -->
<div style="padding-top:58px"><div class="eyebrow" data-reveal>内层与外层 Harness</div><h2 class="title" data-reveal>厂商搭一层，团队还要再搭一层。</h2></div>
<div class="rings" data-reveal>
  <div class="ring outer"></div><div class="ring inner"></div>
  <div class="machine-core">MODEL</div>
  <span class="ring-label" style="top:40px">外层 · 项目规则 / 测试 / 静态分析 / 架构约束</span>
  <span class="ring-label" style="bottom:94px">内层 · 系统提示 / 工具运行时 / 检索 / 编排</span>
</div>
<p class="subtitle" data-reveal style="max-width:1100px">外层 Harness 的目标：提高“一次做对”的概率，并让问题在到达人类之前先被系统发现和纠正。</p>

<!-- 17 -->
<div style="padding-top:58px"><div class="eyebrow" data-reveal>从简开始</div><h2 class="title" data-reveal>什么时候才需要完整 Agent？</h2></div>
<div class="decision-ladder">
  <article class="panel decision-step" data-reveal><span class="tag">01</span><h3>单次 LLM</h3><p>一个回答就能解决。</p></article>
  <article class="panel decision-step" data-reveal><span class="tag">02</span><h3>Prompt Chain</h3><p>步骤固定，可以预先写出。</p></article>
  <article class="panel decision-step" data-reveal><span class="tag">03</span><h3>Routing</h3><p>先分类，再交给专门处理器。</p></article>
  <article class="panel blue decision-step" data-reveal><span class="tag">04</span><h3>完整 Agent</h3><p>只有运行时无法预知所有步骤，模型必须自行决定下一步。</p></article>
</div>

<!-- 18 -->
<div style="margin:auto 0 40px">
  <div class="eyebrow" data-reveal>一句话记住</div>
  <h2 class="display" data-reveal style="font-size:98px;margin-top:28px">模型决定它有多聪明；<br><span style="color:var(--blue)">Harness 决定它能否把事做好。</span></h2>
</div>
<div class="recap-grid">
  <div class="recap-item" data-reveal><strong>循环</strong>让它继续</div><div class="recap-item" data-reveal><strong>上下文</strong>让它看对</div><div class="recap-item" data-reveal><strong>工具</strong>让它行动</div>
  <div class="recap-item" data-reveal><strong>护栏</strong>让它不越界</div><div class="recap-item" data-reveal><strong>持久化</strong>让它不中断</div><div class="recap-item" data-reveal><strong>评测</strong>让它可改进</div>
</div>
<div class="formula" data-reveal style="font-size:42px;margin:28px 0 0"><span>HARNESS</span><span class="operator">=</span><span>AGENT</span><span class="operator">−</span><span style="color:var(--orange)">MODEL</span></div>
```

- [ ] **Step 5: Run tests and verify pass**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
```

Expected: 9 tests PASS.

- [ ] **Step 6: Commit the closing act**

```bash
git add slides/Agent-Harness-Presentation.html tests/agent-harness-presentation.test.js
git commit -m "feat: complete Harness evidence and recap"
```

---

### Task 5: Add deterministic native 2D motion and cleanup

**Files:**
- Modify: `slides/Agent-Harness-Presentation.html`
- Modify: `tests/agent-harness-presentation.test.js`

**Interfaces:**
- Produces: `window.HarnessMotion.enter(slide: HTMLElement)` and `window.HarnessMotion.leave(slide: HTMLElement)`.
- Owns: all `Animation` objects, interval IDs, and requestAnimationFrame IDs created for 2D slides.
- Consumes: `[data-reveal]`, `[data-loop-animation]`, `[data-checkpoint-animation]`, and `[data-trace-animation]`.

- [ ] **Step 1: Add failing lifecycle and reduced-motion tests**

Append:

```js
test('defines deterministic 2D motion with cleanup and reduced-motion support', () => {
  const html = readPresentation();
  assert.match(html, /window\.HarnessMotion\s*=\s*\{\s*enter,\s*leave\s*\}/);
  assert.match(html, /animation\.cancel\(\)/);
  assert.match(html, /clearInterval\(intervalId\)/);
  assert.match(html, /cancelAnimationFrame\(frameId\)/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
  assert.match(html, /reduceMotion\.matches/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
```

Expected: FAIL because `HarnessMotion` is not defined.

- [ ] **Step 3: Add reduced-motion CSS**

Insert at the end of the stylesheet:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; scroll-behavior: auto !important; }
  [data-reveal] { opacity: 1 !important; transform: none !important; }
  .three-fallback { opacity: 1; }
  .three-mount { display: none; }
}
```

- [ ] **Step 4: Insert the motion controller before the slide-engine script**

```html
<script>
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const activeAnimations = new Set();
  const activeIntervals = new Set();
  const activeFrames = new Set();

  function trackAnimation(animation) {
    activeAnimations.add(animation);
    animation.addEventListener('finish', () => activeAnimations.delete(animation), { once: true });
    animation.addEventListener('cancel', () => activeAnimations.delete(animation), { once: true });
    return animation;
  }

  function reveal(slide) {
    const elements = [...slide.querySelectorAll('[data-reveal]')];
    if (reduceMotion.matches) {
      elements.forEach(element => { element.style.opacity = '1'; element.style.transform = 'none'; });
      return;
    }
    elements.forEach((element, index) => {
      const animation = element.animate(
        [{ opacity: 0, transform: 'translateY(28px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 620, delay: Math.min(index * 80, 560), easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }
      );
      trackAnimation(animation);
    });
  }

  function animateLoop(slide) {
    const orbit = slide.querySelector('[data-loop-animation]');
    const signal = orbit?.querySelector('.signal');
    if (!orbit || !signal || reduceMotion.matches) return;
    const positions = [
      ['calc(50% - 11px)', '10px'], ['calc(100% - 45px)', 'calc(50% - 11px)'],
      ['calc(50% - 11px)', 'calc(100% - 34px)'], ['22px', 'calc(50% - 11px)'],
    ];
    let step = 0;
    const intervalId = setInterval(() => {
      step = (step + 1) % positions.length;
      const animation = signal.animate(
        [{ left: signal.style.left || positions[(step + 3) % 4][0], top: signal.style.top || positions[(step + 3) % 4][1] }, { left: positions[step][0], top: positions[step][1] }],
        { duration: 620, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }
      );
      trackAnimation(animation);
      signal.style.left = positions[step][0]; signal.style.top = positions[step][1];
    }, 900);
    activeIntervals.add(intervalId);
  }

  function animateCheckpoint(slide) {
    const track = slide.querySelector('[data-checkpoint-animation]');
    if (!track || reduceMotion.matches) return;
    track.querySelectorAll('.checkpoint').forEach((point, index) => {
      trackAnimation(point.animate(
        [{ transform: 'scale(.72)', background: '#FFFFFF' }, { transform: 'scale(1)', background: '#B8D84A' }],
        { duration: 420, delay: 240 + index * 360, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }
      ));
    });
  }

  function animateTrace(slide) {
    const trace = slide.querySelector('[data-trace-animation]');
    if (!trace || reduceMotion.matches) return;
    trace.querySelectorAll('.trace-step').forEach((row, index) => {
      trackAnimation(row.animate(
        [{ opacity: .3, transform: 'translateX(-24px)' }, { opacity: 1, transform: 'translateX(0)' }],
        { duration: 460, delay: 300 + index * 260, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }
      ));
    });
  }

  function enter(slide) { reveal(slide); animateLoop(slide); animateCheckpoint(slide); animateTrace(slide); }
  function leave() {
    activeAnimations.forEach(animation => animation.cancel()); activeAnimations.clear();
    activeIntervals.forEach(intervalId => clearInterval(intervalId)); activeIntervals.clear();
    activeFrames.forEach(frameId => cancelAnimationFrame(frameId)); activeFrames.clear();
  }
  reduceMotion.addEventListener('change', () => {
    const active = document.querySelector('.slide.active'); leave(); if (active) enter(active);
  });
  window.HarnessMotion = { enter, leave };
})();
</script>
```

- [ ] **Step 5: Run tests and verify pass**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
```

Expected: 10 tests PASS.

- [ ] **Step 6: Commit motion lifecycle**

```bash
git add slides/Agent-Harness-Presentation.html tests/agent-harness-presentation.test.js
git commit -m "feat: add lifecycle-safe presentation motion"
```

---

### Task 6: Implement the reusable Three.js manager and four scenes

**Files:**
- Modify: `slides/Agent-Harness-Presentation.html`
- Modify: `tests/agent-harness-presentation.test.js`

**Interfaces:**
- Produces: `window.HarnessThree.activate(slide)`, `deactivate()`, and `dispose()`.
- Scene builder signature: `buildScene(sceneName: 'cover'|'equation'|'anatomy'|'evidence', THREE) -> { scene, camera, update(elapsedSeconds), resources }`.
- Consumes: `.three-stage[data-three-scene]`, `.three-mount`, `.three-fallback`, `window.HarnessDeck`, and reduced-motion media query.

- [ ] **Step 1: Add failing Three.js loading, lifecycle, and disposal tests**

Append:

```js
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
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
```

Expected: FAIL because the import map and `HarnessThree` manager do not exist.

- [ ] **Step 3: Add the pinned import map inside `<head>`**

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js"
  }
}
</script>
```

- [ ] **Step 4: Add the module manager before `</body>`**

The implementation below deliberately uses simple boxes, one ambient light, one directional light, and preset camera motion. It reuses one renderer while disposing every scene on exit.

```html
<script type="module">
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let THREE = null;
let renderer = null;
let active = null;
let loadFailed = false;

function materialsOf(material) { return Array.isArray(material) ? material : [material]; }
function disposeMaterial(material) {
  materialsOf(material).forEach(item => {
    for (const value of Object.values(item)) if (value?.isTexture) value.dispose();
    item.dispose();
  });
}
function disposeScene(scene) {
  scene.traverse(object => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) disposeMaterial(object.material);
  });
}
function makeMaterial(color) { return new THREE.MeshStandardMaterial({ color, roughness: .82, metalness: 0 }); }
function box(width, height, depth, color, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), makeMaterial(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
function baseScene() {
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
  camera.position.set(0, 1.5, 12);
  const ambient = new THREE.HemisphereLight(0xF2EBDD, 0x111111, 2.2);
  const key = new THREE.DirectionalLight(0xFFFFFF, 4.2); key.position.set(4, 8, 6); key.castShadow = true;
  scene.add(ambient, key);
  return { scene, camera };
}
function modelCore() { return box(2.5, 2.5, 2.5, 0xFF5A36, 0, 0, 0); }
function harnessBoxes(scene, scale = 1) {
  const positions = [[-4,2,0],[4,2,-.5],[-4,-1,1],[4,-1,0],[-3,-3,-1],[3,-3,.5]];
  return positions.map(([x,y,z], index) => {
    const module = box(2.1 * scale, 1.15 * scale, 1.15 * scale, 0x3157E1, x * scale, y * scale, z * scale);
    module.userData.index = index; scene.add(module); return module;
  });
}
function buildCover() {
  const { scene, camera } = baseScene(); const core = modelCore(); scene.add(core); const modules = harnessBoxes(scene);
  return { scene, camera, update(time) { if (!reduceMotion.matches) { scene.rotation.y = Math.sin(time * .28) * .22; core.rotation.y = time * .18; modules.forEach((item, i) => item.position.y += Math.sin(time * 1.1 + i) * .0008); } } };
}
function buildEquation() {
  const { scene, camera } = baseScene(); camera.position.set(0, .6, 14); const core = modelCore(); scene.add(core); const modules = harnessBoxes(scene, .9);
  return { scene, camera, update(time) { const progress = reduceMotion.matches ? 1 : Math.min(time / 2.2, 1); core.position.x = -2.8 * progress; modules.forEach((item, i) => { item.position.x += ((i % 2 ? 3.8 : 1.6) - item.position.x) * .025 * progress; item.rotation.y = progress * .35; }); } };
}
function buildAnatomy() {
  const { scene, camera } = baseScene();
  camera.position.set(0, 1, 15);
  const core = modelCore(); scene.add(core);
  const modules = harnessBoxes(scene, 1.05);
  return {
    scene, camera,
    update(time) {
      if (!reduceMotion.matches) camera.position.z = 15 - Math.min(time / 2, 1) * 2.4;
      modules.forEach((item, i) => item.scale.setScalar(1 + Math.max(0, Math.sin(time * .7 - i * .5)) * .08));
    },
  };
}
function buildEvidence() {
  const { scene, camera } = baseScene(); camera.position.set(0, 1, 13); const core = modelCore(); scene.add(core);
  const socket = box(3.4, 1.2, 1.4, 0x3157E1, 3.6, -.4, 0); scene.add(socket);
  return { scene, camera, update(time) { const progress = reduceMotion.matches ? 1 : Math.min(time / 2.3, 1); socket.position.x = 3.6 + Math.sin(progress * Math.PI) * 2.4; socket.rotation.y = progress * Math.PI * 2; core.rotation.y = reduceMotion.matches ? 0 : time * .1; } };
}
function buildScene(name) {
  if (name === 'cover') return buildCover();
  if (name === 'equation') return buildEquation();
  if (name === 'anatomy') return buildAnatomy();
  return buildEvidence();
}
function resize(stage, camera) {
  const rect = stage.getBoundingClientRect(); const width = Math.max(1, rect.width); const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  camera.aspect = width / height; camera.updateProjectionMatrix();
}
async function ensureThree() {
  if (THREE || loadFailed) return Boolean(THREE);
  try {
    THREE = await import('three');
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace;
    return true;
  } catch (error) {
    loadFailed = true; document.documentElement.classList.add('three-unavailable');
    console.warn('Three.js unavailable; keeping semantic fallback:', error); return false;
  }
}
async function activate(slide) {
  deactivate();
  const stage = slide?.querySelector('[data-three-scene]');
  if (!stage || reduceMotion.matches || !(await ensureThree())) return;
  if (!slide.classList.contains('active')) return;
  const mount = stage.querySelector('.three-mount');
  mount.replaceChildren(renderer.domElement); stage.classList.add('three-ready');
  const built = buildScene(stage.dataset.threeScene); const started = performance.now();
  active = { stage, ...built };
  resize(stage, built.camera);
  renderer.setAnimationLoop(now => {
    if (!active) return;
    active.update((now - started) / 1000); renderer.render(active.scene, active.camera);
  });
}
function deactivate() {
  if (renderer) renderer.setAnimationLoop(null);
  if (!active) return;
  active.stage.classList.remove('three-ready');
  disposeScene(active.scene); active = null;
}
function dispose() {
  deactivate();
  if (renderer) { renderer.dispose(); renderer.domElement.remove(); renderer = null; }
  THREE = null;
}
window.addEventListener('resize', () => { if (active) resize(active.stage, active.camera); });
reduceMotion.addEventListener('change', () => {
  const slide = document.querySelector('.slide.active'); deactivate(); if (!reduceMotion.matches && slide) activate(slide);
});
window.HarnessThree = { activate, deactivate, dispose };
const activeSlide = document.querySelector('.slide.active'); if (activeSlide) activate(activeSlide);
</script>
```

- [ ] **Step 5: Run tests and a JavaScript parse smoke check**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
node -e "const fs=require('fs'); const h=fs.readFileSync('slides/Agent-Harness-Presentation.html','utf8'); for(const m of h.matchAll(/<script(?![^>]*type=\"importmap\")[^>]*>([\s\S]*?)<\/script>/g)){ if(!m[0].includes('type=\"module\"')) new Function(m[1]); } console.log('classic scripts parse')"
```

Expected: 11 tests PASS; parse check prints `classic scripts parse`.

- [ ] **Step 6: Commit Three.js scenes**

```bash
git add slides/Agent-Harness-Presentation.html tests/agent-harness-presentation.test.js
git commit -m "feat: add selective Three.js Harness scenes"
```

---

### Task 7: Harden accessibility, semantic color, and fallback behavior

**Files:**
- Modify: `slides/Agent-Harness-Presentation.html`
- Modify: `tests/agent-harness-presentation.test.js`

**Interfaces:**
- Consumes: all static slide content and both lifecycle managers.
- Produces: explicit fallback selectors, focus behavior, active-slide accessibility state, and content contracts.

- [ ] **Step 1: Add failing hardening tests**

Append:

```js
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
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
```

Expected: FAIL because the explicit unavailable selector and slide `aria-hidden` updates are absent.

- [ ] **Step 3: Add explicit fallback and focus CSS**

```css
.three-unavailable .three-mount { display: none; }
.three-unavailable .three-fallback { opacity: 1; }
.slide[aria-hidden="true"] { pointer-events: none; }
button:focus-visible { outline: 3px solid var(--orange); outline-offset: 4px; }
@media (forced-colors: active) {
  .panel, .tag, .machine-core, .harness-module, .anatomy-module { forced-color-adjust: auto; }
}
```

- [ ] **Step 4: Update `show()` so inactive slides are hidden from assistive technology**

Replace the slide toggle line with:

```js
slides.forEach((slide, slideIndex) => {
  const isActive = slideIndex === current;
  slide.classList.toggle('active', isActive);
  slide.setAttribute('aria-hidden', String(!isActive));
});
```

Add `aria-hidden="true"` to the initial markup for slides 02–18 and `aria-hidden="false"` to slide 01.

- [ ] **Step 5: Add source attribution to slide 15 and the closing chrome**

Under slide 15’s caveat, add:

```html
<p class="mono" style="margin-top:14px;font-size:14px;color:var(--muted)">SOURCE · Agent Harness for LLM Agents: A Survey · report citation</p>
```

Set slide 18’s bottom-left chrome text to:

```html
<span>来源：LangChain · Anthropic · Martin Fowler · OpenAI · MCP</span>
```

- [ ] **Step 6: Run tests and verify pass**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
```

Expected: 13 tests PASS.

- [ ] **Step 7: Commit hardening changes**

```bash
git add slides/Agent-Harness-Presentation.html tests/agent-harness-presentation.test.js
git commit -m "fix: harden presentation fallbacks and accessibility"
```

---

### Task 8: Add runtime browser checks and complete verification

**Files:**
- Create: `tests/agent-harness-presentation.browser.test.js`
- Modify only if verification exposes defects: `slides/Agent-Harness-Presentation.html`

**Interfaces:**
- Consumes: final `window.HarnessDeck`, external controls, and localStorage key.
- Produces: executable Playwright checks that do not require the Three.js CDN to succeed.

- [ ] **Step 1: Write the Playwright browser test**

Create `tests/agent-harness-presentation.browser.test.js`:

```js
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import test from 'node:test';

const presentationUrl = new URL('../slides/Agent-Harness-Presentation.html', import.meta.url).href;

async function withPage(viewport, run) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewportSize: viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(presentationUrl, { waitUntil: 'domcontentloaded' });
  try { await run(page, errors); } finally { await browser.close(); }
}

test('navigates all boundaries and persists the current page', async () => {
  await withPage({ width: 1440, height: 900 }, async (page, errors) => {
    await page.evaluate(() => localStorage.removeItem('agent-harness-presentation-page'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#pageInfo').textContent(), '01 / 18');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#pageInfo').textContent(), '01 / 18');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#pageInfo').textContent(), '03 / 18');
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#pageInfo').textContent(), '03 / 18');
    await page.evaluate(() => window.HarnessDeck.show(99));
    assert.equal(await page.locator('#pageInfo').textContent(), '18 / 18');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#pageInfo').textContent(), '18 / 18');
    assert.deepEqual(errors.filter(message => !/Three\.js unavailable/.test(message)), []);
  });
});

test('centers a 16:9 deck without distortion in 16:10 and narrow viewports', async () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 800, height: 1000 }]) {
    await withPage(viewport, async page => {
      const metrics = await page.locator('#deck').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
      });
      assert.ok(Math.abs(metrics.width / metrics.height - 16 / 9) < 0.001);
      assert.ok(metrics.left >= -0.5 && metrics.top >= -0.5);
      assert.ok(metrics.width <= viewport.width + 1 && metrics.height <= viewport.height + 1);
    });
  }
});

test('keeps semantic fallback visible when Three.js is blocked', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewportSize: { width: 1280, height: 720 } });
  await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
  await page.goto(presentationUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.HarnessDeck.show(14));
  assert.equal(await page.locator('[data-three-scene="evidence"] .three-fallback').isVisible(), true);
  assert.match(await page.locator('[data-three-scene="evidence"] .three-fallback').textContent(), /MODEL\s*UNCHANGED[\s\S]*EDIT TOOL FORMAT/);
  await browser.close();
});
```

- [ ] **Step 2: Run static and browser tests**

Run:

```bash
node --test tests/agent-harness-presentation.test.js
node --test tests/agent-harness-presentation.browser.test.js
```

Expected: 13 static tests PASS and 3 browser tests PASS. If Chromium is missing, run `node scripts/install-chromium.js`, then rerun only the browser test.

- [ ] **Step 3: Run the project build to ensure the new slide does not break indexing**

Run:

```bash
VERCEL=1 npm run build
```

Expected: exit code 0 and `public/Agent-Harness-Presentation.html` exists if the build copies slide HTML by basename. If the build normalizes names, verify the generated link and copied filename agree rather than renaming the source file.

- [ ] **Step 4: Run the existing index test and the new tests together**

Run:

```bash
node --test tests/index-page.test.js tests/agent-harness-presentation.test.js tests/agent-harness-presentation.browser.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Inspect final source for forbidden drift and unresolved markers**

Run:

```bash
rg -n "TBD|TODO|FIXME|OrbitControls|Chart\.js|anime\.min\.js|TWEAKS|purple|pink|🤖|🚀|✨" slides/Agent-Harness-Presentation.html
```

Expected: no output.

Run:

```bash
rg -n "data-screen-label=|data-three-scene=|prefers-reduced-motion|setAnimationLoop\(null\)|\.dispose\(\)" slides/Agent-Harness-Presentation.html
```

Expected: 18 screen labels; exactly 4 Three.js scene declarations; reduced-motion CSS/JS; animation-loop stop; geometry/material/texture/renderer disposal calls.

- [ ] **Step 6: Commit runtime verification**

```bash
git add slides/Agent-Harness-Presentation.html tests/agent-harness-presentation.browser.test.js
git commit -m "test: verify Agent Harness presentation runtime"
```

- [ ] **Step 7: Request code/design review before integration**

Invoke `superpowers:requesting-code-review` and provide:

```text
Review the implementation against docs/superpowers/specs/2026-07-18-agent-harness-presentation-design.md. Focus on slide count/copy accuracy, overflow risk, lifecycle cleanup, WebGL fallback, reduced-motion comprehension, navigation persistence, and whether the four 3D scenes clarify rather than distract.
```

- [ ] **Step 8: Run end-to-end verification after review fixes**

Invoke the project `verify` skill to drive the deck in a real browser. Confirm keyboard navigation, button navigation, refresh persistence, full-screen behavior, all four 3D pages, CDN-blocked fallback, reduced-motion mode, and repeated entry/exit from slides 01/03/07/15 without duplicate render loops or console errors.

---

## Self-Review Record

- **Spec coverage:** Tasks 1–4 cover all 18 approved slides and exact narrative beats; Task 5 covers 2D causality and cleanup; Task 6 covers the four selective 3D scenes and GPU lifecycle; Task 7 covers fallbacks, accessibility, citations, palette, and reduced motion; Task 8 covers static, runtime, build, and end-to-end verification.
- **Scope:** The presentation, lifecycle managers, and tests form one independently testable artifact. No unrelated framework comparison or index redesign is included.
- **Type/interface consistency:** `HarnessDeck.show/next/previous/current/total`, `HarnessMotion.enter/leave`, and `HarnessThree.activate/deactivate/dispose` are defined once and consumed with matching names.
- **Dependency consistency:** Three.js is pinned to `0.185.0`; no addon import or global `THREE` script is used.
- **Content consistency:** The central formula and the final sentence match the approved design; the Grok benchmark includes a non-generalization caveat.
