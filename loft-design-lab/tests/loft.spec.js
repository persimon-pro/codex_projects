const { test, expect } = require('@playwright/test');

const runtimeErrors = new WeakMap();
const attemptedOrders = new WeakMap();

test.beforeEach(async ({ page, baseURL }) => {
  const errors = [];
  const orders = [];
  runtimeErrors.set(page, errors);
  attemptedOrders.set(page, orders);
  page.on('pageerror', error => errors.push(error.message));

  // Keep all UI checks local and prevent accidental Telegram delivery.
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/order') {
      orders.push(request.method());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Intercepted test request' }),
      });
    }
    if (url.origin !== new URL(baseURL).origin) {
      // The modal src remains testable without loading YouTube or remote media.
      return route.fulfill({ status: 200, contentType: 'text/html', body: '' });
    }
    return route.continue();
  });
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page), 'No uncaught browser JavaScript errors').toEqual([]);
  expect(attemptedOrders.get(page), 'UI checks never submit an order').toEqual([]);
});

async function openHome(page, pathname = '/') {
  const response = await page.goto(pathname);
  expect(response.status()).toBe(200);
  await expect(page.locator('#loader')).toHaveClass(/hidden/);
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

async function selectLanguage(page, lang) {
  const desktopButton = page.locator(`#btn-${lang}`);
  if (await desktopButton.isVisible()) {
    await desktopButton.click();
  } else {
    if (!(await page.locator('#mobileMenu').evaluate(el => el.classList.contains('active')))) {
      await page.locator('#burger').click();
    }
    await page.locator(`#btn-${lang}-mob`).click();
    await page.locator('#burger').click();
  }
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

async function expectWebGL(canvas) {
  await expect(canvas).toBeVisible();
  const graphics = await canvas.evaluate(element => {
    const gl = element.getContext('webgl2') || element.getContext('webgl');
    return gl && {
      version: gl.getParameter(gl.VERSION),
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      lost: gl.isContextLost(),
    };
  });
  expect(graphics).toBeTruthy();
  expect(graphics.version).toContain('WebGL');
  expect(graphics.width).toBeGreaterThan(100);
  expect(graphics.height).toBeGreaterThan(100);
  expect(graphics.lost).toBe(false);
}

async function scrollStory(page, progress) {
  await page.evaluate(value => {
    const story = document.querySelector('.cinema-story');
    const top = story.getBoundingClientRect().top + window.scrollY;
    const range = Math.max(1, story.offsetHeight - window.innerHeight);
    window.scrollTo({ top: top + range * value, behavior: 'instant' });
  }, progress);
  await expect.poll(async () => Number(await page.locator('.cinema-stage').getAttribute('data-progress'))).toBeCloseTo(progress, 2);
}

async function countAfterFrames(page) {
  return page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.__loftDrawCalls;
  });
}

async function installDrawCounter(page) {
  await page.addInitScript(() => {
    window.__loftDrawCalls = 0;
    for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!Context) continue;
      for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const original = Context.prototype[method];
        if (!original) continue;
        Context.prototype[method] = function (...args) {
          window.__loftDrawCalls += 1;
          return original.apply(this, args);
        };
      }
    }
  });
}

async function artworkPixels(page, path) {
  // Hide the DOM typography only for this capture: changes to copy or counters
  // cannot make a frozen shader look like three different generated artworks.
  const hiddenUi = await page.addStyleTag({ content: 'body * { visibility:hidden!important; } canvas.loft-morph-canvas { visibility:visible!important; }' });
  try {
    const png = await page.locator('canvas.loft-morph-canvas').screenshot({ path, animations: 'disabled' });
    return await page.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const sample = document.createElement('canvas');
      sample.width = sample.height = 48;
      const context = sample.getContext('2d');
      context.drawImage(image, 0, 0, 48, 48);
      return Array.from(context.getImageData(0, 0, 48, 48).data).filter((_, index) => index % 4 !== 3);
    }, png.toString('base64'));
  } finally {
    await hiddenUi.evaluate(element => element.remove());
  }
}

test('cinematic home renders the LOFT identity and real WebGL without horizontal overflow', async ({ page }, testInfo) => {
  await openHome(page);
  await expect(page.locator('.cinema-story h1')).toBeVisible();
  await expect(page.locator('.nav-logo img')).toBeVisible();
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-ready/);
  await expectWebGL(page.locator('canvas.loft-morph-canvas'));
  await expect(page.locator('.cinema-copy:not([hidden])')).toHaveCount(1);
  await expect(page.locator('[data-cinema-copy="0"] .cinema-cta')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('loft-cinema-home.png'), fullPage: false });
});

test('scrolling keeps the cinematic stage pinned and renders three different artworks', async ({ page }, testInfo) => {
  await openHome(page);
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-ready/);
  const artworks = [];
  for (const [index, progress] of [0, 0.5, 0.96].entries()) {
    await scrollStory(page, progress);
    await expect(page.locator('.cinema-stage')).toHaveAttribute('data-current-chapter', String(index));
    await expect(page.locator(`.cinema-copy[data-cinema-copy="${index}"]`)).toBeVisible();
    const position = await page.locator('.cinema-stage').boundingBox();
    expect(Math.abs(position.y), 'The stage stays pinned to the viewport').toBeLessThanOrEqual(2);
    expect(position.height).toBeCloseTo(page.viewportSize().height, 0);
    const barProgress = await page.locator('.cinema-progress-fill').evaluate(element => element.getBoundingClientRect().width / element.parentElement.getBoundingClientRect().width);
    expect(barProgress).toBeCloseTo(progress, 2);
    artworks.push(await artworkPixels(page, testInfo.outputPath(`cinema-art-${index + 1}.png`)));
  }
  for (const [left, right] of [[0, 1], [1, 2], [0, 2]]) {
    const difference = artworks[left].reduce((sum, channel, index) => sum + Math.abs(channel - artworks[right][index]), 0) / artworks[left].length;
    expect(difference, `Actual image pixels differ between chapters ${left + 1} and ${right + 1}`).toBeGreaterThan(3);
  }
});

test('chapter controls move the story and pause preserves manual navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openHome(page);
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-ready/);
  const pause = page.locator('#cinemaPause');
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  const chapters = page.locator('button[data-chapter]');
  await expect(chapters).toHaveCount(3);
  for (const index of [1, 2, 0]) {
    await chapters.nth(index).click();
    await expect(chapters.nth(index)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('button[data-chapter][aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('.cinema-stage')).toHaveAttribute('data-current-chapter', String(index));
    await expect.poll(async () => Number(await page.locator('.cinema-stage').getAttribute('data-progress'))).toBeCloseTo(index / 2, 2);
    const scrollProgress = await page.locator('.cinema-story').evaluate(story => (window.scrollY - (story.getBoundingClientRect().top + window.scrollY)) / (story.offsetHeight - window.innerHeight));
    expect(scrollProgress).toBeCloseTo(index / 2, 2);
  }
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
});

test('reduced motion stops continuous rendering while chapter navigation still updates artwork', async ({ page }) => {
  await installDrawCounter(page);
  await openHome(page);
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-ready/);
  const stillFrame = await countAfterFrames(page);
  expect(stillFrame, 'WebGL actually drew the still scene').toBeGreaterThan(0);
  expect(await countAfterFrames(page), 'Reduced motion stops continuous rendering').toBe(stillFrame);
  await page.locator('button[data-chapter="2"]').click();
  await expect(page.locator('button[data-chapter="2"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await countAfterFrames(page), 'Changing chapter renders a new still frame').toBeGreaterThan(stillFrame);
  await expect(page.locator('[data-cinema-copy="2"] .cinema-cta[href="/order"]')).toBeVisible();
});

test('without WebGL static artwork, chapters, and the order journey remain usable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : original.call(this, type, ...args);
    };
  });
  await openHome(page);
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-static/);
  await expect(page.locator('canvas.loft-morph-canvas')).toHaveCount(0);
  const fallback = page.locator('.cinema-fallback');
  await expect(fallback).toBeVisible();
  expect(await fallback.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.locator('button[data-chapter="2"]').click();
  await expect(fallback).toHaveAttribute('src', /alba\.webp$/);
  await expect(page.locator('.cinema-stage')).toHaveAttribute('data-current-chapter', '2');
  await page.locator('[data-cinema-copy="2"] .cinema-cta').click();
  await expect(page).toHaveURL(/\/order$/);
  await expect(page.locator('#orderForm')).toBeVisible();
});

test('archived sculpture keeps its original WebGL scene and form controls', async ({ page }) => {
  await openHome(page, '/sculpture');
  await expect(page.locator('.hero h1')).toBeVisible();
  await expect(page.locator('.loft-stage')).toHaveClass(/is-ready/);
  await expectWebGL(page.locator('.loft-stage canvas'));
  await page.locator('[data-loft-form]').nth(2).click();
  await expect(page.locator('[data-loft-form]').nth(2)).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#loftScenePause').click();
  await expect(page.locator('#loftScenePause')).toHaveAttribute('aria-pressed', 'true');
});

test('Russian and English persist across reloads and order navigation', async ({ page }) => {
  await openHome(page);
  await selectLanguage(page, 'ru');
  await expect(page.locator('.hero-title .lang-ru')).toBeVisible();
  await expect(page.locator('.hero-title .lang-en')).toBeHidden();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page.goto('/order');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('#message')).toHaveAttribute('placeholder', /Опишите/);
  await page.goto('/');
  await expect(page.locator('#loader')).toHaveClass(/hidden/);
  await selectLanguage(page, 'en');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.hero-title .lang-en')).toBeVisible();
});

test('pricing and portfolio selections stay independent', async ({ page }) => {
  await openHome(page);
  const webFilter = page.locator('#work button[onclick="filterWorks(\'web\')"]');
  const brandingPrice = page.locator('#pricing button[onclick="switchPriceTab(\'branding\')"]');
  await webFilter.click();
  await expect(webFilter).toHaveClass(/active/);
  const digitalCards = page.locator('.portfolio-card[data-category="web"]');
  expect(await digitalCards.count()).toBeGreaterThan(0);
  for (const card of await digitalCards.all()) await expect(card).not.toHaveClass(/is-hidden/);
  for (const card of await page.locator('.portfolio-card:not([data-category="web"])').all()) {
    await expect(card).toHaveClass(/is-hidden/);
  }
  await brandingPrice.click();
  await expect(brandingPrice).toHaveClass(/active/);
  await expect(page.locator('#pane-branding')).toHaveClass(/active/);
  await expect(page.locator('#pane-smm')).not.toHaveClass(/active/);
  await expect(webFilter).toHaveClass(/active/);
  await page.locator('#work button[onclick="filterWorks(\'all\')"]').click();
  await expect(page.locator('.portfolio-card.is-hidden')).toHaveCount(0);
  await expect(brandingPrice).toHaveClass(/active/);
});

test('portfolio video modal sets its source and closes cleanly on Escape', async ({ page }) => {
  await openHome(page);
  await page.locator('.portfolio-card[data-category="video"] .portfolio-thumb-wrapper').first().click();
  await expect(page.locator('#videoModal')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#videoModalIframe')).toHaveAttribute('src', /^https:\/\/www\.youtube\.com\/embed\/.+autoplay=1/);
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await page.keyboard.press('Escape');
  await expect(page.locator('#videoModal')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#videoModalIframe')).toHaveAttribute('src', '');
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('navigation opens the work section and restores document scrolling', async ({ page }) => {
  await openHome(page);
  if (await page.locator('#burger').isVisible()) {
    await page.locator('#burger').click();
    await expect(page.locator('#mobileMenu')).toHaveClass(/active/);
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await page.locator('#mobileMenu a[href="#work"]').click();
    await expect(page.locator('#mobileMenu')).not.toHaveClass(/active/);
  } else {
    await page.locator('.nav-links a[href="#work"]').click();
  }
  await expect(page).toHaveURL(/#work$/);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.locator('#work .section-title')).toBeInViewport();
});

test('service clean URLs return their own pages', async ({ page, request }) => {
  await openHome(page);
  for (const pathname of ['/booking-stars', '/production', '/smm', '/branding', '/web']) {
    await expect(page.locator(`footer a[href="${pathname}"]`).first()).toHaveAttribute('href', pathname);
    const response = await request.get(pathname);
    expect(response.status(), pathname).toBe(200);
    expect(response.headers()['content-type'], pathname).toContain('text/html');
    const html = await response.text();
    expect(response.headers()['x-robots-tag'], pathname).toBe('noindex, nofollow');
    expect(html, pathname).toMatch(/<meta name="robots" content="index, follow[^\"]*">/);
    expect(html, pathname).toContain(`<link rel="canonical" href="https://www.loft.tj${pathname}">`);
  }
});

test('package and service order links prefill the brief while preserving required fields', async ({ page }) => {
  await page.goto('/order?package=smm-light');
  await expect(page.locator('#srv-smm')).toBeChecked();
  await expect(page.locator('#message')).toHaveValue(/SMM LIGHT/i);
  await page.locator('#submitBtn').click();
  expect(await page.locator('#firstName').evaluate(input => input.validity.valueMissing)).toBe(true);
  await expect(page.locator('#successOverlay')).not.toHaveClass(/active/);
  await page.goto('/order?service=landing-page');
  await expect(page.locator('#srv-site')).toBeChecked();
  await expect(page.locator('#message')).toHaveValue(/Landing Page/);
});

test('AI assistant uses the local fallback, resets, and closes without sending a lead', async ({ page }) => {
  await openHome(page);
  await page.locator('#loftAiFloatTrigger').click();
  await expect(page.locator('#loftAiWindow')).toHaveClass(/active/);
  await expect(page.locator('#loftAiMessages .loft-ai-msg.bot')).toHaveCount(1);
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/chat') && response.request().method() === 'POST');
  await page.locator('#loftAiUserInput').fill('Какие услуги видеопродакшна вы предлагаете?');
  await page.locator('#loftAiSubmitBtn').click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const reply = await response.json();
  expect(reply.success).toBe(true);
  expect(typeof reply.reply).toBe('string');
  expect(reply.reply.length).toBeGreaterThan(20);
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    expect(reply.provider).toBe('internal-fallback');
  }
  await expect(page.locator('#loftAiMessages .loft-ai-msg.bot')).toHaveCount(2);
  await expect(page.locator('#loftAiTypingIndicator')).toHaveCount(0);
  await page.locator('button[onclick="resetLoftAiChat()"]').click();
  await expect(page.locator('#loftAiMessages .loft-ai-msg')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#loftAiWindow')).not.toHaveClass(/active/);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('backend rejects incomplete requests before any external delivery', async ({ request }) => {
  const order = await request.post('/api/order', { data: {} });
  expect(order.status()).toBe(400);
  expect((await order.json()).success).toBe(false);
  const chat = await request.post('/api/chat', { data: { messages: [] } });
  expect(chat.status()).toBe(400);
  expect((await chat.json()).success).toBe(false);
});
