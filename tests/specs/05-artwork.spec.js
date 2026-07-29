// ═══════════════════════════════════════════════════════════════
//  PART-2 · ARTWORK & LABELING  (Step4.jsx)
//  Fully JSON-driven | source-verified
//
//  Source facts:
//   • Heading "PART-2 ARTWORK & LABELING"
//   • COMPONENT dropdown (top) → "+ Add Artwork Material"
//   • Per material: ARTWORK CATEGORY (TenantDropdown, 17 options) → fields
//   • ARTWORK IS OPTIONAL (source: "artwork/labeling is optional",
//     "No at least one material required"). So in the JSON:
//       - components: []  or skip:true  → just mark ✓ (fill nothing)
//       - components with artworks[]    → fill categories
//   • 17 categories: LabelsBrand, CareComposition, RfidSecurity, LawLabel,
//     HangTagSeals, HeatTransfer, UpcBarcode, PriceTicket, AntiCounterfeit,
//     QcInspection, BellyBand, SizeLabels, TagsSpecial, FlammabilitySafety,
//     InsertCards, HeaderCard, Ribbons
// ═══════════════════════════════════════════════════════════════
import { test, expect } from '@playwright/test';
import { dismissAddLater } from '../helpers/helpers.js';
import { uploadFile } from '../helpers/formHelpers.js';
import { resolveProject } from '../helpers/runtimeHelpers.js';
import {
  loadConfig, tpl, setAny, pickOption, field,
  gotoProject, waitForIpcSelector, listIpcCards, openIpc,
  expectIpcStep, setTestingInput,
  reportAllIpc, setMultiSelect,
} from '../helpers/binderHelpers.js';

const cfg = loadConfig('artwork.json');
test.setTimeout(cfg.timeout.test);
const scopeAll = (page) => page.locator('body');

test(`PART-2 ARTWORK — ${cfg.ipcs.length} IPC(s)`, async ({ page }) => {
  page.on('dialog', d => d.accept().catch(() => {}));
  console.log(`\n${cfg.navigation.chdpdProject} | ARTWORK\n`);

  // navigate → IPC selector (BOM must be done first)
  await gotoProject(page, resolveProject(cfg), dismissAddLater);
  await page.getByRole('button', { name: 'IPC Spec' }).click();

  const step0 = page.locator('text="PRODUCT SPEC"');
  const selector = page.getByText('Select SKU to proceed');
  await expect(step0.or(selector).first(), 'neither PRODUCT SPEC nor selector')
    .toBeVisible({ timeout: cfg.timeout.page });
  if (await step0.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /^(Save|Saved|Not Saved)$/ }).first().click();
    const popup = page.getByText('IPC Codes Generated');
    await expect(popup).toBeVisible({ timeout: cfg.timeout.element });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await waitForIpcSelector(page, cfg.timeout.page);
  console.log(`IPC cards: ${await (await listIpcCards(page)).count()}\n`);

  for (const job of cfg.ipcs) {
    console.log(`── IPC index ${job.ipcIndex} ──────────────`);
    await openIpc(page, job.ipcIndex);

    // ── FIRST ensure ipcFlow loaded (BOM step rendered) ──
    // Source: switch(currentStep) — case 0=Step2(BOM), case 1=Step4(Artwork).
    // Only ONE step renders. Clicking the stepper button => setCurrentStep(1).
    await expect(page.getByRole('heading', { name: /PART-1 BOM/i }).or(page.getByText('Select component')).first(),
      'ipcFlow (BOM step) did not load').toBeVisible({ timeout: cfg.timeout.page });

    // ── shift from Step 1 (BOM) to Step 2 (Artwork) ──
    // Source: <button title="Go to Artwork & Labeling"> (progress bar circle)
    const artworkBtn = page.locator('button[title*="Artwork"]').first();
    await expect(artworkBtn, 'Artwork step-button (title) not found').toBeVisible({ timeout: cfg.timeout.element });
    await artworkBtn.scrollIntoViewIfNeeded();

    // click + verify currentStep changed: BOM title GONE, Artwork title PRESENT
    for (let tryClick = 1; tryClick <= 3; tryClick++) {
      await artworkBtn.click();
      await page.waitForTimeout(600);
      if (await page.getByRole('heading', { name: /PART-2 ARTWORK/i }).isVisible().catch(()=>false)) break;
      console.log(`     ↻ step-click retry ${tryClick}/3`);
    }

    // ── VERIFY (like Part-1): title + subtitle + COMPONENT visible ──
    // regex for '&' (getByText is flaky on exact '&')
    await expect(page.getByRole('heading', { name: /PART-2 ARTWORK/i }),
      'Artwork title not visible — step shift failed').toBeVisible({ timeout: cfg.timeout.page });
    await expect(page.getByText(/Artwork .* packaging materials/i),
      'Artwork subtitle not visible').toBeVisible();
    await expect(field(scopeAll(page), 'COMPONENT').first(),
      'COMPONENT dropdown not visible').toBeVisible();
    console.log('  ✓ PART-2 ARTWORK & LABELING screen verified');

    const arts = job.artworks ?? [];
    if (arts.length === 0) {
      console.log('  (artwork optional — skip, save only)');
    }

    for (let a = 0; a < arts.length; a++) {
      const art = arts[a];
      const scope = scopeAll(page);

      // COMPONENT select
      if (art.component) await setAny(page, scope, 'COMPONENT', art.component, 'COMPONENT');

      // Add Artwork Material — a new material card for each artwork.
      // Needed the first time too (empty state shows only the button).
      const addBtn = page.getByRole('button', { name: '+ Add Artwork Material' });
      if (await addBtn.isVisible().catch(()=>false)) {
        await addBtn.click();
        await page.waitForTimeout(500);
      }

      // ARTWORK CATEGORY
      await setAny(page, scope, 'ARTWORK CATEGORY', art.category, `CATEGORY`);
      console.log(`  category: ${art.category}`);
      await page.waitForTimeout(400);

      // category fields — source-exact handling
      const f = art.fields ?? {};

      // SIZE = width + height + sizeUnit (3 separate inputs, one SIZE row)
      if (f.width)    await page.getByPlaceholder(/width/i).first().fill(String(f.width));
      if (f.height)   await page.getByPlaceholder(/height/i).first().fill(String(f.height));
      // SIZE UNIT = TenantDropdown (react-select), values CM/KGS/PCS (source).
      // The react-select control right after the HEIGHT input.
      if (f.sizeUnit) {
        const heightBox = page.getByPlaceholder(/height/i).first();
        const sizeUnitCtrl = heightBox.locator(
          'xpath=following::div[contains(@class,"-control")][1]'
        );
        if (await sizeUnitCtrl.count()) {
          await pickOption(page, sizeUnitCtrl, f.sizeUnit, 'SIZE UNIT');
        }
      }
      if (f.width || f.height) console.log(`     SIZE: ${f.width}x${f.height} ${f.sizeUnit||''}`);

      // QTY UNIT = native <select> with CM/KGS/PCS (source: ARTWORK_QTY_UNIT_OPTIONS).
      // The select under the UNIT label. Skip the first "Select" option and set the value.
      if (f.qtyUnit) {
        const unitSelect = field(scope, 'UNIT').locator('select').first()
          .or(page.locator('select').filter({ hasText: /Select|CM|KGS|PCS/ }).last());
        if (await unitSelect.count()) {
          await unitSelect.selectOption({ label: f.qtyUnit }).catch(async () =>
            await unitSelect.selectOption(f.qtyUnit).catch(()=>{}));
          console.log(`     QTY UNIT: ${f.qtyUnit}`);
        }
      }

      // remaining fields (by label)
      const skip = new Set(['width','height','sizeUnit','qtyUnit']);
      for (const [lab, val] of Object.entries(f)) {
        if (skip.has(lab)) continue;
        if (val === '__UPLOAD__') {
          await uploadFile(page, `art-${job.ipcIndex}-${a}`, scope);
          console.log(`     ${lab}: uploaded`);
        } else if (val === 'Yes' || val === 'No') {
          await page.getByRole('radio', { name: val }).last().check().catch(() => {});
          console.log(`     ${lab}: ${val}`);
        } else if (Array.isArray(val)) {
          // ARTWORK TESTING = MultiSelectDropdown (a different widget from BOM)
          await setMultiSelect(page, field(scope, lab), val, lab);
          console.log(`     ${lab}: [${val.join(', ')}]`);
        } else {
          await setAny(page, scope, lab, val, lab);
          console.log(`     ${lab}: ${val}`);
        }
      }

      // ── SAVE (after each component — like Part-1) ──
      await page.getByRole('button', { name: /^(Save|Saved|Not Saved)$/ }).first().click();
      const vDialog = page.getByText('Please fill the following');
      const okBtn = page.getByRole('button', { name: 'Saved' });
      const noBtn = page.getByRole('button', { name: 'Not Saved' });
      await expect(okBtn.or(noBtn).or(vDialog).first(), 'no save outcome').toBeVisible({ timeout: cfg.timeout.element });
      if (await vDialog.isVisible().catch(() => false)) {
        const items = await vDialog.locator('xpath=ancestor::div[2]').innerText().catch(() => '?');
        throw new Error(`SAVE FAILED (${art.component}) — validation:\n${items}`);
      }
      if (await noBtn.isVisible().catch(() => false)) throw new Error(`SAVE FAILED (${art.component}) — Not Saved`);
      console.log(`  ✓ SAVED: ${art.component}\n`);
    }

    await page.getByRole('button', { name: 'IPC Selector' }).first().click().catch(() => {});
    await waitForIpcSelector(page, cfg.timeout.page).catch(() => {});
  }

  const rep = await reportAllIpc(page);
  console.log(`✅ ARTWORK — Artwork ${rep.artwork}/${rep.total} IPC\n`);
});