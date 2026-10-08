import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  maxFailures: 1,
  workers: 2,
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: false,
    timeout: 30_000
  },
  projects: [
    {
      name: 'desktop-chromium',
      grep: /@all|@desktop/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 }
      }
    },
    {
      name: 'mobile-chromium',
      grep: /@all|@mobile/,
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
        browserName: 'chromium'
      }
    }
  ]
});
