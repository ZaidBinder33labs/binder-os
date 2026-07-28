// ═══════════════════════════════════════════════════════════════
//  STEP B · GENERATE IPO CODE  (InternalPurchaseOrder.jsx)
//  Fully JSON-driven | source-verified (Binder-frontend)
//
//  CHAIN ka doosra step. Buyer code (01 se) select karke IPO banao.
//  Generated ipo_code = tumhara project code (CHD/PD/<buyer>/<po>/<n>).
//  Wahi .runtime/current-ipo.json me → Part 1–3 (03–06) usse uthaenge.
//
//  Source facts (InternalPurchaseOrder.jsx):
//   • URL   : /dashboard/code-creation/internal-purchase-order
//   • ORDER FOR  = ThemedSelect (react-select, unstyled) options:
//                  ['Company','Production','Sampling']
//   • BRANCH:
//       - Company            → "Type" ThemedSelect ['SAM','STOCK']  (buyer code NAHI)
//       - Production/Sampling → "Buyer Code" ThemedSelect (getBuyerCodes list)
//   • PO NAME = plain <input placeholder="Enter PO name">
//   • submit  = <button>Continue →</button>
//   • SUCCESS = inline screen: heading "Internal Purchase Order" +
//               "Generated IPO Code" label + mono code + green ✓.
//               (createIPO → data.ipo_code)
//
//  ThemedSelect = react-select → BOM/Step0 wale TenantDropdown jaisa hi:
//   control = [class*="-control"], menu body me portal, option = [class*="-option"].
//   Isliye pickOption() (binderHelpers) yahan bhi chalta hai.
//
//  ORDER TYPE (ipo.json → orderType): "Production" | "Sampling" | "Company".
//   Company pe buyer code use NAHI hota → us case me 01-buyer skip bhi kar
//   sakte ho, par yahan hum defensively type (STOCK/SAM) bharते hain.
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
const COMPANY_TYPE = cfg.ipo.companyType || 'STOCK';  // sirf Company ke liye
const PO_NAME = tpl(cfg.ipo.poName);
const isCompany = ORDER_TYPE === 'Company';

test(`STEP B — IPO Code (${ORDER_TYPE})`, async ({ page, playwright }) => {
  page.on('dialog', d => d.accept().catch(() => {}));
  console.log(`\nIPO  orderType=${ORDER_TYPE}  po="${PO_NAME}"` +
    (isCompany ? `  type=${COMPANY_TYPE}` : '') + `\n`);

  const api = await apiContext(playwright);

  // ── buyer code resolve (Production/Sampling ke liye) ──
  let buyerCode = null;
  if (!isCompany) {
    const rt = readRuntime(BUYER_FILE);
    buyerCode = process.env.BINDER_BUYER || rt?.code;
    if (!buyerCode) {
      throw new Error('buyer code nahi mila — pehle 01-buyer.spec chalao (ya BINDER_BUYER env do)');
    }
    // API verify: jo code select karne ja rahe hain wo backend me hai?
    await apiAssertBuyerExists(api, buyerCode);
    console.log(`  buyer code (chain se): ${buyerCode}`);
  }

  // ── navigate → IPO form ──
  await page.goto('/');
  await dismissAddLater(page);
  await page.getByRole('button', { name: 'Code Creation' }).click();
  await page.getByText('Internal Purchase Order', { exact: true }).click();      // left column
  await page.getByText('Generate IPO Code', { exact: true }).click();            // right panel

  await expect(page.getByRole('heading', { name: 'Internal Purchase Order' }),
    'IPO form heading nahi dikha').toBeVisible({ timeout: cfg.timeout.page });
  await expect(page.getByText('Select order type and enter required information'),
    'IPO subtitle nahi dikha').toBeVisible();

  const body = page.locator('body');

  // ── ORDER FOR ──
  await pickOption(page, field(body, 'Order For').locator('[class*="-control"]').first(),
    ORDER_TYPE, 'ORDER FOR');
  await page.waitForTimeout(400);   // branch field (Buyer Code / Type) render hone do

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
    'IPO success screen nahi aaya').toBeVisible({ timeout: cfg.timeout.page });
  const codeEl = page.locator('span.font-mono').first();
  await expect(codeEl, 'IPO code span nahi mila').toBeVisible();
  const ipoCode = (await codeEl.innerText()).trim();
  console.log(`  ✓ UI success — IPO code: ${ipoCode}`);

  // ── API VERIFY: IPO backend me maujood + buyer match ──
  const rec = await apiAssertIpo(api, ipoCode, isCompany ? {} : { buyerCode });

  // ── runtime handoff (Part 1–3 isse project resolve karenge) ──
  writeRuntime(IPO_FILE, {
    ipoCode,
    orderType: ORDER_TYPE,
    buyerCode: buyerCode || null,
    companyType: isCompany ? COMPANY_TYPE : null,
    poName: PO_NAME,
    ipoId: rec.id || rec.ipoId || null,
    poSrNo: rec.po_sr_no ?? rec.poSrNo ?? null,
  });

  console.log(`\n✅ IPO — ${ipoCode} ready. Ab Part 1–3 isi IPO pe chalenge.\n`);
  await api.dispose();
});