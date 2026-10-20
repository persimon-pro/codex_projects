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
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"success":true}',
      });
    }
    if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL).origin) {
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#38382c"/></svg>',
      });
    }
    return route.continue();
  });
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page), 'Interactions do not throw browser errors').toEqual([]);
  expect(submittedOrders.get(page), 'Exploring animations never submits a lead').toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'Content stays inside the viewport').toBeLessThanOrEqual(1);
});

async function selectLanguage(page, language) {
  const desktop = page.locator(`#btn-${language}`);
  if (await desktop.isVisible()) {
    await desktop.click();
  } else {
    const menu = page.locator('#mobileMenu');
    const burger = page.locator('#burger');
    if (!(await menu.evaluate(element => element.classList.contains('active')))) await burger.click();
    await page.locator(`#btn-${language}-mob`).click();
    if (await menu.evaluate(element => element.classList.contains('active'))) await burger.click();
  }
  await expect(page.locator('html')).toHaveAttribute('lang', language);
}

async function openPage(page, path) {
  const response = await page.goto(path);
  expect(response.status()).toBe(200);
  const loader = page.locator('#loader');
  if (await loader.count()) await expect(loader).toBeHidden();
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await expect(page.locator('.motion-page-progress')).toHaveCount(1);
  await expect(page.locator('.motion-case-cursor')).toHaveCount(1);
}

test('the sculpture has working mode, energy and reset controls without scroll jumps', async ({ page }) => {
  await openPage(page, '/#loft-lab');
  const lab = page.locator('#loft-lab');
  const controls = lab.locator('.lab-controls');
  await controls.scrollIntoViewIfNeeded();
  await expect(lab.locator('.lab-viewport')).toBeVisible();
  const buttons = lab.locator('button[data-lab-mode]');
  const energy = lab.locator('[data-lab-energy]');
  await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'true');

  await buttons.nth(2).click();
  await expect(buttons.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await energy.focus();
  await energy.press('End');
  await expect(energy).toHaveValue('100');

  const before = await page.evaluate(() => scrollY);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveClass(/\blenis\b/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).not.toHaveClass(/\blenis\b/);
  expect(await page.evaluate(() => scrollY), 'Changing motion preferences preserves the reading position').toBeCloseTo(before, 0);
  await expect(buttons.nth(2)).toHaveAttribute('aria-pressed', 'true');

  await lab.locator('[data-lab-reset]').click();
  await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(buttons.nth(2)).toHaveAttribute('aria-pressed', 'false');
  await expect(energy).toHaveValue('35');
  await buttons.nth(1).click();
  await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('the sculpture remains explorable when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /^webgl/.test(type) ? null : original.call(this, type, ...args);
    };
  });
  await openPage(page, '/#loft-lab');
  const lab = page.locator('#loft-lab');
  await lab.locator('.lab-controls').scrollIntoViewIfNeeded();
  await expect(lab.locator('.lab-fallback')).toHaveCSS('opacity', '1');
  await lab.locator('[data-lab-mode="2"]').click();
  await expect(lab.locator('[data-lab-mode="2"]')).toHaveAttribute('aria-pressed', 'true');
  await lab.locator('[data-lab-reset]').click();
  await expect(lab.locator('[data-lab-mode="0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(lab.locator('[data-lab-energy]')).toBeEnabled();
});

test('sculpture modes render different real WebGL shapes and its pause control stays usable', async ({ page }, testInfo) => {
  await openPage(page, '/#loft-lab');
  const lab = page.locator('#loft-lab');
  await lab.locator('.lab-controls').scrollIntoViewIfNeeded();
  const canvas = lab.locator('canvas.loft-lab-canvas');
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

  const frames = [];
  for (const mode of [0, 1, 2]) {
    await lab.locator(`[data-lab-mode="${mode}"]`).click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Capture the rendered object alone: changing a caption or the selected
    // button must not make a frozen WebGL scene pass the pixel comparison.
    const hideUi = await page.addStyleTag({ content: 'body * { visibility:hidden!important } canvas.loft-lab-canvas { visibility:visible!important }' });
    try {
      const png = await canvas.screenshot({ path: testInfo.outputPath(`sculpture-mode-${mode}.png`), animations: 'disabled' });
      frames.push(await page.evaluate(async base64 => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const sample = document.createElement('canvas');
        sample.width = sample.height = 32;
        const context = sample.getContext('2d');
        context.drawImage(image, 0, 0, 32, 32);
        return Array.from(context.getImageData(0, 0, 32, 32).data).filter((_, index) => index % 4 !== 3);
      }, png.toString('base64')));
    } finally {
      await hideUi.evaluate(element => element.remove());
    }
  }
  for (const [left, right] of [[0, 1], [1, 2], [0, 2]]) {
    const difference = frames[left].reduce((sum, channel, index) => sum + Math.abs(channel - frames[right][index]), 0) / frames[left].length;
    expect(difference, `Modes ${left} and ${right} visibly change the sculpture itself`).toBeGreaterThan(1);
  }

  const pause = lab.locator('[data-lab-pause]');
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
});

for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`service content and native proposal links remain readable with motion: ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await openPage(page, '/production');
    await selectLanguage(page, 'ru');
    const heading = page.locator('.service-title .lang-ru');
    const proposal = page.locator('.service-hero a[href="/order"]');
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('Видеопродакшн');
    await expect(page.locator('.service-title')).toHaveCSS('opacity', '1');
    await expect(proposal).toBeVisible();
    await selectLanguage(page, 'en');
    await expect(page.locator('.service-title .lang-en')).toBeVisible();
    await expect(page.locator('.service-title .lang-en')).toContainText('video production');
    await expect(proposal).toHaveAttribute('href', '/order');
    await proposal.click();
    await expect(page).toHaveURL(/\/order$/);
    await expect(page.locator('#firstName')).toBeVisible();
    await expect(page.locator('.motion-page-progress')).toHaveCount(1);
    await expect(page.locator('.motion-case-cursor')).toHaveCount(1);
  });
}

test('the brief progress follows valid choices and survives a language switch without submitting', async ({ page }) => {
  await openPage(page, '/order');
  const progress = page.getByRole('progressbar');
  await expect(progress).toHaveCount(1);
  await expect(progress).toHaveAttribute('aria-valuenow', '0');
  await page.locator('#firstName').fill('Design preview');
  await page.locator('#phone').fill('+992 000 000 000');
  await page.locator('label[for="act-restaurant"]').click();
  await page.locator('label[for="srv-video"]').click();
  await expect(progress).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('.loft-brief-status')).toContainText('4 / 4');

  await selectLanguage(page, 'ru');
  await expect(progress).toHaveAccessibleName('Заполнение брифа');
  await expect(page.locator('.form-title .lang-ru')).toContainText('проекте');
  await expect(page.locator('#firstName')).toHaveValue('Design preview');
  await expect(page.locator('#srv-video')).toBeChecked();
  await expect(progress).toHaveAttribute('aria-valuenow', '100');

  // A custom business type only completes its step after the description exists.
  await page.locator('label[for="act-other"]').click();
  await expect(page.locator('#customActivity')).toBeFocused();
  await expect(progress).toHaveAttribute('aria-valuenow', '75');
  await page.locator('#customActivity').fill('Creative studio');
  await expect(progress).toHaveAttribute('aria-valuenow', '100');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(progress).toHaveAttribute('aria-valuenow', '100');
  await page.locator('label[for="srv-video"]').click();
  await expect(progress).toHaveAttribute('aria-valuenow', '75');
});
