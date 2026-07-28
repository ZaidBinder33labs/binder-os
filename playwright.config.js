import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'https://app.binder-os.com',
    headless: false,
    viewport: null,
    browserName: 'chromium',
    launchOptions: { args: ['--start-maximized'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.js/,
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});