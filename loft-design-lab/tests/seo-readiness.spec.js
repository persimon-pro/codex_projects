const { test, expect } = require('@playwright/test');

test('team posters and video stay off the initial network path and load near the team section', async ({ page, baseURL }) => {
  const posters = [];
  const media = [];
  const errors = [];
  const apiPosts = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/^\/assets\/videos\/team-.+-poster\.jpg$/.test(path)) posters.push(path);
    if (/^\/assets\/videos\/team-.+\.mp4$/.test(path)) media.push(path);
  });
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : get.call(this, type, ...args);
    };
  });
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') && request.method() === 'POST') {
      apiPosts.push(url.pathname);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    }
    if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL).origin) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
    }
    return route.continue();
  });
  await page.goto('/');
  await expect(page.locator('#loader')).toBeHidden();
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-static/);
  await page.evaluate(() => document.fonts.ready);
  test.skip(!await page.evaluate(() => 'loading' in HTMLVideoElement.prototype), 'Older browsers retain the original eager poster fallback.');
  const video = page.locator('#artists .artist-photo video').first();
  await expect(video).toHaveAttribute('loading', 'lazy');
  expect(posters, 'Distant team portraits do not compete with the hero download').toEqual([]);
  expect(media, 'No distant team video starts downloading on entry').toEqual([]);
  await video.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect.poll(() => posters.length).toBeGreaterThan(0);
  await expect.poll(() => media.length).toBeGreaterThan(0);
  await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
  expect(apiPosts).toEqual([]);
});

test('all inner pages and the brief remain usable when language storage is denied', async ({ page, baseURL }) => {
  test.setTimeout(75_000);
  const errors = [];
  const apiPosts = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') && request.method() === 'POST') {
      apiPosts.push(url.pathname);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    }
    if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL).origin) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    window.__deniedLanguageStorage = { reads: 0, writes: 0 };
    Storage.prototype.getItem = function () {
      window.__deniedLanguageStorage.reads += 1;
      throw new DOMException('Storage access denied for this check', 'SecurityError');
    };
    Storage.prototype.setItem = function () {
      window.__deniedLanguageStorage.writes += 1;
      throw new DOMException('Storage access denied for this check', 'SecurityError');
    };
  });

  for (const path of ['/production', '/smm', '/branding', '/web', '/booking-stars', '/order?service=landing-page']) {
    const response = await page.goto(path);
    expect(response.status(), `${path} keeps its working URL`).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.locator('h1 .lang-ru')).toBeVisible();
    await page.evaluate(() => window.setLang('en'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1 .lang-en')).toBeVisible();
    await page.evaluate(() => window.setLang('ru'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    const attempts = await page.evaluate(() => window.__deniedLanguageStorage);
    expect(attempts.reads, `${path} handles a real failing language read`).toBeGreaterThan(0);
    expect(attempts.writes, `${path} handles failing writes without interrupting the interface`).toBeGreaterThanOrEqual(3);
  }

  await expect(page.locator('#srv-site')).toBeChecked();
  await expect(page.locator('#message')).toHaveValue(/Интересует разработка Landing Page/);
  await page.locator('label[for="act-other"]').click();
  await expect(page.locator('#customActivity')).toBeVisible();
  await page.locator('#customActivity').fill('Локальная проверка');
  await expect(page.locator('#customActivity')).toHaveValue('Локальная проверка');
  await expect(page.locator('#submitBtn')).toBeVisible();
  expect(apiPosts, 'The readiness check never submits a lead or chat message').toEqual([]);
  expect(errors, 'Blocked storage never aborts the original page handlers').toEqual([]);
});
