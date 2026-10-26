const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

const errorsByPage = new WeakMap();

test.beforeEach(async ({ page, baseURL }) => {
  const errors = [];
  errorsByPage.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/order') {
      errors.push('Visual restoration checks must never submit an order.');
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    }
    if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL).origin) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
    }
    return route.continue();
  });
});

test.afterEach(async ({ page }) => {
  expect(errorsByPage.get(page), 'The restored effects have no uncaught errors or submitted leads').toEqual([]);
});

async function openPage(page, pathname = '/#about', motion = 'no-preference', { webgl = false } = {}) {
  if (!webgl) await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /^webgl/.test(type) ? null : original.call(this, type, ...args);
    };
  });
  await page.emulateMedia({ reducedMotion: motion });
  const response = await page.goto(pathname);
  expect(response.status()).toBe(200);
  await expect(page.locator('#loader')).toBeHidden();
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

async function inspectMarqueePhase(page, fraction) {
  return page.locator('.cinema-marquee-track').evaluate((track, fraction) => {
    const animation = track.getAnimations()[0];
    if (!animation) throw new Error('The marquee must have a running CSS animation.');
    animation.pause();
    animation.currentTime = Number(animation.effect.getTiming().duration) * fraction;
    const viewport = track.parentElement.getBoundingClientRect();
    const groups = [...track.querySelectorAll(':scope > .cinema-marquee-group')];
    const intervals = [];
    track.querySelectorAll('.cinema-marquee-unit').forEach(unit => {
      const walker = document.createTreeWalker(unit, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        const rect = range.getBoundingClientRect();
        if (rect.right > viewport.left && rect.left < viewport.right) {
          intervals.push([Math.max(viewport.left, rect.left), Math.min(viewport.right, rect.right)]);
        }
      }
    });
    intervals.sort((a, b) => a[0] - b[0]);
    let cursor = viewport.left;
    let largestGap = 0;
    for (const [left, right] of intervals) {
      largestGap = Math.max(largestGap, left - cursor);
      cursor = Math.max(cursor, right);
    }
    largestGap = Math.max(largestGap, viewport.right - cursor);
    return {
      groupWidths: groups.map(group => group.getBoundingClientRect().width),
      viewportWidth: viewport.width,
      largestGap,
      normalGap: parseFloat(getComputedStyle(track.querySelector('.cinema-marquee-unit')).columnGap),
      firstCopyLeft: groups[0].firstElementChild.getBoundingClientRect().left,
      nextCopyLeft: groups[1].firstElementChild.getBoundingClientRect().left,
      visibleTextRuns: intervals.length,
    };
  }, fraction);
}

test('the marquee fills every viewport and crosses its animation seam without an empty stretch or jump', async ({ page }, testInfo) => {
  await openPage(page);
  // Resize across both responsive layouts, including a wide desktop window.
  const sizes = testInfo.project.name === 'desktop' ? [390, 1440, 2560] : [390, 844];
  for (const width of sizes) {
    await page.setViewportSize({ width, height: testInfo.project.name === 'desktop' ? 960 : 844 });
    await expect.poll(async () => {
      const state = await inspectMarqueePhase(page, 0);
      return Math.min(...state.groupWidths) - state.viewportWidth;
    }).toBeGreaterThanOrEqual(0);
    const beginning = await inspectMarqueePhase(page, 0);
    for (const fraction of [0, 0.5, 0.999999]) {
      const state = await inspectMarqueePhase(page, fraction);
      expect(state.visibleTextRuns, 'Actual text continues through the visible strip').toBeGreaterThan(0);
      expect(state.largestGap, 'No animation phase creates a blank gap wider than the designed text spacing').toBeLessThanOrEqual(state.normalGap + 3);
      expect(Math.abs(state.groupWidths[0] - state.groupWidths[1])).toBeLessThanOrEqual(0.1);
      if (fraction > 0.99) {
        expect(Math.abs(state.nextCopyLeft - beginning.firstCopyLeft), 'The next copy meets the exact starting position when the loop repeats').toBeLessThanOrEqual(0.2);
      }
    }
  }
});

const opacities = language => [...language.querySelectorAll('.manifesto-word')].map(word => Number(getComputedStyle(word).opacity));
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;

async function setManifestoProgress(page, progress) {
  await page.locator('.manifesto-text').evaluate((paragraph, progress) => {
    const rect = paragraph.getBoundingClientRect();
    const top = rect.top + scrollY;
    const start = top - innerHeight * 0.83;
    const end = top + rect.height - innerHeight * 0.48;
    scrollTo({ top: start + (end - start) * progress, behavior: 'instant' });
  }, progress);
}

test('the agency text gradually brightens in reading order in Russian and English without changing its copy', async ({ page }) => {
  await openPage(page);
  const paragraph = page.locator('.manifesto-text');
  const originalCopy = await paragraph.locator(':scope > .lang').allTextContents();
  await expect(paragraph.locator('.manifesto-word').first()).toBeAttached();
  await expect(paragraph.locator('..')).toHaveCSS('opacity', '1');
  for (const language of ['ru', 'en']) {
    await page.evaluate(language => window.setLang(language), language);
    const copy = paragraph.locator(`:scope > .lang-${language}`);
    await expect(copy).toBeVisible();
    await setManifestoProgress(page, -0.1);
    await expect.poll(async () => Math.max(...await copy.evaluate(opacities))).toBeLessThan(0.25);
    const dark = await copy.evaluate(opacities);
    await setManifestoProgress(page, 0.5);
    await expect.poll(async () => average(await copy.evaluate(opacities))).toBeGreaterThan(average(dark) + 0.15);
    await expect.poll(async () => {
      const values = await copy.evaluate(opacities);
      return values[0] - values.at(-1);
    }, { message: 'The beginning of the sentence brightens before its ending' }).toBeGreaterThan(0.4);
    const halfway = await copy.evaluate(opacities);
    await setManifestoProgress(page, 1.1);
    await expect.poll(async () => Math.min(...await copy.evaluate(opacities))).toBeGreaterThan(0.98);
    expect(average(await copy.evaluate(opacities))).toBeGreaterThan(average(halfway) + 0.15);
    await expect(copy.locator('em .manifesto-word').first()).toBeAttached();
  }
  expect(await paragraph.locator(':scope > .lang').allTextContents()).toEqual(originalCopy);
  await expect(paragraph.locator('.manifesto-word .manifesto-word')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(paragraph.locator('.manifesto-word')).toHaveCount(0);
  expect(await paragraph.locator(':scope > .lang').allTextContents()).toEqual(originalCopy);
  await expect(paragraph).toHaveCSS('clip-path', 'none');
});

test('the visible 3D scene smoothly visits camera, microphone, laptop and Instagram in the saved order', async ({ page }, testInfo) => {
  test.setTimeout(100_000);
  await openPage(page, '/#camera-showcase', 'reduce', { webgl: true });
  const section = page.locator('#camera-showcase');
  const art = section.locator('.camera-showcase-art');
  await expect(art).toHaveClass(/is-ready/);
  await page.evaluate(() => document.querySelector('#camera-showcase').scrollIntoView({ block: 'center', behavior: 'instant' }));
  const canvas = art.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-orbits', '2');
  const title = await page.addStyleTag({ content: '.camera-showcase-title { visibility:hidden!important; }' });
  const images = [];
  const forms = [['camera', 0], ['microphone', 0.32], ['laptop', 0.65], ['instagram', 0.97]];
  for (const [index, [form, threshold]] of forms.entries()) {
    if (threshold) {
      // Pause in the same browser turn that reaches the requested hold. A
      // round trip through focus/keyboard can miss it on a saturated GPU.
      await page.evaluate(() => window.__restoredMorphHold);
      await expect(section).toHaveAttribute('data-paused', 'true');
    }
    await expect(section).toHaveAttribute('data-current-form', form);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const png = await canvas.screenshot({ path: testInfo.outputPath(`restored-${form}.png`), animations: 'disabled' });
    const contrast = await page.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const sample = document.createElement('canvas');
      sample.width = sample.height = 48;
      const context = sample.getContext('2d');
      context.drawImage(image, 0, 0, 48, 48);
      const rgb = [...context.getImageData(0, 0, 48, 48).data].filter((_, index) => index % 4 !== 3);
      return Math.max(...rgb) - Math.min(...rgb);
    }, png.toString('base64'));
    expect(contrast, `${form} has illuminated geometry in the actual GPU output`).toBeGreaterThan(40);
    images.push(createHash('sha256').update(png).digest('hex'));
    const next = forms[index + 1];
    if (next) {
      await page.evaluate(nextThreshold => {
        const section = document.querySelector('#camera-showcase');
        window.__restoredMorphHold = new Promise(resolve => {
          const observer = new MutationObserver(() => {
            const progress = Number(section.dataset.progress);
            if (progress < nextThreshold) return;
            observer.disconnect();
            section.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
            resolve(progress);
          });
          observer.observe(section, { attributes: true, attributeFilter: ['data-progress'] });
        });
      }, next[1]);
      if (threshold === 0) await page.emulateMedia({ reducedMotion: 'no-preference' });
      else await section.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true })));
    }
  }
  await title.evaluate(element => element.remove());
  expect(new Set(images).size, 'The four forms produce different actual scene images').toBe(4);
});
