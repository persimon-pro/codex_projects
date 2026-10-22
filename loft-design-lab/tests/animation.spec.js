const { test, expect } = require('@playwright/test');

// Animation checks use the real page and native input. They never submit leads
// or load third-party media while exercising the isolated design lab.
test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/order') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    }
    if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL).origin) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
    }
    return route.continue();
  });
});

async function openHome(page, reducedMotion = 'reduce') {
  await page.emulateMedia({ reducedMotion });
  const response = await page.goto('/');
  expect(response.status()).toBe(200);
  await expect(page.locator('#loader')).toBeHidden();
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await expect(page.locator('.cinema-story h1')).toBeVisible();
  if (reducedMotion === 'no-preference') {
    await expect(page.locator('html')).toHaveClass(/\blenis\b/);
  }
}

async function expectReadableCopy(page) {
  const copy = page.locator('[data-cinema-copy="0"]');
  await expect(page.locator('.cinema-copy')).toHaveCount(1);
  await expect(copy).toBeVisible();
  await expect(copy.locator('h1')).toHaveCSS('opacity', '1');
  await expect(copy.locator('h1')).toBeVisible();
}

async function scrollStory(page, progress) {
  await page.evaluate(value => {
    const story = document.querySelector('.cinema-story');
    const top = story.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (story.offsetHeight - innerHeight) * value, behavior: 'instant' });
  }, progress);
  await expect.poll(async () => Number(await page.locator('.cinema-stage').getAttribute('data-progress'))).toBeCloseTo(progress, 2);
}

test('reduced motion keeps native scrolling immediate and every form under a readable heading', async ({ page }) => {
  await openHome(page);
  await expect(page.locator('html')).not.toHaveClass(/\blenis\b/);
  for (const [index, form] of ['microphone', 'laptop', 'instagram'].entries()) {
    const progress = (index + 1) / 3;
    const positions = await page.evaluate(value => new Promise(resolve => {
      const story = document.querySelector('.cinema-story');
      const top = story.getBoundingClientRect().top + scrollY;
      const target = top + (story.offsetHeight - innerHeight) * value;
      const samples = [];
      scrollTo({ top: target, behavior: 'instant' });
      function sample() {
        samples.push({ y: scrollY, target });
        if (samples.length < 3) requestAnimationFrame(sample);
        else resolve(samples);
      }
      requestAnimationFrame(sample);
    }), progress);
    expect(positions.every(({ y, target }) => Math.abs(y - target) <= 1), 'Native scrolling reaches its destination on the first frame and remains there').toBe(true);
    await expect.poll(async () => Number(await page.locator('.cinema-stage').getAttribute('data-progress'))).toBeCloseTo(progress, 2);
    await expect(page.locator('.cinema-stage')).toHaveAttribute('data-current-form', form);
    await expectReadableCopy(page);
  }
});

test('desktop wheel input advances through intermediate scroll positions and settles at its target', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Touch devices retain their native scrolling.');
  await openHome(page, 'no-preference');
  await page.mouse.move(1000, 500);
  const start = await page.evaluate(() => {
    window.__animationScrollSamples = [];
    window.__animationSampleUntil = performance.now() + 4000;
    function sample() {
      window.__animationScrollSamples.push(scrollY);
      if (performance.now() < window.__animationSampleUntil) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
    return scrollY;
  });
  await page.mouse.wheel(0, 500);
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - start - 500), { timeout: 6000 }).toBeLessThanOrEqual(8);
  const samples = await page.evaluate(() => {
    window.__animationSampleUntil = 0;
    return window.__animationScrollSamples;
  });
  const intermediate = new Set(samples.filter(value => value > start + 2 && value < start + 498).map(value => Math.round(value)));
  expect(intermediate.size, 'Wheel input visibly moves through several positions before reaching its final offset').toBeGreaterThan(2);
  const progress = Number(await page.locator('.cinema-stage').getAttribute('data-progress'));
  const scrollProgress = await page.locator('.cinema-story').evaluate(story => {
    const top = story.getBoundingClientRect().top + scrollY;
    return (scrollY - top) / (story.offsetHeight - innerHeight);
  });
  expect(progress, 'The object transformation follows the actual smoothed native scroll position').toBeCloseTo(scrollProgress, 2);
  expect(progress).toBeGreaterThan(0);
});

test('switching to reduced motion removes smoothing without moving or hiding the current form', async ({ page }) => {
  await openHome(page, 'no-preference');
  await scrollStory(page, 2 / 3);
  await expect(page.locator('.cinema-stage')).toHaveAttribute('data-current-form', 'laptop');
  await expectReadableCopy(page);
  const before = await page.evaluate(() => scrollY);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).not.toHaveClass(/\blenis\b/);
  expect(await page.evaluate(() => scrollY), 'Changing the accessibility preference keeps the current reading position').toBeCloseTo(before, 0);
  await expect(page.locator('.cinema-stage')).toHaveAttribute('data-current-form', 'laptop');
  await expectReadableCopy(page);
  await scrollStory(page, 1);
  await expect(page.locator('.cinema-stage')).toHaveAttribute('data-current-form', 'instagram');
  await expectReadableCopy(page);
});

test('opening the mobile menu stops pending wheel motion until Escape closes it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'The menu is available at the mobile breakpoint.');
  await openHome(page, 'no-preference');
  await page.mouse.move(300, 400);
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(5);

  // Dispatch immediately rather than waiting for the header's scroll transition
  // to become stable: the menu must interrupt motion that is already in flight.
  await page.locator('#burger').dispatchEvent('click');
  await expect(page.locator('#mobileMenu')).toHaveClass(/active/);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  const held = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 500);
  const positions = await page.evaluate(() => new Promise(resolve => {
    const samples = [scrollY];
    function sample() {
      samples.push(scrollY);
      if (samples.length < 8) requestAnimationFrame(sample);
      else resolve(samples);
    }
    requestAnimationFrame(sample);
  }));
  expect(Math.max(held, ...positions) - Math.min(held, ...positions), 'Pending inertia and further wheel input cannot move the background behind the menu').toBeLessThanOrEqual(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('#mobileMenu')).not.toHaveClass(/active/);
  await expect(page.locator('#mobileMenu')).toBeHidden();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(held + 100);
});

test('reduced-motion work anchor reaches its destination on the first frame without scrolling animation', async ({ page }, testInfo) => {
  await openHome(page);
  const mobile = testInfo.project.name === 'mobile';
  if (mobile) {
    await page.locator('#burger').click();
    await expect(page.locator('#mobileMenu')).toHaveClass(/active/);
  }
  await page.evaluate(() => {
    window.__workAnchorFrames = [];
    const captureClick = event => {
      if (!(event.target instanceof Element) || !event.target.closest('a[href="#work"]')) return;
      document.removeEventListener('click', captureClick, true);
      const work = document.getElementById('work');
      function sample() {
        window.__workAnchorFrames.push({ y: scrollY, top: work.getBoundingClientRect().top });
        if (window.__workAnchorFrames.length < 3) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    };
    document.addEventListener('click', captureClick, true);
  });
  await page.locator(mobile ? '#mobileMenu a[href="#work"]' : '.nav-links a[href="#work"]').click();
  await expect(page).toHaveURL(/#work$/);
  await expect.poll(() => page.evaluate(() => window.__workAnchorFrames.length)).toBe(3);
  const frames = await page.evaluate(() => window.__workAnchorFrames);
  expect(frames.every(frame => Math.abs(frame.top) <= 2), 'The work section reaches the viewport immediately, including the first frame after the anchor click').toBe(true);
  expect(Math.max(...frames.map(frame => frame.y)) - Math.min(...frames.map(frame => frame.y)), 'The native anchor remains still across subsequent frames').toBeLessThanOrEqual(1);
  await expect(page.locator('#work .section-title')).toBeInViewport();
});
