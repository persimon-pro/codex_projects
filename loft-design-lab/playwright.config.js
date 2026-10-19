const { defineConfig } = require('@playwright/test');
const { existsSync } = require('node:fs');

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  ['/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3003';

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    reducedMotion: 'reduce',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 960 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'PORT=3003 npm start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
