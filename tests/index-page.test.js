import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const templatePath = new URL('../templates/index.html', import.meta.url);
const outputPath = new URL('../public/index.html', import.meta.url);
const template = fs.readFileSync(templatePath, 'utf8');

const matches = (pattern, value, message) => {
  assert.equal(pattern.test(value), true, message);
};

const excludes = (pattern, value, message) => {
  assert.equal(pattern.test(value), false, message);
};

const previousVercel = process.env.VERCEL;
process.env.VERCEL = '1';
await import(`../build.js?test=${Date.now()}`);
if (previousVercel === undefined) {
  delete process.env.VERCEL;
} else {
  process.env.VERCEL = previousVercel;
}

test('loads only the background libraries after the first page load', () => {
  excludes(/lenis|gsap|scrolltrigger|vanilla-tilt|fonts\.googleapis/i, template, 'heavy animation and font dependencies should be removed');
  excludes(/<script[^>]+src="[^"]*(?:three|vanta)[^"]*"/i, template, 'background libraries should not block document loading');
  matches(/await loadScript\(THREE_URL\)[\s\S]*await loadScript\(VANTA_URL\)/, template, 'Three.js should finish loading before Vanta NET');
  matches(/requestIdleCallback/, template, 'background libraries should load while the browser is idle');
  matches(/vantaEffect\.destroy\(\)/, template, 'Vanta should release its WebGL resources');
});

test('declares a favicon without adding another request', () => {
  matches(/<link rel="icon" href="data:,">/, template, 'the page should not request a missing favicon');
});

test('reveals cards once with native browser APIs', () => {
  matches(/new IntersectionObserver/, template, 'cards should use IntersectionObserver');
  matches(/observer\.unobserve\(card\)/, template, 'revealed cards should be unobserved');
  matches(/translateY\(18px\)/, template, 'cards should use the selected 18px reveal');
  excludes(/toggleActions|transform-style:\s*preserve-3d|translateZ\(/, template, 'reversible and 3D card effects should be removed');
});

test('contains explicit responsive and reduced-motion behavior', () => {
  matches(/@media \(min-width: 1100px\)/, template, 'desktop breakpoint should be explicit');
  matches(/@media \(min-width: 680px\) and \(max-width: 1099px\)/, template, 'tablet breakpoint should be explicit');
  matches(/@media \(max-width: 679px\)/, template, 'mobile breakpoint should be explicit');
  matches(/@media \(prefers-reduced-motion: reduce\)/, template, 'reduced motion should be supported');
  matches(/@media \(hover: none\), \(pointer: coarse\), \(max-width: 679px\)[\s\S]*?backdrop-filter:\s*none/, template, 'mobile cards should not use backdrop blur');
});

test('generated thumbnails have stable dimensions and staged priorities', () => {
  const output = fs.readFileSync(outputPath, 'utf8');
  const images = [...output.matchAll(/<img\s+[^>]*>/g)].map((match) => match[0]);

  assert.ok(images.length >= 4, 'expected at least four generated thumbnails');
  assert.match(images[0], /width="1280" height="720"/);
  assert.match(images[0], /decoding="async"/);
  assert.match(images[0], /loading="eager"/);
  assert.match(images[0], /fetchpriority="high"/);
  assert.match(images[1], /loading="eager"/);
  assert.match(images[2], /loading="eager"/);
  assert.match(images[3], /loading="lazy"/);
  assert.match(images[3], /fetchpriority="low"/);
});
