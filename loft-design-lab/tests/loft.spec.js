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
  // Isolate the actual rendered object: copy and fallback changes cannot make a
  // frozen or missing WebGL scene look like four different device forms.
  const hiddenUi = await page.addStyleTag({ content: 'body * { visibility:hidden!important; } .cinema-visual canvas { visibility:visible!important; }' });
  try {
    const png = await page.locator('.cinema-visual canvas').screenshot({ path, animations: 'disabled' });
    return await page.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const sample = document.createElement('canvas');
      sample.width = sample.height = 48;
      const context = sample.getContext('2d');
      // Sample the central device area so empty space and outer orbits cannot
      // dilute the difference between the four actual device silhouettes.
      context.drawImage(image, image.naturalWidth * .17, image.naturalHeight * .17,
        image.naturalWidth * .66, image.naturalHeight * .66, 0, 0, 48, 48);
      return Array.from(context.getImageData(0, 0, 48, 48).data).filter((_, index) => index % 4 !== 3);
    }, png.toString('base64'));
  } finally {
    await hiddenUi.evaluate(element => element.remove());
  }
}

test('cinematic home renders the LOFT identity and real WebGL without horizontal overflow', async ({ page }, testInfo) => {
  await openHome(page);
  await expect(page.locator('.cinema-story')).toHaveClass(/cinema-objects/);
  await expect(page.locator('.cinema-story h1')).toBeVisible();
  await expect(page.locator('.cinema-story h1')).toHaveCount(1);
  await expect(page.locator('.nav-logo img')).toBeVisible();
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-ready/);
  await expectWebGL(page.locator('.cinema-visual canvas'));
  await expect(page.locator('.cinema-copy')).toHaveCount(1);
  await expect(page.locator('[data-cinema-copy="0"]')).toBeVisible();
  await expect(page.locator('.cinema-story button, .cinema-story a, .cinema-story p, .cinema-story small')).toHaveCount(0);
  await expect(page.locator('.cinema-chapters, .cinema-count, .cinema-progress, .cinema-marquee, #cinemaPause')).toHaveCount(0);
  await expect(page.locator('body')).toHaveClass(/cinema-hero-active/);
  await expect(page.locator('#loftAiFloatTrigger')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('loft-cinema-home.png'), fullPage: false });
});

test('scrolling pins the stage and renders four distinct device forms under one persistent heading', async ({ page }, testInfo) => {
  await openHome(page);
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-ready/);
  const artworks = [];
  const forms = ['camera', 'microphone', 'laptop', 'instagram'];
  for (const [index, form] of forms.entries()) {
    const progress = index / 3;
    await scrollStory(page, progress);
    await expect(page.locator('.cinema-stage')).toHaveAttribute('data-current-form', form);
    await expect(page.locator('.cinema-story h1')).toBeVisible();
    await expect(page.locator('.cinema-story h1')).toHaveCSS('opacity', '1');
    await expect(page.locator('.cinema-copy')).toHaveCount(1);
    const position = await page.locator('.cinema-stage').boundingBox();
    expect(Math.abs(position.y), 'The stage stays pinned to the viewport').toBeLessThanOrEqual(2);
    expect(position.height).toBeCloseTo(page.viewportSize().height, 0);
    const pixels = await artworkPixels(page, testInfo.outputPath(`cinema-${form}.png`));
    expect(Math.max(...pixels) - Math.min(...pixels), `${form} has visible rendered geometry`).toBeGreaterThan(40);
    artworks.push(pixels);
  }
  for (let left = 0; left < forms.length; left += 1) {
    for (let right = left + 1; right < forms.length; right += 1) {
      const difference = artworks[left].reduce((sum, channel, index) => sum + Math.abs(channel - artworks[right][index]), 0) / artworks[left].length;
      expect(difference, `Actual image pixels differ between ${forms[left]} and ${forms[right]}`).toBeGreaterThan(3);
    }
  }
});

test('automatic morphing keeps the document still and keyboard pause freezes rendering before manual scrolling', async ({ page }) => {
  await installDrawCounter(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openHome(page);
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-ready/);
  const stage = page.locator('.cinema-stage');
  const start = Number(await stage.getAttribute('data-progress'));
  await expect.poll(async () => Number(await stage.getAttribute('data-progress'))).toBeGreaterThan(start + .01);
  expect(await page.evaluate(() => scrollY), 'Autoplay transforms the object without scrolling the document').toBe(0);
  await page.locator('.cinema-story').focus();
  await page.keyboard.press('Space');
  await expect(stage).toHaveAttribute('data-paused', 'true');
  const heldProgress = Number(await stage.getAttribute('data-progress'));
  const heldDraws = await countAfterFrames(page);
  expect(heldDraws, 'The renderer drew before it was paused').toBeGreaterThan(0);
  expect(await countAfterFrames(page), 'Keyboard pause stops continuous rendering').toBe(heldDraws);
  expect(Number(await stage.getAttribute('data-progress')), 'Keyboard pause also freezes automatic transformation').toBe(heldProgress);
  await scrollStory(page, 2 / 3);
  await expect(stage).toHaveAttribute('data-current-form', 'laptop');
  expect(await countAfterFrames(page), 'Manual scrolling can update a paused still scene').toBeGreaterThan(heldDraws);
  await page.keyboard.press('Space');
  await expect(stage).toHaveAttribute('data-paused', 'false');
  const controlledProgress = Number(await stage.getAttribute('data-progress'));
  await countAfterFrames(page);
  expect(Number(await stage.getAttribute('data-progress')), 'Scrolling retains control after pause is released').toBe(controlledProgress);
});

test('ambient rotation keeps a held camera moving and respects runtime reduced motion', async ({ page }) => {
  await installDrawCounter(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openHome(page, '/#main-content');
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-ready/);
  await scrollStory(page, .02);
  const initialDraws = await countAfterFrames(page);
  await expect.poll(() => countAfterFrames(page), { message: 'The camera and its orbits keep rendering while the morphology is held' }).toBeGreaterThan(initialDraws);
  expect(Number(await page.locator('.cinema-stage').getAttribute('data-progress')), 'Ambient rotation does not advance the scroll-controlled morph').toBeCloseTo(.02, 2);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const stillDraws = await countAfterFrames(page);
  expect(await countAfterFrames(page), 'Enabling reduced motion stops the ambient renderer').toBe(stillDraws);
  expect(Number(await page.locator('.cinema-stage').getAttribute('data-progress')), 'Changing motion preferences preserves morphology progress').toBeCloseTo(.02, 2);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const resumedDraws = await countAfterFrames(page);
  await expect.poll(() => countAfterFrames(page), { message: 'The orbital scene resumes when reduced motion is disabled' }).toBeGreaterThan(resumedDraws);
  await scrollStory(page, .16);
  expect(await countAfterFrames(page), 'Scrolling still renders the actual transformation').toBeGreaterThan(resumedDraws);
});

test('ambient rendering stops below the hero and resumes when the scene returns', async ({ page }) => {
  await installDrawCounter(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openHome(page, '/#main-content');
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-ready/);
  await page.evaluate(() => document.querySelector('#work').scrollIntoView({ behavior: 'instant' }));
  await expect(page.locator('body')).not.toHaveClass(/cinema-hero-active/);
  const hiddenDraws = await countAfterFrames(page);
  expect(await countAfterFrames(page), 'An offscreen orbital scene does not keep drawing').toBe(hiddenDraws);

  await scrollStory(page, .02);
  await expect(page.locator('body')).toHaveClass(/cinema-hero-active/);
  const returnedDraws = await countAfterFrames(page);
  await expect.poll(() => countAfterFrames(page), { message: 'The visible orbital scene resumes drawing' }).toBeGreaterThan(returnedDraws);
});

test('reduced motion stops continuous rendering while native scrolling updates all four still forms', async ({ page }) => {
  await installDrawCounter(page);
  await openHome(page);
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-ready/);
  const stillFrame = await countAfterFrames(page);
  expect(stillFrame, 'WebGL actually drew the still scene').toBeGreaterThan(0);
  expect(await countAfterFrames(page), 'Reduced motion stops continuous rendering').toBe(stillFrame);
  let previousFrame = stillFrame;
  for (const [index, form] of ['microphone', 'laptop', 'instagram'].entries()) {
    await scrollStory(page, (index + 1) / 3);
    await expect(page.locator('.cinema-stage')).toHaveAttribute('data-current-form', form);
    const rendered = await countAfterFrames(page);
    expect(rendered, `Scrolling renders the ${form} still frame`).toBeGreaterThan(previousFrame);
    expect(await countAfterFrames(page), `${form} does not keep rendering under reduced motion`).toBe(rendered);
    await expect(page.locator('.cinema-story h1')).toBeVisible();
    previousFrame = rendered;
  }
});

test('without WebGL four static device forms and the header order journey remain usable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : original.call(this, type, ...args);
    };
  });
  await openHome(page);
  await expect(page.locator('.cinema-visual')).toHaveClass(/is-static/);
  await expect(page.locator('.cinema-visual canvas')).toHaveCount(0);
  const fallback = page.locator('.cinema-fallback');
  await expect(fallback).toBeVisible();
  for (const [index, form] of ['camera', 'microphone', 'laptop', 'instagram'].entries()) {
    await scrollStory(page, index / 3);
    await expect(fallback).toHaveAttribute('src', new RegExp(`/assets/images/cinema/${form}\\.svg$`));
    await expect.poll(() => fallback.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.cinema-stage')).toHaveAttribute('data-current-form', form);
    await expect(page.locator('.cinema-story h1')).toBeVisible();
  }
  // The uncluttered hero leaves order navigation in the existing site header.
  if (await page.locator('#burger').isVisible()) {
    await page.locator('#burger').click();
    await page.locator('#mobileMenu a[href="/order"]').click();
  } else {
    await page.locator('nav a[href="/order"]').first().click();
  }
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
    expect(html, pathname).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html, pathname).not.toMatch(/<link\b[^>]*\brel=["']canonical["']/i);
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
  await expect(page.locator('#loftAiFloatTrigger')).toBeHidden();
  await page.evaluate(() => document.getElementById('work').scrollIntoView({ behavior: 'instant' }));
  await expect(page.locator('body')).not.toHaveClass(/cinema-hero-active/);
  await expect(page.locator('#loftAiFloatTrigger')).toBeVisible();
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
