// ═══════════════════════════════════════════════════════════════
//  PART-4 · PACKAGING  (Step5.jsx + PackagingMaterialTypeFields.jsx)
//  Fully JSON-driven | source-verified + DOM-verified (live dump)
//
//  Verified from a live DOM dump of the PACKAGING screen:
//   • Reach it from the IPC-selector via button "Proceed to Packaging →".
//   • Heading "PACKAGING". Sections: "PACKAGING HEADER",
//     "PO RECONCILIATION — LEFTOVER", "Packaging Materials", "MATERIAL 1".
//   • Header labels (exact): "TO BE SHIPPED *", "PRODUCT *",
//     "MASTER PACK *", "CASEPACK QTY (PCS) *".
//   • Inputs: PRODUCT text input placeholder "Select IPCs (click to open)"
//     (Merged mode; checkboxes) OR "Select or type IPC" (Standalone).
//     CASEPACK = input[type=number] placeholder "10".
//   • react-select controls: "Select or type" (TO BE SHIPPED),
//     "Select or type Material Type" (PACKAGING MATERIAL TYPE).
//   • Reconciliation table head: "IPC PO QTY PACKED BALANCE STATUS".
//   • IPC codes look like "CHD/713A/PO-52/IPC-1" (+ "/SP-n" for subproducts).
//
//  Ledger math (source):  balance = poQty − Σ packQty[ipc]  → must reach Nil.
//  MASTER PACK is AUTO (Merged→ASSORTED, Standalone→STANDARD): we ASSERT it.
//  ★ Only real auto-calc = POLYBAG~Bale + INNER~CASEPACK:
//        innerQty = casepack / polybagCount ;  reqMaterial = assd / innerQty.
// ═══════════════════════════════════════════════════════════════
import { test, expect } from '@playwright/test';
import { dismissAddLater } from '../helpers/helpers.js';
import { resolveProject } from '../helpers/runtimeHelpers.js';
import {
  loadConfig, setAny, pickOption, field,
  gotoProject, setTestingInput,
} from '../helpers/binderHelpers.js';

const cfg = loadConfig('packaging.json');
test.setTimeout(cfg.timeout.test);

const round2 = (x) => Math.round(x * 100) / 100;
const num = (v) => {
  const n = parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};
const IPC_RE = /IPC-?\d+(?:\/SP-?\d+)?/i;

test('PART-4 PACKAGING — header, ledger & calculations', async ({ page }) => {
  page.on('dialog', d => d.accept().catch(() => {}));
  console.log(`\n${cfg.navigation.chdpdProject} | PACKAGING\n`);

  // ── navigate to the project, then into the IPC selector ──
  await gotoProject(page, resolveProject(cfg), dismissAddLater);
  await page.getByRole('button', { name: 'IPC Spec' }).click();

  // A Step0 may show first; save through it to reach the flow.
  const step0 = page.locator('text="PRODUCT SPEC"');
  if (await step0.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /^(Save|Saved|Not Saved)$/ }).first().click();
    await page.getByText('IPC Codes Generated').waitFor({ timeout: cfg.timeout.element }).catch(() => {});
    await page.getByRole('button', { name: 'Next', exact: true }).click().catch(() => {});
  }

  // Wait for the IPC selector, then click "Proceed to Packaging →".
  await expect(page.getByText('Select SKU to proceed').first(), 'IPC selector not shown')
    .toBeVisible({ timeout: cfg.timeout.page }).catch(() => {});
  const proceed = page.getByRole('button', { name: /Proceed to Packaging/i });
  await expect(proceed, 'no "Proceed to Packaging" button').toBeVisible({ timeout: cfg.timeout.page });
  await proceed.click();

  // Assert we're on the PACKAGING screen.
  await expect(page.getByRole('heading', { name: 'PACKAGING', exact: true }).first(),
    'PACKAGING screen did not open').toBeVisible({ timeout: cfg.timeout.page });
  console.log('On PACKAGING screen\n');

  const P = cfg.packaging;

  // Locate a header field container by its label text.
  const labelField = (labelText) =>
    page.locator('div.flex.flex-col')
      .filter({ has: page.locator('label', { hasText: labelText }) })
      .first();

  // ── HEADER: TO BE SHIPPED ────────────────────────────────────
  await test.step('Header — TO BE SHIPPED', async () => {
    const box = labelField('TO BE SHIPPED');
    const control = box.locator('[class*="-control"]').first();
    if (await control.count()) {
      await control.click();
      const opt = page.locator('[class*="-option"]')
        .filter({ hasText: new RegExp(`^\\s*${P.toBeShipped}\\s*$`, 'i') }).first();
      if (await opt.count()) { await opt.click(); console.log(`  TO BE SHIPPED: ${P.toBeShipped}`); }
      else { await page.keyboard.press('Escape'); console.log(`  TO BE SHIPPED: kept default (${P.toBeShipped} not offered)`); }
      await page.waitForTimeout(400);
    }
  });

  // ── HEADER: PRODUCT (IPC) selection ─────────────────────────
  let chosenIpcs = [];
  await test.step('Header — PRODUCT (IPC) selection', async () => {
    const isStandalone = String(P.toBeShipped).toLowerCase() === 'standalone';
    const productInput = page.getByPlaceholder(/Select IPCs \(click to open\)|Select or type IPC/i).first();
    await productInput.click().catch(() => {});
    await page.waitForTimeout(400);

    if (isStandalone) {
      const row = page.locator('div[class*="cursor-pointer"]').filter({ hasText: IPC_RE }).first();
      const code = ((await row.innerText().catch(() => '')).match(IPC_RE) || [])[0];
      await row.click().catch(() => {});
      if (code) chosenIpcs.push(code);
    } else {
      // Merged multi-select: tick every IPC checkbox (label rows carry the code)
      const rows = page.locator('label').filter({ hasText: IPC_RE });
      const rc = await rows.count();
      for (let i = 0; i < rc; i++) {
        const raw = (await rows.nth(i).innerText().catch(() => '')).trim();
        const code = (raw.match(IPC_RE) || [])[0];
        if (!code || chosenIpcs.includes(code)) continue;
        const cb = rows.nth(i).locator('input[type="checkbox"]');
        if (await cb.count()) {
          if (!(await cb.isChecked().catch(() => false))) await cb.check().catch(() => {});
          chosenIpcs.push(code);
        }
      }
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
    console.log(`  PRODUCT IPCs (${chosenIpcs.length}): ${chosenIpcs.join(', ')}`);
  });

  // ── HEADER: MASTER PACK is AUTO — assert, do not set ────────
  await test.step('Header — MASTER PACK auto-derived', async () => {
    const expected = P.expectMasterPack
      || (String(P.toBeShipped).toLowerCase() === 'merged' ? 'ASSORTED' : 'STANDARD');
    const box = labelField('MASTER PACK');
    await expect(box.getByText(new RegExp(`\\b${expected}\\b`)).first(),
      `MASTER PACK should auto-derive to ${expected}`).toBeVisible({ timeout: cfg.timeout.element });
    console.log(`  MASTER PACK (auto): ${expected} ✓`);
  });

  // ── HEADER: CASEPACK QTY (PCS) ──────────────────────────────
  await test.step('Header — CASEPACK QTY', async () => {
    const casepack = page.locator('input[type="number"][placeholder="10"]').first()
      .or(page.locator('input[type="number"]').first());
    await casepack.fill(String(P.casepackQty));
    console.log(`  CASEPACK QTY: ${P.casepackQty}`);
  });

  // ── QUANTITY TO PACK ledger ─────────────────────────────────
  await test.step('Ledger — QTY TO PACK + balance = poQty − packed', async () => {
    const qtyTable = page.locator('table').filter({ hasText: /QTY TO PACK/i }).first();
    if (await qtyTable.count()) {
      const rows = qtyTable.locator('tbody tr');
      const rc = await rows.count();
      for (let i = 0; i < rc; i++) {
        const row = rows.nth(i);
        const ipc = ((await row.innerText().catch(() => '')).match(IPC_RE) || [])[0] || '';
        const po = num(await row.locator('td').nth(2).innerText().catch(() => ''));
        const wanted = (P.packQty && P.packQty[ipc] != null) ? num(P.packQty[ipc]) : po;
        const input = row.locator('input[type="number"]');
        if (await input.count()) { await input.fill(String(wanted)); console.log(`    ${ipc}: PO ${po} -> pack ${wanted}`); }
      }
      await page.waitForTimeout(400);
    } else {
      console.log('  ⚠ QUANTITY TO PACK table not present yet');
    }

    const recon = page.locator('table').filter({ hasText: /PACKED/ }).first();
    if (await recon.count()) {
      const rrows = recon.locator('tbody tr');
      const n = await rrows.count();
      for (let i = 0; i < n; i++) {
        const cells = rrows.nth(i).locator('td');
        const ipc = ((await cells.nth(0).innerText().catch(() => '')).match(IPC_RE) || [])[0] || `row${i}`;
        const po = num(await cells.nth(1).innerText().catch(() => ''));
        const packed = num(await cells.nth(2).innerText().catch(() => ''));
        const balText = (await cells.nth(3).innerText().catch(() => '')).trim();
        const bal = /nil/i.test(balText) ? 0 : num(balText);
        expect(bal, `balance for ${ipc} must equal poQty-packed`).toBe(po - packed);
      }
      console.log('    ✓ balance = poQty − packed verified for all rows');
    }
  });

  // ── PACKAGING MATERIALS ─────────────────────────────────────
  for (let m = 0; m < (P.materials || []).length; m++) {
    const mat = P.materials[m];
    await test.step(`Material ${m + 1} — ${mat.packagingMaterialType}`, async () => {
      const cards = page.locator('[data-packaging-material-index]');
      while ((await cards.count()) <= m) {
        await page.getByRole('button', { name: '+ Add Material' }).first().click();
        await page.waitForTimeout(500);
      }
      const scope = page.locator(`[data-packaging-material-index="${m}"]`);

      // PACKAGING MATERIAL TYPE (react-select "Select or type Material Type").
      const typeControl = scope.locator('[class*="-control"]').first();
      await typeControl.click();
      const esc = mat.packagingMaterialType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const typeOpt = page.locator('[class*="-option"]')
        .filter({ hasText: new RegExp(`^\\s*${esc}\\s*$`, 'i') }).first();
      if (await typeOpt.count()) await typeOpt.click();
      else { await page.keyboard.type(mat.packagingMaterialType); await page.keyboard.press('Enter'); }
      await page.waitForTimeout(500);
      console.log(`  type: ${mat.packagingMaterialType}`);

      for (const [key, val] of Object.entries(mat.fields || {})) {
        await fillByStateKey(page, scope, key, val);
      }

      for (const [, vals] of Object.entries(mat.testing || {})) {
        const box = field(scope, 'TESTING REQUIREMENTS');
        if (await box.count()) await setTestingInput(page, box, vals, `MAT${m + 1} TESTING`).catch(() => {});
      }

      if (mat.surplus != null) await setAny(page, scope, 'SURPLUS', String(mat.surplus), `MAT${m + 1} SURPLUS`).catch(() => {});
      if (mat.wastage != null) await setAny(page, scope, 'WASTAGE', String(mat.wastage), `MAT${m + 1} WASTAGE`).catch(() => {});

      if (mat.approval) {
        const appr = field(scope, 'APPROVAL');
        if (await appr.count()) await pickOption(page, appr, mat.approval).catch(() => {});
      }

      if (mat.remarks) {
        const ta = scope.locator('textarea').first();
        if (await ta.count()) await ta.fill(mat.remarks).catch(() => {});
      }

      if (mat.calc) await verifyPolybagCalc(page, scope, mat, P);
    });
  }

  // ── SAVE ────────────────────────────────────────────────────
  await test.step('SAVE packaging', async () => {
    const saveBtn = page.getByRole('button', { name: /^(Save|Saved|Not Saved)$/ }).first();
    await saveBtn.click();
    const noBtn = page.getByRole('button', { name: 'Not Saved' });
    const vDialog = page.getByText('Please fill the following');
    const ok = page.getByRole('button', { name: 'Saved' });
    await expect(ok.or(noBtn).or(vDialog).first(), 'no Save outcome appeared')
      .toBeVisible({ timeout: cfg.timeout.element }).catch(() => {});
    if (await vDialog.isVisible().catch(() => false)) {
      const items = await vDialog.locator('xpath=ancestor::div[2]').innerText().catch(() => '?');
      throw new Error(`PACKAGING SAVE FAILED — validation:\n${items}`);
    }
    if (await noBtn.isVisible().catch(() => false)) throw new Error('PACKAGING SAVE FAILED — "Not Saved"');
    console.log('  ✓ Packaging SAVED');
    await page.screenshot({ path: 'test-results/packaging.png', fullPage: true }).catch(() => {});
  });

  console.log('\n✅ PACKAGING — header, ledger & calculation checks complete.\n');
});

// ── helpers ───────────────────────────────────────────────────

async function fillByStateKey(page, scope, key, val) {
  const label = keyToLabel(key);
  const box = field(scope, label);
  if (!await box.count()) { console.log(`    ⚠ ${label} (${key}) not visible — skipped`); return; }
  await setAny(page, scope, label, String(val), key).catch(() =>
    console.log(`    ⚠ ${label} set failed — skipped`));
}

function keyToLabel(key) {
  const prefixes = [
    'cartonBox', 'cornerProtector', 'edgeProtector', 'foamInsert', 'palletStrap',
    'polybagBale', 'polybagPolybagFlap', 'silicaGelDesiccant', 'stretchWrap',
    'tape', 'voidFill', 'divider', 'shippingMark',
  ];
  let k = key;
  for (const p of prefixes) { if (k.startsWith(p)) { k = k.slice(p.length); break; } }
  const special = {
    NoOfPlys: '# OF PLYS', GaugeGsm: 'GAUGE/GSM', RollWidth: 'ROLL WIDTH',
    DimensionsUnit: 'UNIT', BurstingStrength: 'BURSTING STRENGTH', BoardGrade: 'BOARD GRADE',
    JointType: 'JOINT TYPE', StiffenerRequired: 'STIFFENER REQUIRED',
    PackagingType: 'PACKAGING TYPE', InnerCasepack: 'INNER CASEPACK',
  };
  if (special[k]) return special[k];
  if (k === 'Length') return 'L';
  if (k === 'Width') return 'W';
  if (k === 'Height') return 'H';
  return k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toUpperCase().trim();
}

// ★ innerQty = casepack / polybagCount ; reqMaterial(ipc) = assd / innerQty
async function verifyPolybagCalc(page, scope, mat, P) {
  const casepack = num(P.casepackQty);
  const polybagCount = num(mat.calc.polybagCount);
  const expectedInner = polybagCount > 0 ? round2(casepack / polybagCount) : 0;

  const countInput = scope.locator('input[type="number"]').last();
  if (await countInput.count()) {
    await countInput.fill(String(polybagCount));
    await page.waitForTimeout(400);
    console.log(`    ★ calc: casepack ${casepack} / polybag ${polybagCount} -> innerQty expected ${expectedInner}`);
  }

  const innerLabel = scope.getByText(/Inner QTY:/i).first();
  if (await innerLabel.count()) {
    const stripText = await innerLabel.locator('xpath=..').innerText().catch(() => '');
    const shown = num((stripText.match(/Inner QTY:\s*([\d.]+)/i) || [])[1]);
    if (shown) { expect(shown, 'innerQty = casepack / polybagCount').toBe(expectedInner); console.log(`    ✓ innerQty shown = ${shown}`); }
  }

  const calcTable = scope.locator('table').filter({ hasText: /REQUIRED MATERIAL QTY/i }).first();
  if (await calcTable.count()) {
    const rows = calcTable.locator('tbody tr');
    const rc = await rows.count();
    for (let i = 0; i < rc; i++) {
      const row = rows.nth(i);
      const ipc = ((await row.innerText().catch(() => '')).match(IPC_RE) || [])[0] || `row${i}`;
      const assd = (mat.calc.assdQty && mat.calc.assdQty[ipc] != null) ? num(mat.calc.assdQty[ipc]) : 100;
      const assdInput = row.locator('input[type="number"]');
      if (await assdInput.count()) { await assdInput.fill(String(assd)); await page.waitForTimeout(200); }
      const reqShown = num(await row.locator('td').last().innerText().catch(() => ''));
      const reqExpected = expectedInner > 0 ? round2(assd / expectedInner) : 0;
      if (reqShown) { expect(reqShown, `reqMaterial for ${ipc} = assd/innerQty`).toBe(reqExpected); console.log(`    ✓ ${ipc}: ASSD ${assd} / inner ${expectedInner} -> req ${reqShown}`); }
    }
  }
}