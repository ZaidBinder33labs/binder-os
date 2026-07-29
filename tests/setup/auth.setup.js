import { test as setup, expect } from '@playwright/test';
import 'dotenv/config';
import { dismissAddLater } from '../helpers/helpers.js';
import fs from 'fs';

const authFile = '.auth/user.json';

setup.setTimeout(120_000); // Render backend cold-start allowance — default 60s is too tight

// ── SMART SKIP: if a valid (fresh) token already exists, don't log in again ──
// The access token expires in ~1 hour. We're a bit conservative — if it's older
// than 45 min, do a fresh login. This makes repeated test runs fast (login skipped),
// and if the token is stale it auto-refreshes = reliable (no flakiness).
const TOKEN_MAX_AGE_MS = 45 * 60 * 1000; // 45 min

function existingAuthIsFresh() {
  try {
    if (!fs.existsSync(authFile)) return false;
    const stat = fs.statSync(authFile);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > TOKEN_MAX_AGE_MS) return false;         // old → fresh login
    const state = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    // is access_token present in localStorage?
    const hasToken = (state.origins ?? []).some(o =>
      (o.localStorage ?? []).some(x => x.name === 'access_token' && x.value)
    );
    return hasToken;
  } catch {
    return false;
  }
}

setup('authenticate', async ({ page }) => {
  // ── if a valid token exists, skip login ──
  if (existingAuthIsFresh()) {
    const mins = Math.round((Date.now() - fs.statSync(authFile).mtimeMs) / 60000);
    console.log(`✅ login SKIP — ${mins}m old valid token available (.auth/user.json)`);
    return;
  }
  console.log('🔑 performing fresh login...');

  page.on('response', r => {
    const u = r.url();
    if (r.request().method() === 'POST' && !u.includes('google-analytics')) {
      console.log('POST', r.status(), u);
    }
  });

  await page.goto('/login');

  // form reveal
  await page.getByRole('button', { name: 'LOGIN NOW →' }).click();

  await page.getByRole('textbox', { name: 'Enter your email or username' })
    .fill(process.env.BINDER_USER);
  await page.getByRole('textbox', { name: 'Enter your password' })
    .fill(process.env.BINDER_PASS);

  // same button again = submit — this time we explicitly wait for the actual login
  // response, so a cold-start gives a clear error instead of a vague URL-mismatch
  const [loginResponse] = await Promise.all([
    page.waitForResponse(
      r => r.url().includes('/api/auth/login/') && r.request().method() === 'POST',
      { timeout: 90_000 }
    ),
    page.getByRole('button', { name: 'LOGIN NOW →' }).click(),
  ]);
  if (!loginResponse.ok()) {
    throw new Error(`login POST failed: ${loginResponse.status()} ${loginResponse.url()}`);
  }

  await dismissAddLater(page);

  await expect(page).not.toHaveURL(/login/, { timeout: 20000 });
  await page.context().storageState({ path: authFile });
  console.log('✅ logged in:', page.url());
});