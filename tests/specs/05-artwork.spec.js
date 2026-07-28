// ═══════════════════════════════════════════════════════════════
//  PART-2 · ARTWORK & LABELING  (Step4.jsx)
//  Fully JSON-driven | source-verified
//
//  Source facts:
//   • Heading "PART-2 ARTWORK & LABELING"
//   • COMPONENT dropdown (top) → "+ Add Artwork Material"
//   • Per material: ARTWORK CATEGORY (TenantDropdown, 17 options) → fields
//   • ARTWORK IS OPTIONAL (source: "artwork/labeling is optional",
//     "No at least one material required"). Isliye JSON me:
//       - components: []  ya skip:true  → sirf ✓ mark (kuch nahi bharo)
//       - components with artworks[]    → categories bharo
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

  // navigate → IPC selector (BOM pehle ho chuka hona chahiye)
  await gotoProject(page, resolveProject(cfg), dismissAddLater);
  await page.getByRole('button', { name: 'IPC Spec' }).click();

  const step0 = page.locator('text="PRODUCT SPEC"');
  const selector = page.getByText('Select SKU to proceed');
  await expect(step0.or(selector).first(), 'na PRODUCT SPEC na selector')
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

    // ── PEHLE ensure ipcFlow load hua (BOM step render ho gaya) ──
    // Source: switch(currentStep) — case 0=Step2(BOM), case 1=Step4(Artwork).
    // Sirf EK step render hota hai. Stepper button click => setCurrentStep(1).
    await expect(page.getByRole('heading', { name: /PART-1 BOM/i }).or(page.getByText('Select component')).first(),
      'ipcFlow (BOM step) load nahi hua').toBeVisible({ timeout: cfg.timeout.page });

    // ── Step 1 (BOM) se Step 2 (Artwork) pe shift ──
    // Source: <button title="Go to Artwork & Labeling"> (progress bar circle)
    const artworkBtn = page.locator('button[title*="Artwork"]').first();
    await expect(artworkBtn, 'Artwork step-button (title) nahi mila').toBeVisible({ timeout: cfg.timeout.element });
    await artworkBtn.scrollIntoViewIfNeeded();

    // click + verify currentStep badla: BOM title JAAYE, Artwork title AAYE
    for (let tryClick = 1; tryClick <= 3; tryClick++) {
      await artworkBtn.click();
      await page.waitForTimeout(600);
      if (await page.getByRole('heading', { name: /PART-2 ARTWORK/i }).isVisible().catch(()=>false)) break;
      console.log(`     ↻ step-click retry ${tryClick}/3`);
    }

    // ── VERIFY (Part-1 jaisa): title + subtitle + COMPONENT dikhe ──
    // '&' ke liye regex (getByText exact '&' pe flaky hota hai)
    await expect(page.getByRole('heading', { name: /PART-2 ARTWORK/i }),
      'Artwork title nahi dikha — step shift fail').toBeVisible({ timeout: cfg.timeout.page });
    await expect(page.getByText(/Artwork .* packaging materials/i),
      'Artwork subtitle nahi dikha').toBeVisible();
    await expect(field(scopeAll(page), 'COMPONENT').first(),
      'COMPONENT dropdown nahi dikha').toBeVisible();
    console.log('  ✓ PART-2 ARTWORK & LABELING screen verified');

    const arts = job.artworks ?? [];
    if (arts.length === 0) {
      console.log('  (artwork optional — skip, sirf save)');
    }

    for (let a = 0; a < arts.length; a++) {
      const art = arts[a];
      const scope = scopeAll(page);

      // COMPONENT select
      if (art.component) await setAny(page, scope, 'COMPONENT', art.component, 'COMPONENT');

      // Add Artwork Material — har artwork ke liye ek naya material card.
      // Pehli baar bhi "Add" chahiye (empty state me sirf button dikhta hai).
      const addBtn = page.getByRole('button', { name: '+ Add Artwork Material' });
      if (await addBtn.isVisible().catch(()=>false)) {
        await addBtn.click();
        await page.waitForTimeout(500);
      }

      // ARTWORK CATEGORY
      await setAny(page, scope, 'ARTWORK CATEGORY', art.category, `CATEGORY`);
      console.log(`  category: ${art.category}`);
      await page.waitForTimeout(400);

      // category ke fields — source-exact handling
      const f = art.fields ?? {};

      // SIZE = width + height + sizeUnit (3 alag input, ek SIZE row me)
      if (f.width)    await page.getByPlaceholder(/width/i).first().fill(String(f.width));
      if (f.height)   await page.getByPlaceholder(/height/i).first().fill(String(f.height));
      // SIZE UNIT = TenantDropdown (react-select), values CM/KGS/PCS (source).
      // HEIGHT input ke turant baad wala react-select control.
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
      // UNIT label ke neeche wala select. Pehli "Select" option skip karke value set.
      if (f.qtyUnit) {
        const unitSelect = field(scope, 'UNIT').locator('select').first()
          .or(page.locator('select').filter({ hasText: /Select|CM|KGS|PCS/ }).last());
        if (await unitSelect.count()) {
          await unitSelect.selectOption({ label: f.qtyUnit }).catch(async () =>
            await unitSelect.selectOption(f.qtyUnit).catch(()=>{}));
          console.log(`     QTY UNIT: ${f.qtyUnit}`);
        }
      }

      // baaki fields (label se)
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
          // ARTWORK TESTING = MultiSelectDropdown (BOM se alag widget)
          await setMultiSelect(page, field(scope, lab), val, lab);
          console.log(`     ${lab}: [${val.join(', ')}]`);
        } else {
          await setAny(page, scope, lab, val, lab);
          console.log(`     ${lab}: ${val}`);
        }
      }

      // ── SAVE (har component ke baad — Part-1 jaisa) ──
      await page.getByRole('button', { name: /^(Save|Saved|Not Saved)$/ }).first().click();
      const vDialog = page.getByText('Please fill the following');
      const okBtn = page.getByRole('button', { name: 'Saved' });
      const noBtn = page.getByRole('button', { name: 'Not Saved' });
      await expect(okBtn.or(noBtn).or(vDialog).first(), 'save outcome nahi').toBeVisible({ timeout: cfg.timeout.element });
      if (await vDialog.isVisible().catch(() => false)) {
        const items = await vDialog.locator('xpath=ancestor::div[2]').innerText().catch(() => '?');
        throw new Error(`SAVE FAIL (${art.component}) — validation:\n${items}`);
      }
      if (await noBtn.isVisible().catch(() => false)) throw new Error(`SAVE FAIL (${art.component}) — Not Saved`);
      console.log(`  ✓ SAVED: ${art.component}\n`);
    }

    await page.getByRole('button', { name: 'IPC Selector' }).first().click().catch(() => {});
    await waitForIpcSelector(page, cfg.timeout.page).catch(() => {});
  }

  const rep = await reportAllIpc(page);
  console.log(`✅ ARTWORK — Artwork ${rep.artwork}/${rep.total} IPC\n`);
});