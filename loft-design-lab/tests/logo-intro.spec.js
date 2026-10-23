const { test, expect } = require('@playwright/test');

const runtimeErrors = new WeakMap();

test.beforeEach(async ({ page, baseURL }) => {
  const errors = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/order') {
      errors.push('The intro must never submit a lead.');
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    }
    if (url.origin !== new URL(baseURL).origin) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
    }
    return route.continue();
  });
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page), 'The intro has no uncaught errors or submitted leads').toEqual([]);
});

async function installIntroProbe(page) {
  await page.addInitScript(() => {
    const probe = window.__logoIntroProbe = { phases: [], samples: [] };
    const sample = document.createElement('canvas');
    sample.width = 48;
    sample.height = 24;
    const context = sample.getContext('2d', { willReadFrequently: true });
    const started = performance.now();
    let previousPhase;
    let frame = 0;
    const recordPhase = () => {
      const phase = document.querySelector('#loader')?.dataset.introPhase;
      if (phase && phase !== previousPhase) {
        previousPhase = phase;
        probe.phases.push(phase);
      }
    };
    new MutationObserver(recordPhase).observe(document, {
      subtree: true, attributes: true, attributeFilter: ['data-intro-phase'],
    });
    function readFrame() {
      recordPhase();
      const loader = document.querySelector('#loader');
      const canvas = loader?.querySelector('.logo-intro-canvas');
      if (context && canvas?.width && canvas.height && frame++ % 3 === 0) {
        context.clearRect(0, 0, 48, 24);
        context.drawImage(canvas, 0, 0, 48, 24);
        const pixels = context.getImageData(0, 0, 48, 24).data;
        let hash = 0;
        let maximum = 0;
        let lit = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const brightness = Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) * pixels[index + 3] / 255;
          maximum = Math.max(maximum, brightness);
          if (brightness > 20) lit += 1;
          hash = (Math.imul(hash, 31) + Math.round(brightness)) >>> 0;
        }
        probe.samples.push({ phase: loader.dataset.introPhase, maximum, lit, hash });
      }
      if (loader?.dataset.introState !== 'done' && performance.now() - started < 10_000) requestAnimationFrame(readFrame);
    }
    requestAnimationFrame(readFrame);
  });
}

async function expectReleasedPage(page) {
  await expect(page.locator('#loader')).toHaveAttribute('data-intro-state', 'done');
  await expect(page.locator('#loader')).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-loft-intro-active');
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-ready/);
  await expect(page.locator('.cinema-story h1')).toBeVisible();
  await expect(page.locator('#camera-showcase')).toHaveCount(1);
}

test('the real logo assembles and dissolves through changing canvas pixels before the preserved homepage appears', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installIntroProbe(page);
  const response = await page.goto('/');
  expect(response.status()).toBe(200);
  await expectReleasedPage(page);
  const probe = await page.evaluate(() => window.__logoIntroProbe);
  const phases = ['assembling', 'assembled', 'dissolving', 'complete'];
  expect(probe.phases.filter(phase => phases.includes(phase))).toEqual(phases);
  const assembled = probe.samples.filter(sample => sample.phase === 'assembled');
  expect(assembled.some(sample => sample.maximum > 100 && sample.lit > 8), 'The assembled brand is visible in the actual canvas').toBe(true);
  for (const phase of ['assembling', 'dissolving']) {
    const visibleFrames = probe.samples.filter(sample => sample.phase === phase && sample.lit > 4);
    expect(new Set(visibleFrames.map(sample => sample.hash)).size, `${phase} changes the rendered particle positions`).toBeGreaterThan(1);
  }
  await expect(page.locator('button[data-chapter]')).toHaveCount(3);
  expect(await page.locator('.camera-showcase-art canvas').count(), 'The distant camera remains lazy').toBe(0);
});

test('reduced motion skips particle movement and Escape can immediately dismiss a fresh intro', async ({ page }) => {
  await installIntroProbe(page);
  await page.goto('/');
  await expectReleasedPage(page);
  const reducedPhases = await page.evaluate(() => window.__logoIntroProbe.phases);
  expect(reducedPhases).not.toContain('assembling');
  expect(reducedPhases).not.toContain('dissolving');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loader')).toHaveAttribute('data-intro-state', 'playing');
  await page.keyboard.press('Escape');
  await expectReleasedPage(page);
  await page.evaluate(() => scrollTo({ top: 320, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(250);
});

test('an unavailable logo cannot leave an overlay blocking the site', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/assets/images/logo_rect_white.png*', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await expectReleasedPage(page);
  await expect(page.locator('#loader')).toHaveCSS('pointer-events', 'none');
  await page.locator('button[data-chapter="1"]').click();
  await expect(page.locator('.cinema-stage')).toHaveAttribute('data-current-chapter', '1');
});
