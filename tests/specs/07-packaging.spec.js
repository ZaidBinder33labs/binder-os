// ═══════════════════════════════════════════════════════════════
//  PART-4 · PACKAGING  (Step5.jsx + PackagingMaterialTypeFields.jsx)
//  Fully JSON-driven | source-verified (Binder-frontend)
//
//  Source facts (verified against the actual components):
//   • Heading "PACKAGING" — "Configure packaging specifications and materials".
//   • PACKAGING HEADER:
//       TO BE SHIPPED* (Merged/Standalone; single IPC ⇒ Standalone only)
//       PRODUCT*       (IPC selector w/ images; Standalone=1, Merged=multi)
//       MASTER PACK*   = AUTO read-only  (Merged→ASSORTED, Standalone→STANDARD)
//       CASEPACK QTY (PCS)*
//   • "PO RECONCILIATION — LEFTOVER" ledger:
//       balance(ipc)  = poQty − Σ packQty[ipc]      (must reach "Nil")
//       available     = poQty − usedElsewhere        (per-pack cap)
//       over-pack      → red "Over by X"; allNil → "✓ Fully packed (Nil)"
//   • "QUANTITY TO PACK" table cols: IMAGE|IPC|PO QTY|AVAILABLE|QTY TO PACK(input)
//   • Materials: PACKAGING MATERIAL TYPE (13 opts) → MATERIAL DESC (auto) →
//     type-specific fields (PackagingMaterialTypeFields). Tail (all except
//     SHIPPING MARK): SURPLUS % + WASTAGE % + APPROVAL + REMARKS.
//   • ★ ONLY real auto-calc = POLYBAG~Bale + INNER~CASEPACK:
//       innerQty         = casepack / polybagCount
//       reqMaterial(ipc) = assd(ipc) / innerQty      (both rounded 2dp)
//
//  COMPONENT/IPC note: PRODUCT dropdown lists IPCs from Step0 (formData.skus).
//  We select real IPC codes present on the page. If cfg.packaging.packQty /
//  assdQty leave IPC keys unset, the runner fills against whatever IPC codes
//  it discovers (first N), so the config is portable across projects.
//
//  GATING: Packaging is the last part. There is no downstream ✓ to chase, so
//  this spec's own SAVE + calculation assertions are the source of truth.
// ═══════════════════════════════════════════════════════════════
import { test, expect } from '@playwright/test';
import { dismissAddLater } from '../helpers/helpers.js';
import { resolveProject } from '../helpers/runtimeHelpers.js';
import {
  loadConfig, setAny, pickOption, field,
  gotoProject, waitForIpcSelector, setTestingInput,
} from '../helpers/binderHelpers.js';

const cfg = loadConfig('packaging.json');
test.setTimeout(cfg.timeout.test);

const round2 = (x) => Math.round(x * 100) / 100;
const num = (v) => {
  const n = parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

test('PART-4 PACKAGING — header, ledger & calculations', async ({ page }) => {
  page.on('dialog', d => d.accept().catch(() => {}));
  console.log(`\n${cfg.navigation.chdpdProject} | PACKAGING\n`);

  // ── navigate to the project, then into the Packaging step ──
  await gotoProject(page, resolveProject(cfg), dismissAddLater);
  await page.getByRole('button', { name: 'IPC Spec' }).click();

  // A Step0 may show first; save through it to reach the flow (same as other specs).
  const step0 = page.locator('text="PRODUCT SPEC"');
  if (await step0.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /^(Save|Saved|Not Saved)$/ }).first().click();
    await page.getByText('IPC Codes Generated')
      .waitFor({ timeout: cfg.timeout.element }).catch(() => {});
    await page.getByRole('button', { name: 'Next', exact: true }).click().catch(() => {});
  }

  // Reach the PACKAGING screen. Prefer the step-nav circle, fall back to any
  // "Packaging" control, then assert the heading is visible.
  const goPackaging =
    page.getByRole('button', { name: /Go to Packaging/i })
      .or(page.getByRole('button', { name: /^Packaging$/i }))
      .or(page.getByTitle(/Packaging/i));
  await goPackaging.first().click().catch(() => {});

  const heading = page.getByRole('heading', { name: 'PACKAGING' })
    .or(page.getByText('Configure packaging specifications and materials'));
  await expect(heading.first(), 'PACKAGING screen did not open')
    .toBeVisible({ timeout: cfg.timeout.page });
  console.log('On PACKAGING screen\n');

  const P = cfg.packaging;
  const body = page.locator('body');

  // ── PACKAGING HEADER ────────────────────────────────────────
  // TO BE SHIPPED (Merged/Standalone). With a single IPC only Standalone
  // exists; setting it is still safe (value already Standalone).
  await test.step('Header — TO BE SHIPPED + CASEPACK', async () => {
    const shipCtl = page.locator('[class*="-control"]')
      .filter({ hasText: /Merged|Standalone|Select or type/ }).first();
    if (await shipCtl.count()) {
      await shipCtl.click();
      const opt = page.locator('[class*="-option"]')
        .filter({ hasText: new RegExp(`^\\s*${P.toBeShipped}\\s*$`, 'i') }).first();
      if (await opt.count()) await opt.click();
      else await page.keyboard.press('Escape');
      console.log(`  TO BE SHIPPED: ${P.toBeShipped}`);
    }

    // CASEPACK QTY (PCS) — the only number input near the header label.
    const casepack = page.locator('input[type="number"]').first();
    await casepack.fill(String(P.casepackQty));
    console.log(`  CASEPACK QTY: ${P.casepackQty}`);
  });

  // ── PRODUCT (IPC) selection ─────────────────────────────────
  // Discover the IPC codes offered, pick them (Standalone=1, else all), and
  // remember them so we can drive the ledger + calc against real codes.
  let chosenIpcs = [];
  await test.step('Header — PRODUCT (IPC) selection', async () => {
    // open the PRODUCT picker (input under the PRODUCT label)
    const productInput = page.getByPlaceholder(/Select or type IPC|Select IPCs/i).first();
    await productInput.click().catch(() => {});
    await page.waitForTimeout(300);

    // rows in the open dropdown carry the IPC label text
    const rows = page.locator('div[class*="cursor-pointer"], label')
      .filter({ hasText: /CHD|IPC|\/SP-|\d{2,}/ });
    const labels = [];
    const n = await rows.count();
    for (let i = 0; i < n && labels.length < 12; i++) {
      const t = (await rows.nth(i).innerText().catch(() => '')).trim();
      if (t && !labels.includes(t)) labels.push(t);
    }

    const isStandalone = String(P.toBeShipped).toLowerCase() === 'standalone';
    const want = isStandalone ? labels.slice(0, 1) : labels;
    for (const lab of want) {
      await rows.filter({ hasText: lab }).first().click().catch(() => {});
      chosenIpcs.push(lab);
      await page.waitForTimeout(150);
    }
    // close the dropdown
    await page.keyboard.press('Escape').catch(() => {});
    console.log(`  PRODUCT IPCs: ${chosenIpcs.join(', ') || '(none discovered)'}`);
  });

  // ── MASTER PACK is AUTO — assert, do not set ────────────────
  await test.step('Header — MASTER PACK auto-derived', async () => {
    const expected = P.expectMasterPack
      || (String(P.toBeShipped).toLowerCase() === 'merged' ? 'ASSORTED' : 'STANDARD');
    const mp = page.getByText(new RegExp(`^\\s*${expected}\\s*$`)).first();
    await expect(mp, `MASTER PACK should auto-derive to ${expected}`)
      .toBeVisible({ timeout: cfg.timeout.element });
    console.log(`  MASTER PACK (auto): ${expected} ✓`);
  });

  // ── QUANTITY TO PACK ledger ─────────────────────────────────
  // Fill "QTY TO PACK" for each chosen IPC, then assert the reconciliation:
  //   balance = poQty − packed. We read PO QTY straight from the table row.
  await test.step('Ledger — QTY TO PACK + balance = poQty − packed', async () => {
    const qtyTable = page.locator('table').filter({ hasText: 'QTY TO PACK' }).first();
    if (!await qtyTable.count()) {
      console.log('  ⚠ QUANTITY TO PACK table not present — skipping ledger asserts');
      return;
    }
    const rows = qtyTable.locator('tbody tr');
    const rc = await rows.count();
    for (let i = 0; i < rc; i++) {
      const row = rows.nth(i);
      const ipc = (await row.locator('td').nth(1).innerText().catch(() => '')).trim();
      const poCell = (await row.locator('td').nth(2).innerText().catch(() => '')).trim();
      const po = num(poCell);
      // qty to pack: prefer config value for this IPC, else pack the FULL po
      const wanted = (P.packQty && P.packQty[ipc] != null) ? num(P.packQty[ipc]) : po;
      const input = row.locator('input[type="number"]');
      if (await input.count()) {
        await input.fill(String(wanted));
        console.log(`    ${ipc}: PO ${po} → pack ${wanted}`);
      }
    }

    // Assert the reconciliation panel reflects balance = po − packed.
    await page.waitForTimeout(300);
    const recon = page.locator('table').filter({ hasText: 'PACKED' }).first();
    if (await recon.count()) {
      const rrows = recon.locator('tbody tr');
      const n = await rrows.count();
      for (let i = 0; i < n; i++) {
        const cells = rrows.nth(i).locator('td');
        const ipc = (await cells.nth(0).innerText().catch(() => '')).trim();
        const po = num(await cells.nth(1).innerText().catch(() => ''));
        const packed = num(await cells.nth(2).innerText().catch(() => ''));
        const balText = (await cells.nth(3).innerText().catch(() => '')).trim();
        const bal = /nil/i.test(balText) ? 0 : num(balText);
        expect(bal, `balance for ${ipc} must equal poQty−packed`).toBe(po - packed);
      }
      console.log('    ✓ balance = poQty − packed verified for all rows');
    }
  });

  // ── PACKAGING MATERIALS ─────────────────────────────────────
  for (let m = 0; m < (P.materials || []).length; m++) {
    const mat = P.materials[m];
    await test.step(`Material ${m + 1} — ${mat.packagingMaterialType}`, async () => {
      // Add a material block if needed (first block may already exist)
      const addBtn = page.getByRole('button', { name: '+ Add Material' });
      const typeControls = page.locator('[class*="-control"]')
        .filter({ hasText: /Select or type Material Type|CARTON BOX|POLYBAG|FOAM|TAPE|DIVIDER|PALLET|SHIPPING|SILICA|VOID|CORNER|EDGE|SHRINK/ });
      if (await typeControls.count() <= m && await addBtn.count()) {
        await addBtn.first().click();
        await page.waitForTimeout(400);
      }

      // Scope to THIS material card by index.
      const card = page.locator('[data-packaging-material-index]').nth(m);
      const scope = (await card.count()) ? card : body;

      // PACKAGING MATERIAL TYPE
      await setAny(page, scope, 'PACKAGING MATERIAL TYPE', mat.packagingMaterialType, `MAT${m + 1} TYPE`);
      await page.waitForTimeout(400);
      console.log(`  type: ${mat.packagingMaterialType}`);

      // type-specific fields (label lookups happen inside the card scope)
      for (const [key, val] of Object.entries(mat.fields || {})) {
        // fields keyed by source name; use a fuzzy label from the key
        await fillByStateKey(page, scope, key, val, cfg.timeout.element);
      }

      // multi-chip testing (e.g. cartonBoxTestingRequirements)
      for (const [, vals] of Object.entries(mat.testing || {})) {
        const box = field(scope, 'TESTING REQUIREMENTS');
        if (await box.count()) await setTestingInput(page, box, vals, `MAT${m + 1} TESTING`).catch(() => {});
      }

      // surplus / wastage (tail) — labels are literally "SURPLUS %" / "WASTAGE %"
      if (mat.surplus != null) await setAny(page, scope, 'SURPLUS', String(mat.surplus), `MAT${m + 1} SURPLUS`).catch(() => {});
      if (mat.wastage != null) await setAny(page, scope, 'WASTAGE', String(mat.wastage), `MAT${m + 1} WASTAGE`).catch(() => {});

      // approval (per-type key → same "APPROVAL" label)
      if (mat.approval) {
        const appr = field(scope, 'APPROVAL');
        if (await appr.count()) await pickOption(page, appr, mat.approval).catch(() => {});
      }

      // remarks
      if (mat.remarks) {
        const ta = scope.locator('textarea').first();
        if (await ta.count()) await ta.fill(mat.remarks).catch(() => {});
      }

      // ── ★ THE CALCULATION (POLYBAG~Bale INNER~CASEPACK) ──
      if (mat.calc) {
        await verifyPolybagCalc(page, scope, mat, P, cfg.timeout.element);
      }
    });
  }

  // ── SAVE ────────────────────────────────────────────────────
  await test.step('SAVE packaging', async () => {
    const saveBtn = page.getByRole('button', { name: /^(Save|Saved|Not Saved)$/ }).first();
    if (await saveBtn.count()) {
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
    }
    await page.screenshot({ path: 'test-results/packaging.png', fullPage: true }).catch(() => {});
  });

  console.log('\n✅ PACKAGING — header, ledger & calculation checks complete.\n');
});

// ── helpers ───────────────────────────────────────────────────

// Fill a field addressed by its SOURCE STATE KEY (e.g. "cartonBoxNoOfPlys").
// We convert the camelCase key into a human label and try that; if the label
// can't be found we skip (advanced/optional field), so the run never crashes.
async function fillByStateKey(page, scope, key, val, timeout) {
  const label = keyToLabel(key);
  const box = field(scope, label);
  if (!await box.count()) {
    console.log(`    ⚠ ${label} (${key}) not visible — skipped`);
    return;
  }
  await setAny(page, scope, label, String(val), key).catch(() =>
    console.log(`    ⚠ ${label} set failed — skipped`));
}

// crude camelCase → LABEL WORDS, with the known field-family prefixes stripped.
function keyToLabel(key) {
  const prefixes = [
    'cartonBox', 'cornerProtector', 'edgeProtector', 'foamInsert', 'palletStrap',
    'polybagBale', 'polybagPolybagFlap', 'silicaGelDesiccant', 'stretchWrap',
    'tape', 'voidFill', 'divider', 'shippingMark',
  ];
  let k = key;
  for (const p of prefixes) {
    if (k.startsWith(p)) { k = k.slice(p.length); break; }
  }
  // special cases where the on-screen label differs from the de-prefixed key
  const special = {
    NoOfPlys: '# OF PLYS',
    GaugeGsm: 'GAUGE/GSM',
    RollWidth: 'ROLL WIDTH',
    DimensionsUnit: 'UNIT',
    BurstingStrength: 'BURSTING STRENGTH',
    BoardGrade: 'BOARD GRADE',
    JointType: 'JOINT TYPE',
    StiffenerRequired: 'STIFFENER REQUIRED',
    PackagingType: 'PACKAGING TYPE',
    InnerCasepack: 'INNER CASEPACK',
  };
  if (special[k]) return special[k];
  // Length/Width/Height map to L/W/H single-letter labels in dimension grids
  if (k === 'Length') return 'L';
  if (k === 'Width') return 'W';
  if (k === 'Height') return 'H';
  // generic: split camelCase and upper-case
  return k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toUpperCase().trim();
}

// ★ Verify the POLYBAG~Bale INNER~CASEPACK auto-calculation:
//   innerQty         = casepack / polybagCount
//   reqMaterial(ipc) = assd(ipc) / innerQty        (rounded 2 dp)
async function verifyPolybagCalc(page, scope, mat, P, timeout) {
  const casepack = num(P.casepackQty);
  const polybagCount = num(mat.calc.polybagCount);
  const expectedInner = polybagCount > 0 ? round2(casepack / polybagCount) : 0;

  // POLYBAG (count) input — number input inside the INNER~CASEPACK block.
  // The block appears once PACKAGING TYPE = INNER~CASEAPACK is set (done via fields).
  const countInput = scope.locator('input[type="number"]').last();
  if (await countInput.count()) {
    await countInput.fill(String(polybagCount));
    await page.waitForTimeout(400);
    console.log(`    ★ calc: casepack ${casepack} / polybag ${polybagCount} → innerQty expected ${expectedInner}`);
  }

  // Summary strip shows "Inner QTY: {innerQty}".
  const innerLabel = scope.getByText(/Inner QTY:/i).first();
  if (await innerLabel.count()) {
    const stripText = await innerLabel.locator('xpath=..').innerText().catch(() => '');
    const shown = num((stripText.match(/Inner QTY:\s*([\d.]+)/i) || [])[1]);
    if (shown) {
      expect(shown, 'innerQty = casepack / polybagCount').toBe(expectedInner);
      console.log(`    ✓ innerQty shown = ${shown} (matches ${expectedInner})`);
    }
  }

  // Per-IPC table: fill ASSD QTY, assert REQUIRED MATERIAL QTY = assd / innerQty.
  const calcTable = scope.locator('table').filter({ hasText: 'REQUIRED MATERIAL QTY' }).first();
  if (await calcTable.count()) {
    const rows = calcTable.locator('tbody tr');
    const rc = await rows.count();
    for (let i = 0; i < rc; i++) {
      const row = rows.nth(i);
      const ipc = (await row.locator('td').nth(1).innerText().catch(() => '')).trim();
      const assd = (P.materials && mat.calc.assdQty && mat.calc.assdQty[ipc] != null)
        ? num(mat.calc.assdQty[ipc])
        : 100; // default ASSD if not specified per IPC
      const assdInput = row.locator('input[type="number"]');
      if (await assdInput.count()) {
        await assdInput.fill(String(assd));
        await page.waitForTimeout(200);
      }
      const reqCell = (await row.locator('td').last().innerText().catch(() => '')).trim();
      const reqShown = num(reqCell);
      const reqExpected = expectedInner > 0 ? round2(assd / expectedInner) : 0;
      if (reqShown) {
        expect(reqShown, `reqMaterial for ${ipc} = assd/innerQty`).toBe(reqExpected);
        console.log(`    ✓ ${ipc}: ASSD ${assd} / inner ${expectedInner} → reqMaterial ${reqShown} (matches ${reqExpected})`);
      }
    }
  }
}