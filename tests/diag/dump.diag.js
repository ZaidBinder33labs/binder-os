// ============================================================
// DIAGNOSTIC ONLY — kuch fill nahi karta, kuch save nahi karta
// Sirf page ka structure terminal pe print karta hai
//
// RUN:  npx playwright test tests/dump.spec.js --headed
// ============================================================

import { test, expect } from '@playwright/test';
import { dismissAddLater } from '../helpers/helpers.js';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'test-data', 'ipc-spec.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

test.setTimeout(180_000);

test('DUMP — SKU structure dekho', async ({ page }) => {

  // ---------- Navigate (wahi steps jo already kaam karte hain) ----------
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  await dismissAddLater(page);

  await page.getByRole('button', { name: 'IPO Management' }).click();
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: 'Production' }).click();
  await page.waitForTimeout(1500);

  await page.locator('button')
    .filter({ hasText: config.navigation.chdpdProject })
    .first().click();
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: 'IPC Spec' }).click();
  await page.waitForTimeout(2000);

  await expect(page.locator('text="PRODUCT SPEC"')).toBeVisible({ timeout: 15000 });
  console.log('\n✅ IPC Spec page khul gaya\n');

  // ---------- DUMP 1: sirf 1 SKU wali state ----------
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   DUMP 1 — abhi (SKU add karne se pehle) ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(await grabStructure(page));

  // ---------- Add SKU dabao ----------
  console.log('\n➕ "Add SKU" dabaya ja raha hai...\n');
  await page.getByRole('button', { name: 'Add SKU' }).click();
  await page.waitForTimeout(2500);

  // ---------- DUMP 2: 2 SKU wali state (ASLI SAWAAL) ----------
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   DUMP 2 — Add SKU ke baad               ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(await grabStructure(page));

  console.log('\n✅ Ho gaya. Upar ka SAARA text copy karke bhej do.');
  console.log('⚠️  Kuch save nahi hua — page band kar sakte ho.\n');
});


// ============================================================
async function grabStructure(page) {
  return await page.evaluate(() => {
    const out = [];

    // --- "SKU 1" / "SKU 2" jaise headings hain kya? ---
    const headings = [...document.querySelectorAll('*')]
      .filter(el => {
        if (el.children.length > 0) return false;           // sirf leaf nodes
        const t = (el.textContent || '').trim();
        return /^SKU\s*\d+$/i.test(t);
      })
      .map(el => `<${el.tagName.toLowerCase()}> "${el.textContent.trim()}"`);

    out.push('── SKU HEADINGS ──');
    out.push(headings.length
      ? headings.map((h, i) => `  [${i}] ${h}`).join('\n')
      : '  ❌ koi "SKU N" heading nahi mila');
    out.push('');

    // --- BUYER SKU inputs = kitne SKU hain ---
    const skuInputs = [...document.querySelectorAll('input[placeholder="e.g., SKU-001"]')];
    out.push(`── BUYER SKU inputs: ${skuInputs.length} ──`);
    out.push('');

    // --- Har dropdown control: label + andar ka text ---
    const controls = [...document.querySelectorAll('[class*="-control"]')];
    out.push(`── DROPDOWN CONTROLS: ${controls.length} ──`);
    controls.forEach((c, i) => {
      const txt = (c.textContent || '').trim().slice(0, 35);
      let label = '(label nahi mila)';
      let n = c.parentElement;
      for (let d = 0; d < 5 && n; d++) {
        const l = n.querySelector('label');
        if (l) { label = l.textContent.trim().slice(0, 25); break; }
        n = n.parentElement;
      }
      out.push(`  control[${i}]  label="${label}"  text="${txt}"`);
    });
    out.push('');

    // --- SKU ka container kaunsa hai? ---
    if (skuInputs[0]) {
      out.push('── BUYER SKU input #0 ka ancestor chain ──');
      out.push('   (jis level pe skuInputs=1 ho, wahi SKU container hai)');
      let n = skuInputs[0];
      for (let d = 0; d < 9 && n; d++) {
        const cls = (n.className || '').toString().slice(0, 55);
        const nc = n.querySelectorAll('[class*="-control"]').length;
        const ns = n.querySelectorAll('input[placeholder="e.g., SKU-001"]').length;
        out.push(`  [${d}] <${n.tagName.toLowerCase()}> controls=${nc} skuInputs=${ns} class="${cls}"`);
        n = n.parentElement;
      }
    }

    return out.join('\n');
  });
}