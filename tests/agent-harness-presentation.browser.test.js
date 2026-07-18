import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import test from 'node:test';

const presentationUrl = new URL('../slides/Agent-Harness-Presentation.html', import.meta.url).href;

async function withPage(viewport, run, initScript) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
  if (initScript) await page.addInitScript(initScript);
  await page.goto(presentationUrl, { waitUntil: 'domcontentloaded' });
  try { await run(page, pageErrors); } finally { await browser.close(); }
}

test('initial activation runs the standard enter lifecycle', async () => {
  await withPage({ width: 1280, height: 720 }, async page => {
    const calls = await page.evaluate(() => window.lifecycleCalls);
    assert.deepEqual(calls, ['three.activate:01 Cover', 'event.enter:0']);
    assert.ok(await page.locator('[data-screen-label="01 Cover"] [data-reveal]').first().evaluate(element => element.getAnimations().length > 0));
  }, () => {
    window.lifecycleCalls = [];
    window.HarnessMotion = {
      enter: slide => window.lifecycleCalls.push(`motion.enter:${slide.dataset.screenLabel}`),
      leave: () => {},
    };
    window.HarnessThree = {
      activate: slide => window.lifecycleCalls.push(`three.activate:${slide.dataset.screenLabel}`),
      deactivate: () => {},
      dispose: () => {},
    };
    window.addEventListener('harness:slideenter', event => window.lifecycleCalls.push(`event.enter:${event.detail.index}`));
  });
});

test('rejects invalid show indices and no-ops at navigation boundaries', async () => {
  await withPage({ width: 1280, height: 720 }, async page => {
    await page.evaluate(() => {
      window.transitionCalls = [];
      window.HarnessMotion = {
        leave: () => window.transitionCalls.push('motion.leave'),
        enter: () => window.transitionCalls.push('motion.enter'),
      };
      window.HarnessThree = {
        deactivate: () => window.transitionCalls.push('three.deactivate'),
        activate: () => window.transitionCalls.push('three.activate'),
        dispose: () => {},
      };
      window.addEventListener('harness:slideleave', () => window.transitionCalls.push('event.leave'));
      window.addEventListener('harness:slideenter', () => window.transitionCalls.push('event.enter'));
      localStorage.setItem('agent-harness-presentation-page', '0');
    });

    for (const value of [NaN, Infinity, -Infinity, 1.5, '2']) {
      assert.equal(await page.evaluate(index => window.HarnessDeck.show(index), value), 0);
    }
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#pageInfo').textContent(), '01 / 18');
    assert.equal(await page.evaluate(() => localStorage.getItem('agent-harness-presentation-page')), '0');
    assert.deepEqual(await page.evaluate(() => window.transitionCalls), []);
  });
});

test('does not consume native Space on focused controls', async () => {
  await withPage({ width: 1280, height: 720 }, async page => {
    await page.evaluate(() => {
      window.fullscreenClicks = 0;
      document.documentElement.requestFullscreen = async () => {};
      document.getElementById('fullscreenBtn').addEventListener('click', () => { window.fullscreenClicks += 1; });
    });
    await page.locator('#fullscreenBtn').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.fullscreenClicks), 1);
    assert.equal(await page.locator('#pageInfo').textContent(), '01 / 18');
  });
});

test('isolates lifecycle hook failures and completes transition order', async () => {
  await withPage({ width: 1280, height: 720 }, async (page, pageErrors) => {
    const result = await page.evaluate(async () => {
      window.transitionCalls = [];
      window.addEventListener('harness:slideleave', event => window.transitionCalls.push(`event.leave:${event.detail.index}`));
      window.addEventListener('harness:slideenter', event => window.transitionCalls.push(`event.enter:${event.detail.index}`));
      const fail = name => () => { window.transitionCalls.push(name); throw new Error(name); };
      window.HarnessMotion = { leave: fail('motion.leave'), enter: fail('motion.enter') };
      window.HarnessThree = {
        deactivate: fail('three.deactivate'),
        activate: slide => {
          window.transitionCalls.push('three.activate');
          return Promise.reject(new Error(`three.activate:${slide.dataset.screenLabel}`));
        },
        dispose: () => {},
      };
      const current = window.HarnessDeck.show(1);
      await new Promise(resolve => setTimeout(resolve, 0));
      return {
        calls: window.transitionCalls,
        current,
        pageInfo: document.getElementById('pageInfo').textContent,
        stored: localStorage.getItem('agent-harness-presentation-page'),
      };
    });
    assert.deepEqual(result, {
      calls: ['event.leave:0', 'motion.leave', 'three.deactivate', 'motion.enter', 'three.activate', 'event.enter:1'],
      current: 1,
      pageInfo: '02 / 18',
      stored: '1',
    });
    assert.deepEqual(pageErrors, []);
  });
});


test('navigates all boundaries and persists the current page', async () => {
  await withPage({ width: 1440, height: 900 }, async (page, pageErrors) => {
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
    assert.deepEqual(pageErrors, []);
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
  await withPage({ width: 1280, height: 720 }, async page => {
    await page.waitForTimeout(300);
    await page.evaluate(() => window.HarnessDeck.show(14));
    const fallback = page.locator('[data-three-scene="evidence"] .three-fallback');
    assert.equal(await fallback.isVisible(), true);
    assert.match(await fallback.textContent(), /MODEL\s*UNCHANGED[\s\S]*EDIT TOOL FORMAT/);
  });
});
