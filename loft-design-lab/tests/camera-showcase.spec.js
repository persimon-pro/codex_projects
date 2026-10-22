const { test, expect } = require('@playwright/test');

const failures = new WeakMap();

test.beforeEach(async ({ page, baseURL }) => {
  const errors = [];
  failures.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/order') {
      errors.push('The camera showcase must never submit an order.');
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    }
    if (url.origin !== new URL(baseURL).origin) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
    }
    return route.continue();
  });
});

test.afterEach(async ({ page }) => {
  expect(failures.get(page), 'The added scene has no uncaught errors or submitted leads').toEqual([]);
});

async function installCameraDrawCounter(page) {
  await page.addInitScript(() => {
    window.__cameraDraws = 0;
    for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!Context) continue;
      for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const original = Context.prototype[method];
        if (!original) continue;
        Context.prototype[method] = function (...args) {
          if (this.canvas.closest('.camera-showcase-art')) window.__cameraDraws += 1;
          return original.apply(this, args);
        };
      }
    }
  });
}

async function afterFrames(page) {
  return page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.__cameraDraws;
  });
}

async function openHome(page) {
  const response = await page.goto('/');
  expect(response.status()).toBe(200);
  await expect(page.locator('#loader')).toBeHidden();
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

async function centerShowcase(page) {
  await page.evaluate(() => {
    const section = document.querySelector('#camera-showcase');
    scrollTo({ top: section.getBoundingClientRect().top + scrollY + section.offsetHeight / 2 - innerHeight / 2, behavior: 'instant' });
  });
}

test('a separate camera scene preserves all three hero artworks and renders a reduced-motion still', async ({ page }, testInfo) => {
  await installCameraDrawCounter(page);
  await openHome(page);
  const section = page.locator('#camera-showcase');
  await expect(section).toHaveCount(1);
  await expect(section.locator('canvas')).toHaveCount(0);
  await expect(section.locator('button, a, p, small')).toHaveCount(0);
  await expect(page.locator('button[data-chapter]')).toHaveCount(3);
  for (const [index, name] of ['obsidian', 'aurea', 'alba'].entries()) {
    await page.locator(`button[data-chapter="${index}"]`).click();
    await expect(page.locator('.cinema-fallback')).toHaveAttribute('src', new RegExp(`/assets/images/cinema/${name}\\.webp$`));
    await expect(page.locator(`.cinema-copy[data-cinema-copy="${index}"]`)).toBeVisible();
  }
  expect(await page.evaluate(() => {
    const section = document.querySelector('#camera-showcase');
    return Boolean(document.querySelector('#about').compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING)
      && Boolean(section.compareDocumentPosition(document.querySelector('#work')) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), 'The camera is added between existing sections').toBe(true);
  await centerShowcase(page);
  await expect(page.locator('.camera-showcase-art')).toHaveClass(/is-ready/);
  const canvas = section.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(section.locator('.camera-showcase-title')).toBeVisible();
  const graphics = await canvas.evaluate(element => {
    const gl = element.getContext('webgl2') || element.getContext('webgl');
    return gl && { width: gl.drawingBufferWidth, lost: gl.isContextLost() };
  });
  expect(graphics).toBeTruthy();
  expect(graphics.width).toBeGreaterThan(100);
  expect(graphics.lost).toBe(false);
  const hideTitle = await page.addStyleTag({ content: '.camera-showcase-title { visibility:hidden!important; }' });
  const png = await canvas.screenshot({ path: testInfo.outputPath('camera-showcase.png'), animations: 'disabled' });
  await hideTitle.evaluate(element => element.remove());
  const contrast = await page.evaluate(async base64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const sample = document.createElement('canvas');
    sample.width = sample.height = 48;
    const context = sample.getContext('2d');
    context.drawImage(image, 0, 0, 48, 48);
    const rgb = Array.from(context.getImageData(0, 0, 48, 48).data).filter((_, index) => index % 4 !== 3);
    return Math.max(...rgb) - Math.min(...rgb);
  }, png.toString('base64'));
  expect(contrast, 'Actual GPU pixels contain the illuminated camera geometry').toBeGreaterThan(40);
  const draws = await afterFrames(page);
  expect(draws).toBeGreaterThan(0);
  expect(await afterFrames(page), 'Reduced motion renders a still without an ambient draw loop').toBe(draws);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('camera rotation pauses with Space and stops drawing while the section is offscreen', async ({ page }) => {
  await installCameraDrawCounter(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openHome(page);
  await centerShowcase(page);
  const section = page.locator('#camera-showcase');
  await expect(page.locator('.camera-showcase-art')).toHaveClass(/is-ready/);
  const initial = await afterFrames(page);
  await expect.poll(() => afterFrames(page)).toBeGreaterThan(initial);
  await section.focus();
  await page.keyboard.press('Space');
  await expect(section).toHaveAttribute('data-paused', 'true');
  const paused = await afterFrames(page);
  expect(await afterFrames(page), 'Keyboard pause stops camera GPU work').toBe(paused);
  await page.keyboard.press('Space');
  await expect(section).toHaveAttribute('data-paused', 'false');
  await expect.poll(() => afterFrames(page)).toBeGreaterThan(paused);
  await page.evaluate(() => document.querySelector('#contact').scrollIntoView({ behavior: 'instant' }));
  await expect.poll(() => section.evaluate(element => element.getBoundingClientRect().bottom < 0)).toBe(true);
  const hidden = await afterFrames(page);
  expect(await afterFrames(page), 'An offscreen camera does not keep drawing').toBe(hidden);
  await centerShowcase(page);
  await expect.poll(() => afterFrames(page)).toBeGreaterThan(hidden);
});

test('without WebGL the added camera keeps its static artwork and the original hero remains navigable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : original.call(this, type, ...args);
    };
  });
  await openHome(page);
  await centerShowcase(page);
  const section = page.locator('#camera-showcase');
  await expect(section.locator('.camera-showcase-art')).toHaveClass(/is-static/);
  await expect(section.locator('canvas')).toHaveCount(0);
  const fallback = section.locator('.camera-showcase-fallback');
  await expect(fallback).toBeVisible();
  await expect.poll(() => fallback.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(section.locator('.camera-showcase-title')).toBeVisible();
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.locator('button[data-chapter="1"]').click();
  await expect(page.locator('.cinema-fallback')).toHaveAttribute('src', /\/assets\/images\/cinema\/aurea\.webp$/);
  await expect(page.locator('.cinema-copy[data-cinema-copy="1"]')).toBeVisible();
});
