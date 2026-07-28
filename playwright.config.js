import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

// CI (Jenkins) me chal rahe hain ya local laptop pe?
// Ye variable SIRF Jenkins me set hota hai (Jenkinsfile CI='true' karta hai).
// Tumhare laptop pe ye hai hi nahi -> isCI hamesha false -> local behavior
// bilkul waisa hi rahega: headed browser, maximized, list reporter.
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  workers: 1,

  // Local: sirf terminal list. CI: list + HTML report (Jenkins ke liye).
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',

  timeout: 60_000,
  use: {
    baseURL: 'https://app.binder-os.com',

    // Local pe browser dikhega (false). CI me headless (server pe screen nahi hoti).
    headless: isCI ? true : false,

    // Local: maximized (null). CI: fixed size, kyunki maximize headless me kaam nahi karta.
    viewport: isCI ? { width: 1280, height: 720 } : null,

    browserName: 'chromium',

    // --start-maximized sirf headed local ke liye. CI me khaali.
    launchOptions: { args: isCI ? [] : ['--start-maximized'] },

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