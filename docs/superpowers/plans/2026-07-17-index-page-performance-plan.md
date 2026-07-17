# Index Page Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the animated background and thumbnails while making first render lighter, removing mobile card flicker, and delivering stable responsive layouts.

**Architecture:** Keep only Three.js and Vanta for the background, and load them sequentially during browser idle time after the first page load. Replace Lenis, GSAP, ScrollTrigger, Vanilla Tilt, and the custom cursor with native scrolling, CSS transitions, and a one-shot IntersectionObserver reveal. Generate explicit image loading metadata from `build.js`.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js build script, Node test runner, Playwright browser verification.

---

### Task 1: Add regression coverage

**Files:**
- Create: `tests/index-page.test.js`

- [ ] Write source assertions for removed libraries, post-load Vanta loading, one-shot IntersectionObserver behavior, responsive breakpoints, reduced motion, and mobile blur removal.
- [ ] Build with `VERCEL=1 node build.js` and assert generated image loading attributes.
- [ ] Run `node --test tests/index-page.test.js` and verify the assertions fail against the old template.

### Task 2: Replace the expensive card pipeline

**Files:**
- Modify: `templates/index.html`

- [ ] Remove Lenis, GSAP, ScrollTrigger, Vanilla Tilt, Google Fonts, custom cursor, 3D transforms, glare, animated filters, and reversible reveals.
- [ ] Add sequential idle loading for Three.js/Vanta and initialize with `destroy()` cleanup.
- [ ] Add a one-shot IntersectionObserver reveal using `.is-visible` and `observer.unobserve(card)`.
- [ ] Add fine-pointer hover effects and `prefers-reduced-motion` fallback.
- [ ] Add explicit 3/2/1-column responsive rules and mobile no-blur surface rules.
- [ ] Run `node --test tests/index-page.test.js` and verify template assertions pass except image markup assertions.

### Task 3: Prioritize thumbnail loading

**Files:**
- Modify: `build.js`

- [ ] Render width, height, decoding, loading, and fetchpriority attributes for each generated thumbnail.
- [ ] Give index 0 high priority, indexes 1-2 eager loading, and later images lazy loading.
- [ ] Run `node --test tests/index-page.test.js` and verify all tests pass.

### Task 4: Build and browser verification

**Files:**
- Generated: `public/index.html`

- [ ] Run `VERCEL=1 npm run build` and verify exit code 0.
- [ ] Start the static server and inspect 1440x1000, 768x1024, and 390x844 viewports.
- [ ] Verify card column counts, no horizontal overflow, loaded thumbnails, visible Vanta canvas, and one-shot reveal behavior.
- [ ] Check browser console for errors and inspect screenshots for overlap or blank content.
