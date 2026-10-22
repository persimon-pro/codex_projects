const { test, expect } = require('@playwright/test');

// The WebGL suite covers actual pixels separately. These interaction checks
// also exercise the animated interface when the browser uses its static image.
test.beforeEach(async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (/^webgl/.test(type)) return null;
      return getContext.call(this, type, ...args);
    };
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/order') return route.fulfill({ status: 200, body: '{"success":true}' });
    if (url.origin !== new URL(baseURL).origin) {
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#38382c"/></svg>' });
    }
    return route.continue();
  });
});

async function openAnimated(page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('#loader')).toBeHidden();
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-static/);
  await expect(page.locator('.cinema-story h1')).toHaveCSS('opacity', '1');
}

const translation = element => {
  const transform = getComputedStyle(element).transform;
  const matrix = transform === 'none' ? new DOMMatrix() : new DOMMatrix(transform);
  return { x: matrix.m41, y: matrix.m42 };
};

test('desktop pointer adds depth to the persistent heading and returns it to rest', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Touch has no hover effects.');
  await openAnimated(page);
  const stage = page.locator('.cinema-stage');
  await page.mouse.move(1250, 350);
  await expect.poll(() => stage.evaluate(element => parseFloat(element.style.getPropertyValue('--cinema-copy-x')) || 0)).toBeGreaterThan(3);
  await expect.poll(async () => (await page.locator('[data-cinema-copy="0"]').evaluate(translation)).x).toBeGreaterThan(2);

  await page.locator('.nav-logo').hover();
  await expect.poll(() => stage.evaluate(element => element.style.getPropertyValue('--cinema-copy-x'))).toBe('');
  await expect.poll(async () => Math.abs((await page.locator('[data-cinema-copy="0"]').evaluate(translation)).x)).toBeLessThan(.1);
  await expect(page.locator('.cinema-story button, .cinema-story a')).toHaveCount(0);
});

test('reduced motion clears pointer depth and scroll effects without hiding content or restoring small labels', async ({ page }) => {
  await openAnimated(page);
  await expect(page.locator('.cinema-media-depth')).toHaveCount(11);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).not.toHaveClass(/\blenis\b/);
  await expect(page.locator('.cinema-media-depth')).toHaveCount(0);
  await page.mouse.move(350, 350);
  expect(await page.locator('.cinema-stage').evaluate(element => element.style.getPropertyValue('--cinema-copy-x'))).toBe('');
  await page.evaluate(() => {
    const story = document.querySelector('.cinema-story');
    scrollTo({ top: story.getBoundingClientRect().top + scrollY + (story.offsetHeight - innerHeight) * 2 / 3, behavior: 'instant' });
  });
  await expect(page.locator('.cinema-stage')).toHaveAttribute('data-current-form', 'laptop');
  await expect(page.locator('[data-cinema-copy="0"] .cinema-title')).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-cinema-copy="0"] .cinema-title')).toHaveCSS('clip-path', 'none');
  await expect(page.locator('.cinema-copy')).toHaveCount(1);
  const heroText = await page.locator('.cinema-story').innerText();
  expect(heroText).not.toMatch(/INDEPENDENT CREATIVE HOUSE|ИЗ ВООБРАЖЕНИЯ|OBSIDIAN|AUREA|ALBA/);
  await expect(page.locator('.cinema-story button, .cinema-story a, .cinema-story p, .cinema-story small')).toHaveCount(0);
  await page.evaluate(() => document.getElementById('work').scrollIntoView({ behavior: 'instant' }));
  await expect(page.locator('#work .section-title')).toBeVisible();
  await expect(page.locator('#work .section-title')).toHaveCSS('clip-path', 'none');
  await expect(page.locator('.portfolio-card').first()).toBeVisible();
});

test('portfolio media moves with scrolling and filters rebuild its layers without concealed cards', async ({ page }) => {
  await openAnimated(page);
  const card = page.locator('.portfolio-card').first();
  const thumb = card.locator('.portfolio-thumb-wrapper');
  await page.evaluate(() => {
    const card = document.querySelector('.portfolio-card');
    scrollTo({ top: scrollY + card.getBoundingClientRect().top - innerHeight * .3, behavior: 'instant' });
  });
  await expect(card).toHaveClass(/visible/);
  await expect(thumb).toHaveCSS('clip-path', 'none');
  const layer = card.locator('.cinema-media-depth');
  const before = (await layer.evaluate(translation)).y;
  await page.evaluate(() => scrollBy({ top: 180, behavior: 'instant' }));
  await expect.poll(async () => Math.abs((await layer.evaluate(translation)).y - before)).toBeGreaterThan(.5);

  await page.locator('.work-tabs-wrapper button[onclick="filterWorks(\'ai\')"]').click();
  await expect(page.locator('.portfolio-card:not(.is-hidden)')).toHaveCount(3);
  await expect(page.locator('.cinema-media-depth')).toHaveCount(3);
  await expect(page.locator('.portfolio-card:not(.is-hidden)').first().locator('.portfolio-thumb-wrapper')).toHaveCSS('clip-path', 'none');
  await page.locator('.work-tabs-wrapper button[onclick="filterWorks(\'all\')"]').click();
  await expect(page.locator('.cinema-media-depth')).toHaveCount(11);
  await expect(page.locator('.cinema-media-depth .cinema-media-depth')).toHaveCount(0);
  await expect(page.locator('.portfolio-card').first()).toBeVisible();
});
