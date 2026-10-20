const { test, expect } = require('@playwright/test');

const runtimeErrors = new WeakMap();
const submittedOrders = new WeakMap();

test.beforeEach(async ({ page, baseURL }) => {
  const errors = [];
  const orders = [];
  runtimeErrors.set(page, errors);
  submittedOrders.set(page, orders);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/order') {
      orders.push(request.method());
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    }
    if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL).origin) {
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>',
      });
    }
    return route.continue();
  });
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page), 'The intro does not throw browser errors').toEqual([]);
  expect(submittedOrders.get(page), 'An intro never submits an order').toEqual([]);
});

async function openPlayingIntro(page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response.status()).toBe(200);
  const loader = page.locator('#loader.logo-intro');
  await expect(loader).toHaveClass(/\bis-playing\b/);
  await expect(loader).toHaveAttribute('data-intro-state', /assembling|formed/);
  return loader;
}

async function expectPageReleased(page, timeout = 5000) {
  await expect(page.locator('#loader')).toBeHidden({ timeout });
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  expect(await page.locator('#main-content').evaluate(element => element.inert), 'The page is no longer inert').toBe(false);
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#loader,[inert]'))), 'Focus is not trapped in the dismissed overlay').toBe(false);
  const logoLink = page.locator('.nav-logo');
  await logoLink.focus();
  await expect(logoLink).toBeFocused();
}

async function sampleParticles(canvas) {
  return canvas.evaluate(element => {
    const sample = document.createElement('canvas');
    sample.width = 96;
    sample.height = 48;
    const context = sample.getContext('2d');
    context.drawImage(element, 0, 0, sample.width, sample.height);
    const pixels = Array.from(context.getImageData(0, 0, sample.width, sample.height).data);
    return {
      width: element.width,
      height: element.height,
      pixels,
      visible: pixels.filter((alpha, index) => index % 4 === 3 && alpha > 20).length,
    };
  });
}

test('real particles visibly assemble the actual LOFT logo and then release the home page', async ({ page }) => {
  const loader = await openPlayingIntro(page);
  const source = loader.locator('img[data-intro-logo]');
  await expect.poll(() => source.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  const identity = await source.evaluate(image => ({
    intro: new URL(image.currentSrc || image.src).pathname,
    brand: new URL(document.querySelector('.nav-logo img').src).pathname,
  }));
  expect(identity.intro, 'The intro uses the existing brand asset rather than a text imitation').toBe(identity.brand);

  const canvas = loader.locator('canvas.logo-intro-canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => (await sampleParticles(canvas)).visible).toBeGreaterThan(8);
  const before = await sampleParticles(canvas);
  expect(before.width).toBeGreaterThan(100);
  expect(before.height).toBeGreaterThan(40);
  await page.evaluate(() => new Promise(resolve => {
    let frames = 0;
    const next = () => { if (++frames >= 18) resolve(); else requestAnimationFrame(next); };
    requestAnimationFrame(next);
  }));
  const after = await sampleParticles(canvas);
  const difference = before.pixels.reduce((sum, value, index) => sum + Math.abs(value - after.pixels[index]), 0) / before.pixels.length;
  expect(difference, 'The canvas changes real particle pixels while assembling').toBeGreaterThan(.5);

  await expectPageReleased(page);
  await expect(loader).toHaveAttribute('data-intro-state', 'complete');
  await expect(page.locator('.cinema-story h1')).toBeVisible();
});

for (const method of ['skip button', 'Escape']) {
  test(`${method} skips the intro and restores native focus and navigation`, async ({ page }) => {
    const loader = await openPlayingIntro(page);
    if (method === 'skip button') await loader.locator('[data-intro-skip]').click();
    else await page.keyboard.press('Escape');
    await expectPageReleased(page, 1500);
    await page.locator('[data-cinema-copy="0"] .cinema-cta').click();
    await expect(page).toHaveURL(/\/order$/);
    await expect(page.locator('#firstName')).toBeVisible();
  });
}

test('changing to reduced motion immediately ends an active intro without moving the page', async ({ page }) => {
  await openPlayingIntro(page);
  const position = await page.evaluate(() => scrollY);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectPageReleased(page, 1500);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(position, 0);
});

test('reduced motion shows the static brand briefly and makes the page available promptly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectPageReleased(page, 1200);
  await expect(page.locator('.cinema-story h1')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/\blenis\b/);
});

test('a missing logo image cannot trap visitors behind the intro', async ({ page }) => {
  await page.route('**/assets/images/logo_rect_white.png*', route => route.abort('failed'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectPageReleased(page);
  await expect(page.locator('.cinema-story h1')).toBeVisible();
});

test('a direct portfolio link skips the intro and keeps its native destination', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#work', { waitUntil: 'domcontentloaded' });
  await expectPageReleased(page, 1200);
  await expect(page).toHaveURL(/#work$/);
  await expect(page.locator('#work .section-title')).toBeVisible();
  await expect.poll(() => page.locator('#work').evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(180);
});

test('the CSS fallback dismisses the overlay if its animation bundle is blocked', async ({ page }) => {
  await page.route('**/assets/js/loft-cinema.js*', route => route.abort('failed'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectPageReleased(page, 5000);
  await expect(page.locator('.cinema-story h1')).toBeVisible();
});
