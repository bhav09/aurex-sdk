import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './backend',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:8000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'API Tests',
      use: {
        // ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: 'cd ../backend && uvicorn main:app --port 8000',
    url: 'http://127.0.0.1:8000/health',
    reuseExistingServer: !process.env.CI,
  },
});
