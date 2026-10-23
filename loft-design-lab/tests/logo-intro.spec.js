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

async function installIntroProbe(page, maxDuration = 10_000) {
  await page.addInitScript(maxDuration => {
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
        let energy = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const brightness = Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) * pixels[index + 3] / 255;
          maximum = Math.max(maximum, brightness);
          energy += brightness;
          if (brightness > 20) lit += 1;
          hash = (Math.imul(hash, 31) + Math.round(brightness)) >>> 0;
        }
        probe.samples.push({ phase: loader.dataset.introPhase, maximum, lit, hash, energy });
      }
      if (loader?.dataset.introState !== 'done' && performance.now() - started < maxDuration) requestAnimationFrame(readFrame);
    }
    requestAnimationFrame(readFrame);
  }, maxDuration);
}

function expectVisibleBrushReplay(probe) {
  expect(probe.phases).toEqual(['assembling', 'assembled', 'dissolving', 'complete']);
  const drawing = probe.samples.filter(sample => sample.phase === 'assembling' && sample.lit > 4);
  expect(new Set(drawing.map(sample => sample.hash)).size, 'The replay draws changing ink in the actual canvas').toBeGreaterThan(1);
  expect(probe.samples.some(sample => sample.phase === 'assembled' && sample.maximum > 100 && sample.lit > 8), 'The replay reaches a visibly rendered LOFT logo').toBe(true);
}

async function expectReleasedPage(page) {
  await expect(page.locator('#loader')).toHaveAttribute('data-intro-state', 'done');
  await expect(page.locator('#loader')).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-loft-intro-active');
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-ready/);
  await expect(page.locator('.cinema-story h1')).toBeVisible();
  await expect(page.locator('#camera-showcase')).toHaveCount(1);
}

test('the real logo is drawn in brush strokes and dissolves before the preserved homepage appears', async ({ page }) => {
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
    expect(new Set(visibleFrames.map(sample => sample.hash)).size, `${phase} changes the rendered logo`).toBeGreaterThan(1);
  }
  // Ink builds up as strokes are written, then fades away. Compare windows of
  // real pixels rather than relying on the timeline's internal progress value.
  const averageEnergy = samples => samples.reduce((sum, sample) => sum + sample.energy, 0) / samples.length;
  const heldEnergy = averageEnergy(assembled);
  const written = probe.samples.filter(sample => sample.phase === 'assembling');
  const dissolved = probe.samples.filter(sample => sample.phase === 'dissolving');
  expect(written.length).toBeGreaterThan(3);
  expect(dissolved.length).toBeGreaterThan(3);
  const writtenWindow = Math.max(1, Math.floor(written.length / 4));
  const dissolvedWindow = Math.max(1, Math.floor(dissolved.length / 4));
  expect(averageEnergy(written.slice(-writtenWindow)) - averageEnergy(written.slice(0, writtenWindow)), 'Visible ink accumulates during the brush drawing').toBeGreaterThan(heldEnergy * .25);
  expect(averageEnergy(dissolved.slice(-dissolvedWindow)), 'The written logo gently disappears during dissolution').toBeLessThan(averageEnergy(dissolved.slice(0, dissolvedWindow)) * .7);
  await expect(page.locator('button[data-chapter]')).toHaveCount(3);
  expect(await page.locator('.camera-showcase-art canvas').count(), 'The distant camera remains lazy').toBe(0);
});

test('reduced motion skips brush drawing and Escape can immediately dismiss a fresh intro', async ({ page }) => {
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

test('an explicit full-motion replay draws the logo despite reduced motion and a section hash', async ({ page }) => {
  await installIntroProbe(page);
  await page.goto('/?intro=brush&motion=full#work');
  await expectReleasedPage(page);
  expectVisibleBrushReplay(await page.evaluate(() => window.__logoIntroProbe));
  expect(new URL(page.url()).hash, 'Only an explicit replay clears the previous section target').toBe('');
  expect(await page.evaluate(() => scrollY), 'The replay returns to the beginning of the homepage').toBeLessThanOrEqual(10);
});

test('an initially hidden page plays its intro after activation even when the bootstrap guard has expired', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installIntroProbe(page, 20_000);
  await page.addInitScript(() => {
    window.__introTestHidden = true;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => window.__introTestHidden,
    });
  });
  await page.goto('/');
  const loader = page.locator('#loader');
  await expect(loader).toHaveAttribute('data-intro-state', 'waiting');
  await expect(page.locator('html')).not.toHaveAttribute('data-loft-intro-active');
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  // The existing CSS guard expires while the tab is still in the background.
  await expect(loader).toHaveCSS('visibility', 'hidden', { timeout: 6500 });
  await expect(loader).toHaveAttribute('data-intro-state', 'waiting');
  expect(await page.evaluate(() => window.__logoIntroProbe.phases)).toEqual([]);

  await page.evaluate(() => {
    window.__introTestHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(loader).toHaveAttribute('data-intro-state', 'playing');
  await expect(loader).toBeVisible();
  await expectReleasedPage(page);
  expectVisibleBrushReplay(await page.evaluate(() => window.__logoIntroProbe));
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
