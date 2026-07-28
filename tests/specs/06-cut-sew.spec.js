// ═══════════════════════════════════════════════════════════════
//  PART-3 · CUT, SEW & FINISHING  (Step1.jsx — ipcFlow step index 2)
//  Fully JSON-driven | source-verified (Binder-frontend)
//
//  Source facts (verified against actual components):
//   • ipcFlowStepLabels = ['BOM & WO','Artwork & Labeling','Cut & Sew Spec']
//     → Cut & Sew Spec is rendered by Step1.jsx (NOT Step5 = Packaging).
//   • Heading  "PART-3 CUT, SEW & FINISHING"
//     Subtitle "Cutting, sewing and finishing specifications per component"
//   • 3 tabs: <button>Cutting</button> | Sewing | Finishing.
//     Cutting/Sewing each: Section-1 (spec) [DEFAULT] + Section-2 (process).
//   • Step nav circle to reach it: <button title="Go to Cut & Sew Spec">.
//
//  COMPLETION RULE (handleSaveStep1, GenerateFactoryCode.jsx ~2825):
//     validateStep1() is LENIENT (always valid — no hard-required fields),
//     BUT the IPC-card "Cut & Sew ✓" badge / packaging gate flag is stamped
//        cut: isFinishingComplete(stepData)
//     → cut becomes ✓ ONLY when EVERY FINISHING work order has a
//       process + at least one type. Cut/Sew SIZES & clubbing are OPTIONAL.
//   So: FINISHING is the mandatory, assertion-backed part here.
//       Cut/Sew sizes are filled BEST-EFFORT (logged, non-gating).
//
//  COMPONENT SELECTORS: unlike BOM (COMPONENT dropdown), the Cut/Sew Spec &
//  Finishing sections pick a component via chip BUTTONS under a
//  "Select component" label → click getByRole('button',{name}).
//
//  ASSUMPTION: each component has exactly ONE FINISHING work order (matches
//  BOM data: QUILTING/CUTTING/SEWING/FINISHING per component). If a component
//  ever has >1 FINISHING WO, extend the finishing loop to fill each card.
// ═══════════════════════════════════════════════════════════════
import { test, expect } from '@playwright/test';
import { dismissAddLater } from '../helpers/helpers.js';
import { resolveProject } from '../helpers/runtimeHelpers.js';
import {
  loadConfig, setAny, setSelect, pickOption, field,
  gotoProject, waitForIpcSelector, listIpcCards, openIpc,
  reportAllIpc, setMultiSelect, ipcStatus,
} from '../helpers/binderHelpers.js';

const cfg = loadConfig('cut-sew.json');
test.setTimeout(cfg.timeout.test);

const scopeAll = (page) => page.locator('body');

test(`PART-3 CUT & SEW — ${cfg.ipcs.length} IPC(s)`, async ({ page }) => {
  page.on('dialog', d => d.accept().catch(() => {}));
  console.log(`\n${cfg.navigation.chdpdProject} | CUT, SEW & FINISHING\n`);

  // ── navigate → IPC selector (BOM + Artwork pehle ho chuke hone chahiye) ──
  await gotoProject(page, resolveProject(cfg), dismissAddLater);
  await page.getByRole('button', { name: 'IPC Spec' }).click();

  const step0 = page.locator('text="PRODUCT SPEC"');
  const selector = page.getByText('Select SKU to proceed');
  await expect(step0.or(selector).first(), 'na PRODUCT SPEC na IPC Selector')
    .toBeVisible({ timeout: cfg.timeout.page });

  if (await step0.isVisible().catch(() => false)) {
    console.log('Step0 dikha — Save karke selector tak');
    await page.getByRole('button', { name: /^(Save|Saved|Not Saved)$/ }).first().click();
    const popup = page.getByText('IPC Codes Generated');
    await expect(popup, 'IPC popup nahi khula').toBeVisible({ timeout: cfg.timeout.element });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }

  await waitForIpcSelector(page, cfg.timeout.page);
  console.log(`IPC cards: ${await (await listIpcCards(page)).count()}\n`);

  // ── har IPC ──
  for (const job of cfg.ipcs) {
    console.log(`── IPC index ${job.ipcIndex} ──────────────`);
    await openIpc(page, job.ipcIndex);

    // ipcFlow load hua? (switch(currentStep): case 0 = Step2/BOM render hota hai)
    await expect(
      page.getByRole('heading', { name: /PART-1 BOM/i }).or(page.getByText('Select component')).first(),
      'ipcFlow (BOM step) load nahi hua').toBeVisible({ timeout: cfg.timeout.page });

    // ── BOM/Artwork se Cut & Sew Spec step pe shift ──
    // Source: progress-bar circle <button title="Go to Cut & Sew Spec">
    const cutBtn = page.locator('button[title*="Cut"]').first();
    await expect(cutBtn, 'Cut & Sew step-button (title) nahi mila').toBeVisible({ timeout: cfg.timeout.element });
    await cutBtn.scrollIntoViewIfNeeded();
    for (let t = 1; t <= 3; t++) {
      await cutBtn.click();
      await page.waitForTimeout(600);
      if (await page.getByRole('heading', { name: /PART-3 CUT/i }).isVisible().catch(() => false)) break;
      console.log(`     ↻ step-click retry ${t}/3`);
    }

    // ── VERIFY screen: title + subtitle + 3 tabs ──
    await expect(page.getByRole('heading', { name: /PART-3 CUT/i }),
      'Cut & Sew title nahi dikha — step shift fail').toBeVisible({ timeout: cfg.timeout.page });
    await expect(page.getByText(/Cutting, sewing and finishing specifications/i),
      'Cut & Sew subtitle nahi dikha').toBeVisible();
    for (const tab of ['Cutting', 'Sewing', 'Finishing']) {
      await expect(page.getByRole('button', { name: tab, exact: true }),
        `"${tab}" tab nahi dikha`).toBeVisible();
    }
    console.log('  ✓ PART-3 CUT, SEW & FINISHING screen verified');

    // ── OPTIONAL: Cut / Sew sizes (Section-1 Spec default) — best effort ──
    await fillSizes(page, 'Cutting', job.cutting ?? [], cfg);
    await fillSizes(page, 'Sewing',  job.sewing  ?? [], cfg);

    // ── MANDATORY: Finishing (yahi 'cut ✓' completion drive karta hai) ──
    const fins = job.finishing ?? [];
    await page.getByRole('button', { name: 'Finishing', exact: true }).click();
    await page.waitForTimeout(400);
    await expect(
      field(scopeAll(page), 'FINISHING PROCESS').first()
        .or(page.getByText(/No component has a FINISHING/i)).first(),
      'Finishing panel load nahi hua').toBeVisible({ timeout: cfg.timeout.element });

    for (const fin of fins) {
      const scope = scopeAll(page);

      // component chip select (BUTTON — dropdown nahi). names[0] pehle se selected.
      const chip = page.getByRole('button', { name: fin.component, exact: true }).first();
      if (await chip.isVisible().catch(() => false)) { await chip.click(); await page.waitForTimeout(300); }

      // FINISHING PROCESS = TenantDropdown (react-select, creatable)
      await setSelect(page, scope, 'FINISHING PROCESS', fin.process, `FIN PROCESS ${fin.component}`);
      await page.waitForTimeout(300);
      // PROCESS TYPE = MultiSelectDropdown; options FINISHING_TYPE_MAP[process] pe depend
      // → process ALWAYS pehle set hota hai (upar), phir types.
      await setMultiSelect(page, field(scope, 'PROCESS TYPE').first(), fin.types, `FIN TYPE ${fin.component}`);
      if (fin.remarks) {
        await setAny(page, scope, 'REMARKS', fin.remarks, `FIN REMARKS ${fin.component}`).catch(() => {});
      }
      console.log(`  finishing: ${fin.component} → ${fin.process} [${(fin.types || []).join(', ')}]`);
    }

    // ── SAVE (Finishing complete → handleSaveStep1 cut:true stamp) ──
    await page.getByRole('button', { name: /^(Save|Saved|Not Saved)$/ }).first().click();
    const okBtn = page.getByRole('button', { name: 'Saved' });
    const noBtn = page.getByRole('button', { name: 'Not Saved' });
    const vDialog = page.getByText('Please fill the following');
    await expect(okBtn.or(noBtn).or(vDialog).first(), 'save outcome nahi dikha')
      .toBeVisible({ timeout: cfg.timeout.element });
    if (await vDialog.isVisible().catch(() => false)) {
      const items = await vDialog.locator('xpath=ancestor::div[2]').innerText().catch(() => '?');
      throw new Error(`SAVE FAIL (IPC ${job.ipcIndex}) — validation:\n${items}`);
    }
    if (await noBtn.isVisible().catch(() => false)) {
      throw new Error(`SAVE FAIL (IPC ${job.ipcIndex}) — "Not Saved"`);
    }
    console.log(`  ✓ SAVED cut, sew & finishing (IPC index ${job.ipcIndex})\n`);

    // ── wapas selector + is IPC ka Cut & Sew ✓ verify ──
    await page.getByRole('button', { name: 'IPC Selector' }).first().click().catch(() => {});
    await waitForIpcSelector(page, cfg.timeout.page).catch(() => {});
    const st = await ipcStatus(page, job.ipcIndex);
    if (st.cut) console.log(`  ✓ TRACK: ${st.label} → Cut & Sew complete`);
    else console.log(`  ⚠ ${st.label}: Cut & Sew ✓ abhi nahi dikha (end me re-check)`);
  }

  // ── SAARE IPC ka progress report (portal gate track) ──
  const rep = await reportAllIpc(page);
  console.log(`✅ CUT & SEW — Cut&Sew ${rep.cut}/${rep.total} IPC\n`);
  expect(rep.cut, `Sirf ${rep.cut}/${rep.total} IPC ka Cut & Sew ✓ hua`).toBe(rep.total);
});

// ── size filler — Section-1 Spec DEFAULT active. NON-gating (best effort):
//    fail hone par sirf log, test fail nahi (cut completion sirf Finishing se). ──
async function fillSizes(page, tabName, list, cfg) {
  if (!list.length) return;
  await page.getByRole('button', { name: tabName, exact: true }).click();
  await page.waitForTimeout(400);
  for (const s of list) {
    try {
      // component chip (button)
      const chip = page.getByRole('button', { name: s.component, exact: true }).first();
      if (await chip.isVisible().catch(() => false)) { await chip.click(); await page.waitForTimeout(250); }

      // CUT/SEW SIZE row = L (input, ph "L") + W (input, ph "W") + UNIT (react-select)
      if (s.L != null) await page.getByPlaceholder('L', { exact: true }).first().fill(String(s.L));
      if (s.W != null) await page.getByPlaceholder('W', { exact: true }).first().fill(String(s.W));
      if (s.unit) {
        // UNIT control = W input ke turant baad wala react-select (artwork-proven pattern)
        const wBox = page.getByPlaceholder('W', { exact: true }).first();
        const unitCtrl = wBox.locator('xpath=following::div[contains(@class,"-control")][1]');
        if (await unitCtrl.count()) await pickOption(page, unitCtrl, s.unit, `${tabName} UNIT`);
      }
      console.log(`     ${tabName} size ${s.component}: ${s.L ?? ''}x${s.W ?? ''} ${s.unit ?? ''}`);
    } catch (e) {
      console.log(`     (note: ${tabName} size ${s.component} skip — ${String(e.message).split('\n')[0]})`);
    }
  }
  // Sizes draft me commit ho chuke; final Finishing Save sab persist karega.
  // (Yahan alag Save ki zaroorat nahi.)
}