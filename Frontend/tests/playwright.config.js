const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 30 * 60 * 1000,
  workers: 1,
  reporter: 'dot',
  retries: 0,
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
});