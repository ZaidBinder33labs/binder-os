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

  // ── navigate → IPC selector (BOM + Artwork must be done first) ──
  await gotoProject(page, resolveProject(cfg), dismissAddLater);
  await page.getByRole('button', { name: 'IPC Spec' }).click();

  const step0 = page.locator('text="PRODUCT SPEC"');
  const selector = page.getByText('Select SKU to proceed');
  await expect(step0.or(selector).first(), 'neither PRODUCT SPEC nor IPC Selector')
    .toBeVisible({ timeout: cfg.timeout.page });

  if (await step0.isVisible().catch(() => false)) {
    console.log('Step0 shown — saving to reach the selector');
    await page.getByRole('button', { name: /^(Save|Saved|Not Saved)$/ }).first().click();
    const popup = page.getByText('IPC Codes Generated');
    await expect(popup, 'IPC popup did not open').toBeVisible({ timeout: cfg.timeout.element });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }

  await waitForIpcSelector(page, cfg.timeout.page);
  console.log(`IPC cards: ${await (await listIpcCards(page)).count()}\n`);

  // ── each IPC ──
  for (const job of cfg.ipcs) {
    console.log(`── IPC index ${job.ipcIndex} ──────────────`);
    await openIpc(page, job.ipcIndex);

    // ipcFlow loaded? (switch(currentStep): case 0 = Step2/BOM renders)
    await expect(
      page.getByRole('heading', { name: /PART-1 BOM/i }).or(page.getByText('Select component')).first(),
      'ipcFlow (BOM step) did not load').toBeVisible({ timeout: cfg.timeout.page });

    // ── shift from BOM/Artwork to the Cut & Sew Spec step ──
    // Source: progress-bar circle <button title="Go to Cut & Sew Spec">
    const cutBtn = page.locator('button[title*="Cut"]').first();
    await expect(cutBtn, 'Cut & Sew step-button (title) not found').toBeVisible({ timeout: cfg.timeout.element });
    await cutBtn.scrollIntoViewIfNeeded();
    for (let t = 1; t <= 3; t++) {
      await cutBtn.click();
      await page.waitForTimeout(600);
      if (await page.getByRole('heading', { name: /PART-3 CUT/i }).isVisible().catch(() => false)) break;
      console.log(`     ↻ step-click retry ${t}/3`);
    }

    // ── VERIFY screen: title + subtitle + 3 tabs ──
    await expect(page.getByRole('heading', { name: /PART-3 CUT/i }),
      'Cut & Sew title not visible — step shift failed').toBeVisible({ timeout: cfg.timeout.page });
    await expect(page.getByText(/Cutting, sewing and finishing specifications/i),
      'Cut & Sew subtitle not visible').toBeVisible();
    for (const tab of ['Cutting', 'Sewing', 'Finishing']) {
      await expect(page.getByRole('button', { name: tab, exact: true }),
        `"${tab}" tab not visible`).toBeVisible();
    }
    console.log('  ✓ PART-3 CUT, SEW & FINISHING screen verified');

    // ── OPTIONAL: Cut / Sew sizes (Section-1 Spec default) — best effort ──
    await fillSizes(page, 'Cutting', job.cutting ?? [], cfg);
    await fillSizes(page, 'Sewing',  job.sewing  ?? [], cfg);

    // ── MANDATORY: Finishing (this drives the 'cut ✓' completion) ──
    const fins = job.finishing ?? [];
    await page.getByRole('button', { name: 'Finishing', exact: true }).click();
    await page.waitForTimeout(400);
    await expect(
      field(scopeAll(page), 'FINISHING PROCESS').first()
        .or(page.getByText(/No component has a FINISHING/i)).first(),
      'Finishing panel did not load').toBeVisible({ timeout: cfg.timeout.element });

    for (const fin of fins) {
      const scope = scopeAll(page);

      // component chip select (BUTTON — not a dropdown). names[0] is pre-selected.
      const chip = page.getByRole('button', { name: fin.component, exact: true }).first();
      if (await chip.isVisible().catch(() => false)) { await chip.click(); await page.waitForTimeout(300); }

      // FINISHING PROCESS = TenantDropdown (react-select, creatable)
      await setSelect(page, scope, 'FINISHING PROCESS', fin.process, `FIN PROCESS ${fin.component}`);
      await page.waitForTimeout(300);
      // PROCESS TYPE = MultiSelectDropdown; options depend on FINISHING_TYPE_MAP[process]
      // → process is ALWAYS set first (above), then the types.
      await setMultiSelect(page, field(scope, 'PROCESS TYPE').first(), fin.types, `FIN TYPE ${fin.component}`);
      if (fin.remarks) {
        await setAny(page, scope, 'REMARKS', fin.remarks, `FIN REMARKS ${fin.component}`).catch(() => {});
      }
      console.log(`  finishing: ${fin.component} → ${fin.process} [${(fin.types || []).join(', ')}]`);
    }

    // ── SAVE (Finishing complete → handleSaveStep1 stamps cut:true) ──
    await page.getByRole('button', { name: /^(Save|Saved|Not Saved)$/ }).first().click();
    const okBtn = page.getByRole('button', { name: 'Saved' });
    const noBtn = page.getByRole('button', { name: 'Not Saved' });
    const vDialog = page.getByText('Please fill the following');
    await expect(okBtn.or(noBtn).or(vDialog).first(), 'no save outcome appeared')
      .toBeVisible({ timeout: cfg.timeout.element });
    if (await vDialog.isVisible().catch(() => false)) {
      const items = await vDialog.locator('xpath=ancestor::div[2]').innerText().catch(() => '?');
      throw new Error(`SAVE FAILED (IPC ${job.ipcIndex}) — validation:\n${items}`);
    }
    if (await noBtn.isVisible().catch(() => false)) {
      throw new Error(`SAVE FAILED (IPC ${job.ipcIndex}) — "Not Saved"`);
    }
    console.log(`  ✓ SAVED cut, sew & finishing (IPC index ${job.ipcIndex})\n`);

    // ── back to selector + verify this IPC's Cut & Sew ✓ ──
    await page.getByRole('button', { name: 'IPC Selector' }).first().click().catch(() => {});
    await waitForIpcSelector(page, cfg.timeout.page).catch(() => {});
    const st = await ipcStatus(page, job.ipcIndex);
    if (st.cut) console.log(`  ✓ TRACK: ${st.label} → Cut & Sew complete`);
    else console.log(`  ⚠ ${st.label}: Cut & Sew ✓ not shown yet (will re-check at the end)`);
  }

  // ── progress report for ALL IPCs (portal gate track) ──
  const rep = await reportAllIpc(page);
  console.log(`✅ CUT & SEW — Cut&Sew ${rep.cut}/${rep.total} IPC\n`);
  expect(rep.cut, `Only ${rep.cut}/${rep.total} IPCs got Cut & Sew ✓`).toBe(rep.total);
});

// ── size filler — Section-1 Spec is active by DEFAULT. NON-gating (best effort):
//    on failure just log, test does not fail (cut completion comes only from Finishing). ──
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
        // UNIT control = the react-select right after the W input (artwork-proven pattern)
        const wBox = page.getByPlaceholder('W', { exact: true }).first();
        const unitCtrl = wBox.locator('xpath=following::div[contains(@class,"-control")][1]');
        if (await unitCtrl.count()) await pickOption(page, unitCtrl, s.unit, `${tabName} UNIT`);
      }
      console.log(`     ${tabName} size ${s.component}: ${s.L ?? ''}x${s.W ?? ''} ${s.unit ?? ''}`);
    } catch (e) {
      console.log(`     (note: ${tabName} size ${s.component} skipped — ${String(e.message).split('\n')[0]})`);
    }
  }
  // Sizes are committed to the draft; the final Finishing Save persists everything.
  // (No separate Save needed here.)
}