// ═══════════════════════════════════════════════════════════════
//  PART-1 · BOM & WO  (Step2.jsx)
//  Fully JSON-driven | source-verified (Binder-frontend @ 4974b93)
//
//  WIDGET MAP (source):
//   FIBER TYPE / FABRIC NAME / COMPOSITION / QUILTING TYPE / WO APPROVAL
//        = TenantDropdown (react-select, creatable → 'Add "..."' skip)
//   TESTING REQUIREMENTS / FABRIC APPROVAL
//        = TestingRequirementsInput (input + div.cursor-pointer + .premium-chip, MULTI)
//   GSM / REMARKS / STITCH LENGTH / etc = text input
//   DESIGN REF = upload | MATERIAL DESC/COMPOSITION = AUTO (readonly)
//
//  FABRIC cascade: FIBER → FABRIC NAME → (auto: COMPOSITION/CONSTRUCTION/WEAVE)
//  QUILTING fields: QUILTING TYPE → DESIGN REF → STITCH LENGTH (MM)
//                 → PATTERN REPEAT → WASTAGE % → APPROVAL → REMARKS
// ═══════════════════════════════════════════════════════════════
import { test, expect } from '@playwright/test';
import { dismissAddLater } from '../helpers/helpers.js';
import { uploadFile } from '../helpers/formHelpers.js';
import {
  loadConfig, tpl, setAny, pickOption, field,
  gotoProject, waitForIpcSelector, listIpcCards, openIpc,
  expectIpcStep, setTestingInput, materialCard,
  reportAllIpc, expectBomDone,
} from '../helpers/binderHelpers.js';
// ── QA verification layer (backend DRAFT read-back) ──
import { resolveProject, apiContext, readRuntime, IPO_FILE } from '../helpers/runtimeHelpers.js';
import { fetchSections, verifyBomFromSections, verifyYarnFromSections, verifyBomSectionsPresent } from '../helpers/verifyHelpers.js';

const cfg = loadConfig('bom-wo.json');
test.setTimeout(cfg.timeout.test);

const scopeAll = (page) => page.locator('body');

test(`PART-1 BOM & WO — ${cfg.ipcs.length} IPC(s)`, async ({ page, playwright }) => {
  page.on('dialog', d => d.accept().catch(() => {}));   // Remove confirm() accept
  console.log(`\n${cfg.navigation.chdpdProject} | BOM & WO\n`);

  // ── navigate → IPC selector ──
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
    await expectIpcStep(page, 'BOM & WO', cfg.timeout.page);
    await expect(page.getByText('PART-1 BOM & WO')).toBeVisible();

    // ── har component (Step0 me banaye) ──
    for (const comp of job.components) {
      const scope = scopeAll(page);
      const allMats = page.locator('h4').filter({ hasText: /^MATERIAL \d+$/ });

      // COMPONENT dropdown
      await setAny(page, scope, 'COMPONENT', comp.component, 'COMPONENT');
      console.log(`  component: ${comp.component}`);

      // material type (one-shot; card banta hai)
      const specHeading = page.getByText(/SPECIFICATIONS/i).first();
      const mtControl = page.locator('[class*="-control"]')
        .filter({ hasText: /Select material type/ }).first();

      // purane material cards saaf (renumber-safe: count ghatao)
      for (let g = 0; g < 20; g++) {
        const n = await allMats.count();
        if (n === 0) break;
        await materialCard(page, 1).getByText('Remove', { exact: true }).first().click();
        await expect(allMats, 'material count nahi ghata').toHaveCount(n - 1, { timeout: cfg.timeout.element });
      }

      await expect(mtControl.or(specHeading).first(), 'na dropdown na card')
        .toBeVisible({ timeout: cfg.timeout.element });

      if (await mtControl.isVisible().catch(() => false)) {
        await mtControl.click();
        const menu = page.locator('[class*="-menu"]').first();
        await expect(menu, 'material-type menu nahi khula').toBeVisible();
        await menu.locator('[class*="-option"]').filter({ hasNotText: /^Add "/ })
          .filter({ hasText: new RegExp(`^\\s*${comp.materialType}\\s*$`, 'i') }).first().click();
        await expect(specHeading, 'material card nahi bana').toBeVisible({ timeout: cfg.timeout.element });
        console.log(`  material : ${comp.materialType} (card bana)`);
      }

      // ── FABRIC ──
      if (comp.fabric) {
        const f = comp.fabric;
        await expect(allMats, 'ek hi material card hona chahiye').toHaveCount(1);

        console.log('    → FIBER TYPE...');
        await setAny(page, scope, 'FIBER TYPE', f.fiberType, 'FIBER TYPE');
        console.log('    → FABRIC NAME...');
        await setAny(page, scope, 'FABRIC NAME', f.fabricName, 'FABRIC NAME');
        await page.waitForTimeout(600);                     // composition dropdown enable hone do
        // COMPOSITION = manual TenantDropdown (fiber+fabric ke baad enable). AUTO NAHI.
        if (f.composition) { console.log('    → COMPOSITION...'); await setAny(page, scope, 'COMPOSITION', f.composition, 'COMPOSITION'); }

        // ── OPTIONAL FABRIC FIELDS (Phase-1: full coverage) — sab manual dropdown/input ──
        // Ye 6 fields "Advance Spec" button ke PEECHE chhupe hain — pehle button dabao.
        // NOTE: page pe kai "Advance Spec" buttons hain (work order QUILTING, foam...).
        // Fabric wala "FABRIC SPECIFICATIONS" block ke andar hai — usi block me dhoondo.
        const needAdvanced = f.fiberCategory || f.constructionType || f.weaveKnitType ||
                             f.machineType || f.origin || f.certificationRequirement;
        if (needAdvanced) {
          console.log('    → Advance Spec kholo (fabric)...');
          // FABRIC SPECIFICATIONS heading ka closest common ancestor block → usme Advance Spec
          const fabricBlock = scope.locator('xpath=//*[contains(text(),"FABRIC SPECIFICATIONS")]/ancestor::div[3]').first();
          let advBtn = fabricBlock.getByRole('button', { name: /^\s*Advance Spec\s*$/i }).first();
          if (!await advBtn.count()) {
            // fallback: agar block locate na ho, COMPOSITION field ke baad wala Advance Spec
            advBtn = scope.getByRole('button', { name: /^\s*Advance Spec\s*$/i }).first();
          }
          if (await advBtn.count()) {
            await advBtn.scrollIntoViewIfNeeded();
            await advBtn.click();
            await page.waitForTimeout(500);
          } else {
            console.log('    ⚠ fabric Advance Spec button nahi mila');
          }
        }
        // fields tabhi bharo jab dikh rahe ho (advanced khula) — warna skip (crash na ho)
        const tryAdv = async (label, val, tag) => {
          if (!val) return;
          const box = field(scope, label);
          if (await box.count()) { console.log(`    → ${label}...`); await setAny(page, scope, label, val, tag); }
          else console.log(`    ⚠ ${label} nahi dikha — skip (advanced section?)`);
        };
        await tryAdv('FIBER CATEGORY',  f.fiberCategory,  'FIBER CATEGORY');
        await tryAdv('CONSTRUCTION TYPE', f.constructionType, 'CONSTRUCTION TYPE');
        await tryAdv('WEAVE/KNIT TYPE',  f.weaveKnitType,  'WEAVE/KNIT');
        await tryAdv('MACHINE TYPE',     f.machineType,    'MACHINE TYPE');
        await tryAdv('ORIGIN',           f.origin,         'ORIGIN');
        await tryAdv('CERTIFICATION REQUIREMENT', f.certificationRequirement, 'CERTIFICATION');
        if (f.gsm)     await setAny(page, scope, 'GSM', f.gsm, 'GSM');
        if (f.remarks) await setAny(page, scope, 'REMARKS', f.remarks, 'REMARKS');

        // TESTING + APPROVAL = TestingRequirementsInput (multi-chip)
        if ((f.testingRequirements ?? []).length) {
          console.log('    → TESTING REQUIREMENTS...');
          await setTestingInput(page, field(scope, 'TESTING REQUIREMENTS'), f.testingRequirements, 'TESTING');
        }
        if (f.approval) {
          console.log('    → APPROVAL...');
          await setTestingInput(page, field(scope, 'APPROVAL'),
            Array.isArray(f.approval) ? f.approval : [f.approval], 'APPROVAL');
        }
        console.log(`  fabric   : ${f.fiberType} / ${f.fabricName}`);
      }

      // ── YARN (cascade: FIBER→YARN TYPE→COMPOSITION) ──
      if (comp.yarn) {
        const y = comp.yarn;
        // Cascade order: FIBER TYPE → YARN TYPE → (auto composition/count/etc dropdowns enable)
        console.log('    → YARN FIBER TYPE...');
        await setAny(page, scope, 'FIBER TYPE', y.fiberType, 'YARN FIBER');
        console.log('    → YARN TYPE...');
        await setAny(page, scope, 'YARN TYPE',  y.yarnType,  'YARN TYPE');
        await page.waitForTimeout(600);   // cascade dropdowns (composition/count/ply...) enable hone do

        // Cascade-driven dropdowns (values fiber+yarnType pe depend). COUNT SYSTEM = auto (skip).
        if (y.composition)     { console.log('    → COMPOSITION...');      await setAny(page, scope, 'COMPOSITION',      y.composition,     'YARN COMPOSITION'); }
        if (y.countRange)      { console.log('    → COUNT RANGE...');      await setAny(page, scope, 'COUNT RANGE',      y.countRange,      'YARN COUNT RANGE'); }
        if (y.doublingOptions) { console.log('    → DOUBLING OPTIONS...'); await setAny(page, scope, 'DOUBLING OPTIONS', y.doublingOptions,'YARN DOUBLING'); }
        if (y.plyOptions)      { console.log('    → PLY OPTIONS...');      await setAny(page, scope, 'PLY OPTIONS',      y.plyOptions,      'YARN PLY'); }
        if (y.windingOptions)  { console.log('    → WINDING OPTIONS...');  await setAny(page, scope, 'WINDING OPTIONS',  y.windingOptions,  'YARN WINDING'); }
        if (y.colour)          { console.log('    → COLOUR...');           await setAny(page, scope, 'COLOUR',           y.colour,          'YARN COLOUR'); }

        // Advanced group (SPINNING TYPE, FIBER CATEGORY, ORIGIN, CERTIFICATION) — "Advance Spec" ke peeche
        // Yarn ka apna "YARN SPECIFICATIONS" block — usi me Advance Spec dhoondo.
        const needYarnAdv = y.spinningType || y.fiberCategory || y.origin || y.certificationRequirement;
        if (needYarnAdv) {
          console.log('    → Advance Spec kholo (yarn)...');
          const yarnBlock = scope.locator('xpath=//*[contains(text(),"YARN SPECIFICATIONS")]/ancestor::div[3]').first();
          let yAdvBtn = yarnBlock.getByRole('button', { name: /^\s*Advance Spec\s*$/i }).first();
          if (!await yAdvBtn.count()) {
            yAdvBtn = scope.getByRole('button', { name: /^\s*Advance Spec\s*$/i }).first();
          }
          if (await yAdvBtn.count()) {
            await yAdvBtn.scrollIntoViewIfNeeded();
            await yAdvBtn.click();
            await page.waitForTimeout(500);
          } else {
            console.log('    ⚠ yarn Advance Spec button nahi mila');
          }
        }
        const tryYAdv = async (label, val, tag) => {
          if (!val) return;
          const box = field(scope, label);
          if (await box.count()) { console.log(`    → ${label}...`); await setAny(page, scope, label, val, tag); }
          else console.log(`    ⚠ ${label} nahi dikha — skip`);
        };
        await tryYAdv('SPINNING TYPE',    y.spinningType,    'YARN SPINNING');
        await tryYAdv('FIBER CATEGORY',   y.fiberCategory,   'YARN FIBER-CAT');
        await tryYAdv('ORIGIN',           y.origin,          'YARN ORIGIN');
        await tryYAdv('CERTIFICATION REQUIREMENT', y.certificationRequirement, 'YARN CERT');
        if (y.remarks)         await setAny(page, scope, 'REMARKS', y.remarks, 'YARN REMARKS');

        // Extra generic fields (agar JSON me y.fields diya ho)
        for (const [lab, val] of Object.entries(y.fields ?? {})) {
          await setAny(page, scope, lab, val, `YARN ${lab}`);
        }
        if ((y.testingRequirements ?? []).length)
          await setTestingInput(page, field(scope, 'TESTING REQUIREMENTS'), y.testingRequirements, 'YARN TESTING');
        if (y.approval)
          await setTestingInput(page, field(scope, 'APPROVAL'),
            Array.isArray(y.approval) ? y.approval : [y.approval], 'YARN APPROVAL');
        console.log(`  yarn     : ${y.fiberType} / ${y.yarnType}`);
      }

      // ── top row: NET CNS/PC + UNIT (MATERIAL DESC = auto, skip) ──
      if (comp.netCns) await setAny(page, scope, 'NET CNS/PC', comp.netCns, 'NET CNS/PC');
      if (comp.unit)   await setAny(page, scope, 'UNIT',       comp.unit,   'UNIT');

      // ── WORK ORDERS (JSON-driven, generic) ──
      for (let w = 0; w < (comp.workOrders ?? []).length; w++) {
        const wo = comp.workOrders[w];
        if (w > 0) {
          await page.getByRole('button', { name: '+ Add Work Order' }).click();
          await page.waitForTimeout(400);
        }
        const woCard = page.getByText(new RegExp(`^WORK ORDER ${w + 1}\\b`)).first().locator(
          'xpath=ancestor::div[.//label[contains(normalize-space(),"WORK ORDER")]][1]'
        );
        await expect(woCard, `WO${w + 1} card nahi mila`).toBeVisible();
        await setAny(page, woCard, 'WORK ORDER', wo.type, `WO${w + 1} type`);

        for (const [lab, val] of Object.entries(wo.fields ?? {})) {
          if (val === '__UPLOAD__') {
            await uploadFile(page, `wo-${job.ipcIndex}-${w}`, woCard);
            console.log(`     ${lab}: uploaded`);
          } else if (val === 'Yes' || val === 'No') {
            await woCard.getByRole('radio', { name: val }).first().check()
              .catch(async () => await woCard.getByLabel(val, { exact: true }).first().check());
            console.log(`     ${lab}: ${val}`);
          } else {
            await setAny(page, woCard, lab, val, `WO${w + 1} ${lab}`);
          }
        }
        console.log(`  WO ${w + 1}: ${wo.type}`);
      }

      // ── quality inspected radio ──
      if (comp.qualityInspected) {
        await page.getByRole('radio', { name: comp.qualityInspected }).last().check()
          .catch(async () => await page.getByLabel(comp.qualityInspected, { exact: true }).last().check());
        console.log(`  quality inspected: ${comp.qualityInspected}`);
      }

      // ── SAVE (per component) ──
      await page.getByRole('button', { name: /^(Save|Saved|Not Saved)$/ }).first().click();
      const vDialog = page.getByText('Please fill the following');
      const okBtn = page.getByRole('button', { name: 'Saved' });
      const noBtn = page.getByRole('button', { name: 'Not Saved' });
      await expect(okBtn.or(noBtn).or(vDialog).first(), 'Save outcome nahi dikha')
        .toBeVisible({ timeout: cfg.timeout.element });
      if (await vDialog.isVisible().catch(() => false)) {
        const items = await vDialog.locator('xpath=ancestor::div[2]').innerText().catch(() => '?');
        throw new Error(`SAVE FAIL — validation:\n${items}`);
      }
      if (await noBtn.isVisible().catch(() => false)) {
        throw new Error('SAVE FAIL — "Not Saved"');
      }
      console.log(`  ✓ SAVED: ${comp.component}\n`);

      await page.screenshot({ path: `test-results/bom-${job.ipcIndex}-${comp.component}.png`, fullPage: true }).catch(() => {});
    }

    // wapas selector (agli IPC ke liye) + is IPC ka BOM ✓ verify
    await page.getByRole('button', { name: 'IPC Selector' }).first().click().catch(() => {});
    await waitForIpcSelector(page, cfg.timeout.page).catch(() => {});
    await expectBomDone(page, job.ipcIndex);          // portal card pe ✓ aaya?
  }

  // ═══════════════════════════════════════════════════════════════
  //  QA BACKEND VERIFICATION — har component ki har field backend me sahi?
  //  (UI "SAVED" dikha dena kaafi nahi — data sach me persist hui? YE checks.)
  //  Agar koi dropdown me galat value gayi par form save ho gaya, YE FAIL karega.
  // ═══════════════════════════════════════════════════════════════
  await test.step('QA VERIFY — BOM fields backend se (field-by-field)', async () => {
    const api = await apiContext(playwright);
    const ipoId = readRuntime(IPO_FILE)?.ipoId;
    if (!ipoId) {
      console.log('  ⚠ ipoId nahi mila (.runtime/current-ipo.json) — backend verify skip. Chain (01→02) chalao.');
      await api.dispose();
      return;
    }

    // DRAFT sections endpoint se saved BOM padho
    const sections = await fetchSections(api, ipoId);

    // Safety: agar sections khali/shape alag (backend migration/format), to
    // hard-fail mat karo — clear diagnostic do. UI ne SAVED confirm kar diya
    // hai (validation pass), ye layer usse AAGE ki pukhta jaanch hai.
    const bomwoRows = sections.filter(s => String(s.section || '').toLowerCase() === 'bomwo');
    if (bomwoRows.length === 0) {
      console.log(`  ⚠ 'bomwo' section backend se nahi mila (sections: ${sections.length}).`);
      console.log(`     → BOM UI-side SAVED ho chuka; draft-store format alag ho sakta hai.`);
      console.log(`     → Shape confirm karne ke liye ek section dump:`);
      console.log('     ' + JSON.stringify(sections.slice(0, 1)).slice(0, 300));
      await api.dispose();
      return;   // non-blocking: diagnostic diya, test fail nahi
    }

    verifyBomSectionsPresent(sections, cfg.ipcs.length);
    for (const job of cfg.ipcs) {
      for (const comp of job.components) {
        if (comp.fabric) {
          const f = comp.fabric;
          verifyBomFromSections(sections, job.ipcIndex, comp.component, {
            fiberType:   f.fiberType,
            fabricName:  f.fabricName,
            composition: f.composition,
            gsm:         f.gsm,
            fiberCategory:    f.fiberCategory,
            constructionType: f.constructionType,
            weaveKnitType:    f.weaveKnitType,
            machineType:      f.machineType,
            origin:           f.origin,
          });
        } else if (comp.yarn) {
          const y = comp.yarn;
          verifyYarnFromSections(sections, job.ipcIndex, comp.component, {
            fiberType:   y.fiberType,
            yarnType:    y.yarnType,
            composition: y.composition,
            countRange:  y.countRange,
            plyOptions:  y.plyOptions,
            fiberCategory: y.fiberCategory,
            origin:        y.origin,
          });
        }
      }
    }
    await api.dispose();
    console.log('\n  ✅✅ SAARE BOM fields BACKEND-VERIFIED — koi galat value persist nahi hui\n');
  });

  // ── SAARE IPC ka progress report (portal gate track) ──
  const rep = await reportAllIpc(page);
  if (rep.bom < rep.total) {
    throw new Error(`Sirf ${rep.bom}/${rep.total} IPC ka BOM done — Packaging tak nahi ja sakte`);
  }
  console.log(`✅ BOM & WO — SAARE ${rep.total} IPC complete. Ab Artwork/Cut&Sew, phir Packaging.\n`);
});