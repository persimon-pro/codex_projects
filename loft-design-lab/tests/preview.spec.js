const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const previewPath = '/preview/loft-preview.html';
let bootstrapHash;

test.beforeAll(() => {
  // Exercise the supported export command, then navigate to its actual HTTP file.
  execFileSync(process.execPath, ['scripts/export-preview.js'], { cwd: root, stdio: 'pipe' });
  const html = readFileSync(path.join(root, 'preview/loft-preview.html'), 'utf8');
  const bootstrap = html.match(/<script>(document\.documentElement\.setAttribute\('data-loft-loading', ''\);)<\/script>/);
  if (!bootstrap) throw new Error('The preview must retain its early loading bootstrap.');
  bootstrapHash = createHash('sha256').update(bootstrap[1]).digest('base64');
});

test.beforeEach(async ({ page, baseURL }) => {
  // Static main-page checks may contain remote portfolio thumbnails. Keep these
  // tests local; the portable export additionally asserts it requested none.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL).origin) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
    }
    return route.continue();
  });
});

async function navigate(page, pathname) {
  const response = await page.goto(pathname);
  expect(response.status(), 'The real HTTP document is available').toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
}

async function expectStaticContent(page, { bootstrapRan = false } = {}) {
  await expect(page.locator('canvas.loft-morph-canvas')).toHaveCount(0);
  const fallback = page.locator('.cinema-fallback');
  await expect(fallback).toBeVisible();
  await expect.poll(() => fallback.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.cinema-story h1')).toBeVisible();
  await expect(page.locator('[data-cinema-copy="0"] .cinema-cta')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-loft-reveal', '');
  expect(await page.locator('.reveal').count()).toBeGreaterThan(5);
  const hiddenReveals = await page.locator('.reveal').evaluateAll(elements => elements.filter(element => {
    const style = getComputedStyle(element);
    return style.opacity !== '1' || style.transform !== 'none';
  }).length);
  expect(hiddenReveals, 'Content remains visible when its JavaScript does not execute').toBe(0);
  if (!bootstrapRan) {
    await expect(page.locator('html')).not.toHaveAttribute('data-loft-loading', '');
    await expect(page.locator('#loader')).toHaveCSS('display', 'none');
  }
  await expect(page.locator('#loader')).toBeHidden();
}

async function applyScriptPolicy(page, policy) {
  await page.route(`**${previewPath}`, async route => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': policy },
    });
  });
}

test('portable HTTP preview renders real WebGL, chapters and five inline portraits without asset requests or errors', async ({ page, baseURL }, testInfo) => {
  const externalRequests = [];
  const errors = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL).origin) externalRequests.push(request.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await navigate(page, previewPath);
  await expect(page.locator('#loader')).toBeHidden();
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-ready/);
  const canvas = page.locator('canvas.loft-morph-canvas');
  await expect(canvas).toBeVisible();
  const graphics = await canvas.evaluate(element => {
    const gl = element.getContext('webgl2') || element.getContext('webgl');
    return gl && { version: gl.getParameter(gl.VERSION), width: gl.drawingBufferWidth, lost: gl.isContextLost() };
  });
  expect(graphics).toBeTruthy();
  expect(graphics.version).toContain('WebGL');
  expect(graphics.width).toBeGreaterThan(100);
  expect(graphics.lost).toBe(false);
  await expect(page.locator('.cinema-story h1')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  const portraits = page.locator('#artists .artist-photo img');
  await expect(portraits).toHaveCount(5);
  for (const image of await portraits.all()) {
    await expect(image).toHaveAttribute('src', /^data:image\//);
    await image.evaluate(element => { element.loading = 'eager'; });
  }
  await expect.poll(() => portraits.evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  const noteClose = page.locator('.loft-preview-note button');
  if (await noteClose.isVisible()) await noteClose.click();
  if (testInfo.project.name === 'desktop') await page.screenshot({ path: '/tmp/loft-preview-fixed.png' });

  await page.locator('button[data-chapter="2"]').click();
  await expect(page.locator('button[data-chapter="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.cinema-stage')).toHaveAttribute('data-current-chapter', '2');
  await expect(page.locator('[data-cinema-copy="2"]')).toBeVisible();
  await expect.poll(async () => Number(await page.locator('.cinema-stage').getAttribute('data-progress'))).toBeCloseTo(1, 2);
  expect(externalRequests, 'Portable assets never require an external host').toEqual([]);
  expect(errors, 'The portable document has no runtime, shader or asset errors').toEqual([]);
});

test.describe('JavaScript is disabled', () => {
  test.use({ javaScriptEnabled: false });

  for (const [name, pathname] of [['portable export', previewPath], ['main homepage', '/']]) {
    test(`${name} keeps its artwork, text and reveal sections visible with no loader`, async ({ page }) => {
      await navigate(page, pathname);
      await expectStaticContent(page);
    });
  }
});

test('a script-src none CSP leaves the portable HTTP preview readable', async ({ page }, testInfo) => {
  await applyScriptPolicy(page, "script-src 'none'");
  await navigate(page, previewPath);
  await expectStaticContent(page);
  if (testInfo.project.name === 'desktop') await page.screenshot({ path: '/tmp/loft-preview-fixed-static.png' });
});

test('when only the loading bootstrap executes the CSS failsafe dismisses the overlay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await applyScriptPolicy(page, `script-src 'sha256-${bootstrapHash}'`);
  await navigate(page, previewPath);
  await expect(page.locator('html')).toHaveAttribute('data-loft-loading', '');
  await expect(page.locator('#loader')).toHaveCSS('display', 'flex');
  await expect(page.locator('#loader')).toBeVisible();
  await expect(page.locator('#loader')).toBeHidden({ timeout: 6500 });
  await expect(page.locator('#loader')).toHaveCSS('pointer-events', 'none');
  await expectStaticContent(page, { bootstrapRan: true });
});
