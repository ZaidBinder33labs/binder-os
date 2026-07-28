// ═══════════════════════════════════════════════════════════════
//  STEP A · GENERATE BUYER CODE  (GenerateBuyerCode.jsx)
//  Fully JSON-driven | source-verified (Binder-frontend)
//
//  First step of the CHAIN. The backend GENERATES the code (not us) —
//  fill 3 fields (Buyer Name / End Customer / Contact Person), capture
//  the code, and write to .runtime/buyer.json → 02-ipo.spec will select that code.
//
//  Source facts (GenerateBuyerCode.jsx):
//   • URL   : /dashboard/code-creation/buyer
//   • fields: placeholders "Enter buyer name" / "Enter end customer name"
//             / "Enter contact person name"  (react-hook-free, plain inputs)
//   • submit: <button>Generate Buyer Code</button>
//   • DUPLICATE GUARD: same (buyerName + retailer) → blocks creation before
//     generating, shows "Existing code: XXX" in toast. Hence REUSE is possible.
//   • SUCCESS: heading "Buyer Code Generated" + large mono code + green ✓.
//
//  MODE (buyer.json → mode):
//   • "new"   : always a new buyer (random name → new code)
//   • "reuse" : fixed buyer; if it exists, fetch its code from the API,
//               otherwise create it. (idempotent — run again, same code.)
//   • "smart" : try new; if the combination clashes, fetch the existing code.
//  All three are VERIFIED via API (the code must exist in the buyer list).
// ═══════════════════════════════════════════════════════════════
import { test, expect } from '@playwright/test';
import { dismissAddLater } from '../helpers/helpers.js';
import { loadConfig, tpl } from '../helpers/binderHelpers.js';
import {
  apiContext, apiListBuyerCodes, apiAssertBuyerExists, apiVerifyBuyerFields,
  writeRuntime, BUYER_FILE,
} from '../helpers/runtimeHelpers.js';

const cfg = loadConfig('buyer.json');
test.setTimeout(cfg.timeout.test);

// Allows {{random}} in buyer.json — resolved by the template engine
const buyerName    = tpl(cfg.buyer.buyerName);
const endCustomer  = tpl(cfg.buyer.endCustomer);
const contact      = tpl(cfg.buyer.contactPerson);
const MODE         = (cfg.buyer.mode || 'smart').toLowerCase();

test(`STEP A — Buyer Code (${MODE})`, async ({ page, playwright }) => {
  page.on('dialog', d => d.accept().catch(() => {}));
  console.log(`\nBUYER  mode=${MODE}  name="${buyerName}"  end="${endCustomer}"\n`);

  const api = await apiContext(playwright);

// ── REUSE fast-path: Does the fixed buyer already exist? If so, do not touch the UI ──
  // (In reuse mode, the name is fixed — do not use {{random}} in buyer.json)
  if (MODE === 'reuse') {
    const existing = await findExistingCode(api, buyerName, endCustomer);
    if (existing) {
      console.log(`  ♻  reuse: buyer pehle se hai → ${existing}`);
      await apiAssertBuyerExists(api, existing);
      writeRuntime(BUYER_FILE, { code: existing, buyerName, endCustomer, mode: MODE, reused: true });
      await api.dispose();
      return;
    }
    console.log('  reuse: buyer nahi mila — ab bana rahe hain');
  }

// ── UI: Navigate to the buyer form ──
  // Path (source/screenshots): Code Creation → "Buyer" (left col) →
  //   panel opens → "Generate Buyer Code" → form.
  await page.goto('/');
  await dismissAddLater(page);
  await page.getByRole('button', { name: 'Code Creation' }).click();
  await page.getByText('Buyer', { exact: true }).first().click();          // left column
  await page.getByText('Generate Buyer Code', { exact: true }).click();    // right panel → form

  await expect(page.getByRole('heading', { name: 'Generate Buyer Code' }),
    'Buyer form heading not found/visible').toBeVisible({ timeout: cfg.timeout.page });

  // ── fill (source-exact placeholders) ──
  await page.getByPlaceholder('Enter buyer name').fill(buyerName);
  await page.getByPlaceholder('Enter end customer name').fill(endCustomer);
  await page.getByPlaceholder('Enter contact person name').fill(contact);
  console.log('✓ UI form filled');

  // ── submit ──
  await page.getByRole('button', { name: 'Generate Buyer Code' }).click();

  // Handle outcome: SUCCESS screen (new code) OR duplicate toast (existing code)
  const successHeading = page.getByRole('heading', { name: 'Buyer Code Generated' });
  const dupToast = page.getByText(/already exists.*code\s+\S+/i);

  await expect(successHeading.or(dupToast).first(),
    'Neither success screen nor duplicate toast — submit outcome not found').toBeVisible({ timeout: cfg.timeout.element });

  let code;

  if (await successHeading.isVisible().catch(() => false)) {
  // ── UI SUCCESS: Large monospace code capture ──
    // markup: <span class="font-mono ...">{generatedCode}</span>
    const codeEl = page.locator('span.font-mono').first();
    await expect(codeEl, 'Code span not found on the success screen').toBeVisible();
    code = (await codeEl.innerText()).trim();
    console.log(`  ✓ UI success screen — code: ${code}`);
  } else {
    // ── DUPLICATE: Extract code from toast (expected in smart/reuse mode) ──
    if (MODE === 'new') {
      throw new Error(`mode=new but duplicate found — use {{random}} in buyer.json to ensure a new code is generated every time`);
    }
    const txt = await dupToast.first().innerText();
    const m = txt.match(/code\s+([A-Za-z0-9-]+)/i);
    code = m ? m[1] : null;
    if (!code) {
     // If not found via toast, look it up via API
      code = await findExistingCode(api, buyerName, endCustomer);
    }
    if (!code) throw new Error(`Duplicate found but existing code could not be extracted:"${txt}"`);
    console.log(`  ♻  duplicate → existing code use: ${code}`);
  }

 // ── API VERIFY (both paths): code must exist in the backend list ──
  await apiAssertBuyerExists(api, code);

// ── FIELD-LEVEL read-back: Was every field saved correctly in the backend? ──
  // (Not just "does the code exist?" — verify buyerName/endCustomer/contactPerson as well.
  //  NOTE: In reuse/duplicate cases, the record fields will contain the ORIGINAL creation data;
  //  therefore, field-level verification should only run when a NEW record is created — otherwise, existing data will cause a mismatch.)
  if (await successHeading.isVisible().catch(() => false)) {
    await apiVerifyBuyerFields(api, code, {
      buyerName,
      endCustomer,
      contactPerson: contact,
    });
  } else {
    console.log(`  ℹ reuse/existing buyer — field-verify skip (data belongs to the original creation)`);
  }

  // ── runtime handoff ──
  writeRuntime(BUYER_FILE, {
    code, buyerName, endCustomer, contactPerson: contact, mode: MODE,
    reused: !(await successHeading.isVisible().catch(() => false)),
  });

  console.log(`\n✅ BUYER — code ${code} ready (02-ipo will select from this )\n`);
  await api.dispose();
});

// ─── helper: Find existing code by buyerName+endCustomer (API) ──
// (API-side mirror of checkIfCombinationExists — case-insensitive match)
async function findExistingCode(api, name, retailer) {
  const res = await api.get('ims/buyer-codes/');
  if (!res.ok()) return null;
  const body = await res.json();
  const list =
    Array.isArray(body) ? body :
    Array.isArray(body?.results) ? body.results :
    Array.isArray(body?.data) ? body.data : [];
  const n = name.trim().toLowerCase();
  const r = retailer.trim().toLowerCase();
  const hit = list.find(b =>
    (b.buyer_name || b.buyerName || '').trim().toLowerCase() === n &&
    (b.retailer || '').trim().toLowerCase() === r);
  return hit ? (hit.code || hit.id) : null;
}