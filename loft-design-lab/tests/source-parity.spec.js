const { test, expect } = require('@playwright/test');
const manifest = require('../migration/source-manifest.json');

const errorsByPage = new WeakMap();
const leadsByPage = new WeakMap();

test.beforeEach(async ({ page, baseURL }) => {
  const errors = [];
  const leads = [];
  errorsByPage.set(page, errors);
  leadsByPage.set(page, leads);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (/^\/api\/(order|chat)$/.test(url.pathname) && request.method() !== 'GET') {
      leads.push(url.pathname);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"reply":"Local test only"}' });
    }
    if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL).origin) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
    }
    return route.continue();
  });
});

test.afterEach(async ({ page }) => {
  expect(errorsByPage.get(page), 'The copied pages have no uncaught browser errors').toEqual([]);
  expect(leadsByPage.get(page), 'Reviewing the copied site never submits a real lead or chat message').toEqual([]);
});

const decode = text => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const normal = text => text.replace(/\s+/g, ' ').trim();
const schemas = html => [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(match => JSON.parse(match[1]));

function tagAttributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(match => [match[1], decode(match[3])]));
}

test('all original routes serve their original SEO and schema with staging indexing protection', async ({ request }) => {
  for (const page of Object.values(manifest.pages)) {
    const response = await request.get(page.route);
    expect(response.status(), `${page.route} keeps its original working URL`).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(response.headers()['x-robots-tag'], `${page.route} remains a private indexing experiment`).toMatch(/noindex.*nofollow/);
    const html = await response.text();
    expect(normal(decode(html.match(/<title>([\s\S]*?)<\/title>/i)[1]))).toBe(page.title);
    const actualMeta = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => tagAttributes(match[0]));
    for (const meta of page.meta) expect(actualMeta).toContainEqual(meta);
    const canonicals = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => tagAttributes(match[0])).filter(attrs => attrs.rel === 'canonical').map(attrs => attrs.href);
    expect(canonicals).toEqual(page.canonical);
    expect(schemas(html)).toEqual(page.schemas);
  }
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain('<loc>https://www.loft.tj/production</loc>');
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['x-robots-tag']).toMatch(/noindex/);
  const redirect = await request.get('/production?source=1', {
    headers: { Host: 'loft.tj' },
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(301);
  expect(redirect.headers().location).toBe('https://www.loft.tj/production?source=1');
  for (const asset of ['/loft-pages.css', '/assets/js/loft-pages.css', '/assets/js/loft-pages.js']) {
    const response = await request.get(asset);
    expect(response.status(), `The complete new-design asset ${asset} is locally available`).toBe(200);
  }
});

async function openPage(page, path) {
  const response = await page.goto(path);
  expect(response.status()).toBe(200);
  await expect(page.locator('#loader')).toBeHidden();
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.evaluate(() => window.setLang('ru'));
}

async function expectReadableLayout(page) {
  const title = page.locator('h1');
  await expect(title).toHaveCount(1);
  await expect(title).toBeVisible();
  expect(await title.evaluate(element => getComputedStyle(element).fontFamily)).toContain('Cormorant');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'The restored full copy fits the viewport').toBeLessThanOrEqual(1);
  const bounds = await title.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewport: innerWidth };
  });
  expect(bounds.left, 'The complete original heading is not clipped at the left edge').toBeGreaterThanOrEqual(-1);
  expect(bounds.right, 'The complete original heading is not clipped at the right edge').toBeLessThanOrEqual(bounds.viewport + 1);
}

test('all seven pages keep readable full copy in the new design', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  for (const [name, path] of [['home', '/'], ['production', '/production'], ['smm', '/smm'], ['branding', '/branding'], ['web', '/web'], ['booking', '/booking-stars'], ['order', '/order']]) {
    await openPage(page, path);
    await expectReadableLayout(page);
    if (name !== 'home') {
      await expect(page.locator('body')).toHaveClass(/cinema-inner/);
      await expect(page.locator('canvas')).toHaveCount(0);
    }
    await page.screenshot({ path: testInfo.outputPath(`source-copy-${name}.png`), fullPage: false });
    await page.evaluate(() => window.setLang('en'));
    await expectReadableLayout(page);
  }
});

test('the original artist booking link still preselects the original order form without submitting it', async ({ page }) => {
  await openPage(page, '/booking-stars');
  const booking = page.locator('a.roster-book-btn[href*="artist="]').first();
  const href = await booking.getAttribute('href');
  const expectedArtist = new URL(href, 'http://local.test').searchParams.get('artist');
  await booking.click();
  await expect(page).toHaveURL(/\/order\?service=booking&artist=/);
  await expect(page.locator('#loader')).toBeHidden();
  await expect(page.locator('#srv-event')).toBeChecked();
  await expect.poll(() => page.locator('#message').inputValue()).toContain(expectedArtist);
  await page.locator('#firstName').fill('Review');
  await page.locator('#phone').fill('+992900000000');
  await page.locator('label[for="act-other"]').click();
  await expect(page.locator('#customActivity')).toBeVisible();
  await page.locator('#customActivity').fill('Local review');
  await expect(page.locator('#submitBtn')).toBeEnabled();
});
