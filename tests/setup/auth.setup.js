import { test as setup, expect } from '@playwright/test';
import 'dotenv/config';
import { dismissAddLater } from '../helpers/helpers.js';
import fs from 'fs';

const authFile = '.auth/user.json';

setup.setTimeout(120_000); // Render backend cold-start allowance — default 60s is too tight

// ── SMART SKIP: agar valid (fresh) token pehle se hai to dobara login mat karo ──
// Access token ~1 ghante me expire hota hai. Hum thoda conservative — 45 min se
// purana ho to fresh login. Isse baar-baar test karte waqt login skip = fast,
// aur token stale ho to auto fresh = reliable (no flaky).
const TOKEN_MAX_AGE_MS = 45 * 60 * 1000; // 45 min

function existingAuthIsFresh() {
  try {
    if (!fs.existsSync(authFile)) return false;
    const stat = fs.statSync(authFile);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > TOKEN_MAX_AGE_MS) return false;         // purana → fresh login
    const state = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    // access_token maujood hai localStorage me?
    const hasToken = (state.origins ?? []).some(o =>
      (o.localStorage ?? []).some(x => x.name === 'access_token' && x.value)
    );
    return hasToken;
  } catch {
    return false;
  }
}

setup('authenticate', async ({ page }) => {
  // ── agar valid token hai to login skip ──
  if (existingAuthIsFresh()) {
    const mins = Math.round((Date.now() - fs.statSync(authFile).mtimeMs) / 60000);
    console.log(`✅ login SKIP — ${mins}old valid token available (.auth/user.json)`);
    return;
  }
  console.log('🔑 fresh login kar rahe hain...');

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

  // wahi button dobara = submit — is baar actual login response ka explicit wait,
  // taaki cold-start pe vague URL-mismatch ke bajaye clear error mile
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