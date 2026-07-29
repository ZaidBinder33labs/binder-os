// ═══════════════════════════════════════════════════════════════
//  STEP B · GENERATE IPO CODE  (InternalPurchaseOrder.jsx)
//  Fully JSON-driven | source-verified (Binder-frontend)
//
//  Second step of the CHAIN. Select the buyer code (from 01) and create the IPO.
//  The generated ipo_code = your project code (CHD/PD/<buyer>/<po>/<n>).
//  That goes to .runtime/current-ipo.json → Part 1–3 (03–06) will pick it up.
//
//  Source facts (InternalPurchaseOrder.jsx):
//   • URL   : /dashboard/code-creation/internal-purchase-order
//   • ORDER FOR  = ThemedSelect (react-select, unstyled) options:
//                  ['Company','Production','Sampling']
//   • BRANCH:
//       - Company            → "Type" ThemedSelect ['SAM','STOCK']  (no buyer code)
//       - Production/Sampling → "Buyer Code" ThemedSelect (getBuyerCodes list)
//   • PO NAME = plain <input placeholder="Enter PO name">
//   • submit  = <button>Continue →</button>
//   • SUCCESS = inline screen: heading "Internal Purchase Order" +
//               "Generated IPO Code" label + mono code + green ✓.
//               (createIPO → data.ipo_code)
//
//  ThemedSelect = react-select → same as the BOM/Step0 TenantDropdown:
//   control = [class*="-control"], menu portals to body, option = [class*="-option"].
//   So pickOption() (binderHelpers) works here too.
//
//  ORDER TYPE (ipo.json → orderType): "Production" | "Sampling" | "Company".
//   Company doesn't use a buyer code → in that case you could even skip
//   01-buyer, but here we defensively fill the type (STOCK/SAM).
// ═══════════════════════════════════════════════════════════════
import { test, expect } from '@playwright/test';
import { dismissAddLater } from '../helpers/helpers.js';
import { loadConfig, tpl, pickOption, field } from '../helpers/binderHelpers.js';
import {
  apiContext, apiAssertBuyerExists, apiAssertIpo,
  readRuntime, writeRuntime, BUYER_FILE, IPO_FILE,
} from '../helpers/runtimeHelpers.js';

const cfg = loadConfig('ipo.json');
test.setTimeout(cfg.timeout.test);

const ORDER_TYPE = cfg.ipo.orderType;                 // Production | Sampling | Company
const COMPANY_TYPE = cfg.ipo.companyType || 'STOCK';  // only for Company
const PO_NAME = tpl(cfg.ipo.poName);
const isCompany = ORDER_TYPE === 'Company';

test(`STEP B — IPO Code (${ORDER_TYPE})`, async ({ page, playwright }) => {
  page.on('dialog', d => d.accept().catch(() => {}));
  console.log(`\nIPO  orderType=${ORDER_TYPE}  po="${PO_NAME}"` +
    (isCompany ? `  type=${COMPANY_TYPE}` : '') + `\n`);

  const api = await apiContext(playwright);

  // ── resolve buyer code (for Production/Sampling) ──
  let buyerCode = null;
  if (!isCompany) {
    const rt = readRuntime(BUYER_FILE);
    buyerCode = process.env.BINDER_BUYER || rt?.code;
    if (!buyerCode) {
      throw new Error('buyer code not found — run 01-buyer.spec first (or provide BINDER_BUYER env)');
    }
    // API verify: is the code we're about to select present in the backend?
    await apiAssertBuyerExists(api, buyerCode);
    console.log(`  buyer code (from chain): ${buyerCode}`);
  }

  // ── navigate → IPO form ──
  await page.goto('/');
  await dismissAddLater(page);
  await page.getByRole('button', { name: 'Code Creation' }).click();
  await page.getByText('Internal Purchase Order', { exact: true }).click();      // left column
  await page.getByText('Generate IPO Code', { exact: true }).click();            // right panel

  await expect(page.getByRole('heading', { name: 'Internal Purchase Order' }),
    'IPO form heading not visible').toBeVisible({ timeout: cfg.timeout.page });
  await expect(page.getByText('Select order type and enter required information'),
    'IPO subtitle not visible').toBeVisible();

  const body = page.locator('body');

  // ── ORDER FOR ──
  await pickOption(page, field(body, 'Order For').locator('[class*="-control"]').first(),
    ORDER_TYPE, 'ORDER FOR');
  await page.waitForTimeout(400);   // let the branch field (Buyer Code / Type) render

  // ── branch field ──
  if (isCompany) {
    await pickOption(page, field(body, 'Type').locator('[class*="-control"]').first(),
      COMPANY_TYPE, 'COMPANY TYPE');
    console.log(`  company type: ${COMPANY_TYPE}`);
  } else {
    await pickOption(page, field(body, 'Buyer Code').locator('[class*="-control"]').first(),
      buyerCode, 'BUYER CODE');
    console.log(`  buyer code selected: ${buyerCode}`);
  }

  // ── PO NAME ──
  await page.getByPlaceholder('Enter PO name').fill(PO_NAME);

  // ── Continue → ──
  await page.getByRole('button', { name: /Continue|Save Changes/ }).click();

  // ── SUCCESS screen: "Generated IPO Code" + mono code ──
  await expect(page.getByText('Generated IPO Code'),
    'IPO success screen did not appear').toBeVisible({ timeout: cfg.timeout.page });
  const codeEl = page.locator('span.font-mono').first();
  await expect(codeEl, 'IPO code span not found').toBeVisible();
  const ipoCode = (await codeEl.innerText()).trim();
  console.log(`  ✓ UI success — IPO code: ${ipoCode}`);

  // ── API VERIFY: IPO exists in backend + buyer match ──
  const rec = await apiAssertIpo(api, ipoCode, isCompany ? {} : { buyerCode });

  // ── runtime handoff (Part 1–3 will resolve the project from this) ──
  writeRuntime(IPO_FILE, {
    ipoCode,
    orderType: ORDER_TYPE,
    buyerCode: buyerCode || null,
    companyType: isCompany ? COMPANY_TYPE : null,
    poName: PO_NAME,
    ipoId: rec.id || rec.ipoId || null,
    poSrNo: rec.po_sr_no ?? rec.poSrNo ?? null,
  });

  console.log(`\n✅ IPO — ${ipoCode} ready. Now Part 1–3 will run against this IPO.\n`);
  await api.dispose();
});