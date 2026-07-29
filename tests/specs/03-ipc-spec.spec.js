import { test, expect } from '@playwright/test';
import { dismissAddLater } from '../helpers/helpers.js';
import { uploadFile } from '../helpers/formHelpers.js';
import { resolveProject } from '../helpers/runtimeHelpers.js';
import fs from 'fs';
import path from 'path';

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'test-data', 'ipc-spec.json'), 'utf8')
);
const T = cfg.timeout;
test.setTimeout(T.test);

const SKU_INPUT = 'input[placeholder="e.g., SKU-001"]';
const COMP_INPUT = 'input[placeholder="Type component name"]';

// ═══════════════════════════════════════════════════════════════
//  Written by reading the Binder-frontend source (Step0.jsx +
//  GenerateFactoryCode.jsx). Source-proof for each selector:
//
//  1. SKU card: one card = exactly one "e.g., SKU-001" input.
//     Subproduct BUYER SKU is separate (dropdown, "Select or type buyer SKU").
//  2. "SKU N" <h3> ONLY when skus.length > 1. SKU Remove only then too.
//  3. PRODUCT = TenantDropdown creatable. Typing creates an 'Add "..."'
//     option — do NOT click it (exact match only).
//  4. The PLACEMENT widget morphs on components.length:
//       1 comp  → dropdown ['TOP PLACEMENT']
//       2 comps → dropdown ['TOP PLACEMENT','BOTTOM PLACEMENT']
//       3+      → free-text <input placeholder="Type placement">
//     THEREFORE: create the rows FIRST, THEN fill them.
//  5. The react-select menu portals to document.body —
//     search at page level, not inside the card.
//  6. addSku() gives exactly 1 empty SKU (with 1 component row).
//  7. SAVE = handleSaveStep0:
//       • no network call, only local state + localStorage
//       • button text 'Save' → 'Saved' (success) / 'Not Saved' (error)
//       • setShowIPCPopup(true) → the "IPC Codes Generated" POPUP opens
//         with [Add More SKU] [Next] buttons.
//     The earlier "Next → not found" was because of THIS popup.
//  8. Step0's own Next button text = "Next →" (the arrow is in the text).
//     The popup's Next is just "Next". The two are different.
//
//  RULE: always resolve a field by LABEL. Never a page-level flat index.
// ═══════════════════════════════════════════════════════════════

// ─── locators ────────────────────────────────────────────────────

const field = (scope, label) => scope.locator(
  `xpath=.//label[normalize-space(translate(., "*", ""))="${label}"]/parent::*`
);

const skuBlock = (page, i) => page.locator(SKU_INPUT).nth(i).locator(
  'xpath=ancestor::div[count(.//input[@placeholder="e.g., SKU-001"])=1][last()]'
);

const componentRow = (block, i) => block.locator(COMP_INPUT).nth(i).locator(
  'xpath=ancestor::div[' +
  'count(.//input[@placeholder="Type component name"])=1 and ' +
  'count(.//input[@placeholder="e.g., SKU-001"])=0' +
  '][last()]'
);

// ─── setters (each one verifies) ─────────────────────────────────

async function setText(scope, label, value, tag) {
  const el = field(scope, label).locator('input, textarea').first();
  if (!await el.count()) throw new Error(`${tag}: input for label "${label}" not found`);
  await el.scrollIntoViewIfNeeded();
  await expect(el, `${tag} not editable`).toBeEditable();
  await el.fill('');
  await el.fill(String(value));
  await expect(el, `${tag}: value was not set`).toHaveValue(String(value));
}

async function pickOption(page, control, value, tag) {
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`^\\s*${esc}\\s*$`, 'i');

  for (let a = 1; a <= 3; a++) {
    try {
      await page.keyboard.press('Escape');
      await control.scrollIntoViewIfNeeded();
      await control.click();

      const menu = page.locator('[class*="-menu"]').first();   // body-portal
      await expect(menu, `${tag}: menu did not open`).toBeVisible();

      // explicitly skip the 'Add "..."' create-option
      const findReal = () => menu.locator('[class*="-option"]')
        .filter({ hasNotText: /^Add "/ })
        .filter({ hasText: rx })
        .first();

      let opt = findReal();
      if (!await opt.isVisible().catch(() => false)) {
        await page.keyboard.type(value, { delay: 40 });
        opt = findReal();
      }
      if (!await opt.isVisible().catch(() => false)) {
        const all = await menu.locator('[class*="-option"]').allInnerTexts();
        throw new Error(`"${value}" not in list. Available: ${JSON.stringify(all)}`);
      }

      await opt.click();
      await expect(control, `${tag}: value not shown after select`).toContainText(rx);
      await page.keyboard.press('Escape');
      return;
    } catch (e) {
      await page.keyboard.press('Escape').catch(() => { });
      if (a === 3) throw new Error(`${tag} — 3 attempts failed: ${e.message}`);
      console.log(`     retry ${a}/3 — ${tag}`);
    }
  }
}

async function setSelect(page, scope, label, value, tag) {
  const c = field(scope, label).locator('[class*="-control"]').first();
  if (!await c.count()) throw new Error(`${tag}: dropdown for "${label}" not found`);
  await pickOption(page, c, value, tag);
}

/** placement: dropdown for 1–2 comps, free-text for 3+ (source: Step0.jsx) */
async function setPlacement(page, row, value, tag) {
  const box = field(row, 'ASSIGN PLACEMENT');
  if (!await box.count()) throw new Error(`${tag}: ASSIGN PLACEMENT label not found`);

  if (await box.locator('[class*="-control"]').count()) {
    return pickOption(page, box.locator('[class*="-control"]').first(), value, tag);
  }
  const input = box.locator('input').first();
  if (!await input.count()) {
    const html = await box.evaluate(el => el.outerHTML.slice(0, 400)).catch(() => '?');
    throw new Error(`${tag}: neither dropdown nor input.\n     HTML: ${html}`);
  }
  await input.fill(String(value));
  await expect(input, `${tag}: value was not set`).toHaveValue(String(value));
}

// ─── JSON → SKU list ─────────────────────────────────────────────

function resolveSkus(fd) {
  const base = fd.defaults ?? fd.template ?? {};
  const rows = Array.isArray(fd.skus) && fd.skus.length
    ? fd.skus : Array(fd.skuCount ?? 1).fill({});
  const out = [];
  for (const r of rows) {
    const m = { ...base, ...r };
    const times = m.repeat ?? 1;
    delete m.repeat;
    Object.keys(m).forEach(k => k.startsWith('_') && delete m[k]);
    for (let i = 0; i < times; i++) out.push(structuredClone(m));
  }
  return out;
}

const tpl = v => typeof v !== 'string' ? v
  : v.replace('{{random}}', Math.random().toString(36).slice(2, 8).toUpperCase())
    .replace('{{futureDate}}', (() => {
      const d = new Date(); d.setDate(d.getDate() + 30);
      const p = x => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    })());

/** Validate the config BEFORE the browser — UI rules from Step0.jsx */
function validateConfig(skus) {
  const bad = [];
  skus.forEach((s, i) => {
    const c = s.components ?? [];
    if (!c.length) { bad.push(`SKU ${i + 1}: no components at all`); return; }
    if (c.length === 1 && c[0].placement !== 'TOP PLACEMENT') {
      bad.push(`SKU ${i + 1}: with 1 component, placement must be "TOP PLACEMENT" (got "${c[0].placement}")`);
    }
    if (c.length === 2) {
      const ok = ['TOP PLACEMENT', 'BOTTOM PLACEMENT'];
      c.forEach((x, j) => {
        if (!ok.includes(x.placement))
          bad.push(`SKU ${i + 1} comp ${j + 1}: with 2 comps, need ${ok.join('/')} (got "${x.placement}")`);
      });
    }
    c.forEach((x, j) => {
      if (!x.name?.trim()) bad.push(`SKU ${i + 1} comp ${j + 1}: name empty`);
      if (!x.placement?.trim()) bad.push(`SKU ${i + 1} comp ${j + 1}: placement empty`);
    });
  });
  if (bad.length) throw new Error('ipc-spec.json invalid:\n  • ' + bad.join('\n  • '));
}

const SKUS = resolveSkus(cfg.formData);
if (!SKUS.length) throw new Error('ipc-spec.json: no SKU defined');
validateConfig(SKUS);

// ─── SKU count converge ──────────────────────────────────────────

async function removeLastCard(page, locator, kind) {
  const n = await locator.count();
  const card = locator.last().locator('xpath=ancestor::div[.//*[normalize-space()="Remove"]][1]');
  const btn = card.getByText('Remove', { exact: true }).first();
  if (!await btn.isVisible().catch(() => false)) {
    throw new Error(`"Remove" for ${kind} not found (currently ${n})`);
  }
  await btn.click();
  await expect(locator, `${kind} count did not decrease`).toHaveCount(n - 1);
}

async function ensureSkuCount(page, want) {
  const cards = page.locator(SKU_INPUT);
  for (let g = 0; g < 40; g++) {
    const have = await cards.count();
    if (have === want) { console.log(`  ${want} SKU card ready\n`); return; }
    if (have < want) {
      const btn = page.getByRole('button', { name: 'Add SKU' });
      await expect(btn, '"Add SKU" not found').toBeVisible();
      await btn.click();
      await expect(cards, 'count did not change after Add SKU')
        .not.toHaveCount(have, { timeout: T.element });
    } else {
      await removeLastCard(page, cards, 'SKU');
    }
  }
  throw new Error(`SKU count did not settle at ${want} (currently ${await cards.count()})`);
}

// ─── pre-save scan ───────────────────────────────────────────────

async function assertComplete(page) {
  const empty = await page.evaluate(() => {
    const bad = [];
    for (const lab of document.querySelectorAll('label')) {
      if (!lab.textContent.includes('*')) continue;
      const name = lab.textContent.replace(/\s*\*\s*$/, '').trim();
      let box = lab.parentElement;
      for (let u = 0; u < 3 && box; u++) {
        if (box.querySelector('input, textarea, [class*="-control"]')) break;
        box = box.parentElement;
      }
      if (!box) continue;
      if (/IMAGE/i.test(name)) {
        if (/click to upload/i.test(box.textContent)) bad.push(`${name} (no image attached)`);
      } else if (box.querySelector('[class*="-control"]')) {
        if (box.querySelector('[class*="-placeholder"]')) bad.push(`${name} (dropdown empty)`);
      } else {
        const i = box.querySelector('input:not([type="file"]), textarea');
        if (i && !String(i.value).trim()) bad.push(`${name} (empty)`);
      }
    }
    return bad;
  });

  if (empty.length) {
    console.error(`\n  ${empty.length} required field(s) empty:`);
    empty.forEach(f => console.error(`     - ${f}`));
    throw new Error(`${empty.length} required field(s) empty — not clicking Save`);
  }
  console.log('  all required fields are filled\n');
}

// ─── SAVE — source-proof verification ────────────────────────────
// handleSaveStep0: NO network call. Success = button 'Saved'
// + IPC popup. Fail = 'Not Saved' or a validation dialog.
async function saveStep0(page) {
  await page.getByRole('button', { name: /^(Save|Saved|Not Saved)$/ }).first().click();

  const saved = page.getByRole('button', { name: 'Saved' });
  const notSaved = page.getByRole('button', { name: 'Not Saved' });
  const popup = page.getByText('IPC Codes Generated');

  await expect(saved.or(notSaved).or(popup).first(), 'no Save outcome appeared')
    .toBeVisible({ timeout: T.element });

  if (await notSaved.isVisible().catch(() => false)) {
    throw new Error('Save FAILED — button "Not Saved" appeared (there are validation errors)');
  }

  // IPC popup opened → print codes, then click the popup's "Next"
  if (await popup.isVisible().catch(() => false)) {
    const codes = await page.locator('text=/CHD\\/[A-Z0-9]+\\/PO-\\d+\\/IPC-\\d+/').allInnerTexts()
      .catch(() => []);
    console.log(`  IPC codes (${codes.length}):`);
    codes.forEach(c => console.log(`    ${c}`));
    if (codes.length !== SKUS.length) {
      throw new Error(`IPC count mismatch: ${SKUS.length} SKUs filled but ${codes.length} codes created`);
    }
    console.log(`  ✓ verified: ${SKUS.length} SKU = ${codes.length} IPC`);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(popup, 'IPC popup did not close').toBeHidden();
    console.log('  Save OK (Next from popup)\n');
    return 'advanced';   // the popup's Next is what moves us forward (flowPhase changed)
  }

  console.log('  Save OK\n');
  return 'saved';
}

// ─── one SKU ─────────────────────────────────────────────────────

async function fillSku(page, i, d) {
  const n = i + 1, id = `SKU${n}`;
  const block = skuBlock(page, i);
  await expect(block, `${id} block not found`).toBeVisible();

  const own = await block.locator(SKU_INPUT).count();
  if (own !== 1) throw new Error(`${id} block has ${own} BUYER SKU inputs — scoping broke`);

  const sku = tpl(d.buyerSku);
  await setSelect(page, block, 'PRODUCT', tpl(d.product), `${id} PRODUCT`);
  await setText(block, 'BUYER SKU', sku, `${id} BUYER SKU`);
  await setText(block, 'SET OF', tpl(d.setOf), `${id} SET OF`);
  await setText(block, 'PO QTY', tpl(d.poQty), `${id} PO QTY`);
  await setText(block, 'OVERAGE (%)', tpl(d.overage), `${id} OVERAGE`);
  await setText(block, 'DELIVERY DUE DATE', tpl(d.deliveryDate), `${id} DATE`);
  await uploadFile(page, sku, block);
  console.log(`  ${sku} | ${tpl(d.product)} | qty ${d.poQty}`);

  const comps = d.components;
  const rows = block.locator(COMP_INPUT);

  // STEP 1: create ALL rows FIRST — the placement widget morphs on row count
  const addBtn = block.getByRole('button', { name: '+ Add Component' }).first();
  for (let c = await rows.count(); c < comps.length; c++) {
    await addBtn.click();
    await expect(rows, 'new component row did not appear').toHaveCount(c + 1);
  }
  await expect(rows, `${id}: rows not as expected`).toHaveCount(comps.length);

  // STEP 2: now fill them
  for (let c = 0; c < comps.length; c++) {
    const row = componentRow(block, c);
    await setText(row, 'COMPONENT', comps[c].name, `${id} Comp${c + 1} name`);
    await setPlacement(page, row, comps[c].placement, `${id} Comp${c + 1} placement`);
    console.log(`     ${c + 1}. ${comps[c].name} -> ${comps[c].placement}`);
  }
}

// ─── main ────────────────────────────────────────────────────────

test(`IPC Spec — ${SKUS.length} SKUs`, async ({ page }) => {
  console.log(`\n${cfg.navigation.chdpdProject}`);
  SKUS.forEach((s, i) =>
    console.log(`   SKU ${i + 1}: ${s.product} | qty ${s.poQty} | ${s.components.length} component`));
  console.log('');

  await page.goto('/');
  await dismissAddLater(page);

  for (const nm of ['IPO Management', 'Production']) {
    const b = page.getByRole('button', { name: nm });
    await expect(b, `"${nm}" not found`).toBeVisible();
    await b.click();
  }
  const projectCode = resolveProject(cfg);
  const proj = page.locator('button').filter({ hasText: projectCode }).first();
  await expect(proj, `project "${projectCode}" not found`).toBeVisible();
  await proj.click();
  await page.getByRole('button', { name: 'IPC Spec' }).click();

  await expect(page.locator('text="PRODUCT SPEC"'), 'page did not load')
    .toBeVisible({ timeout: T.page });
  console.log('PRODUCT SPEC loaded\n');

  console.log(`creating ${SKUS.length} SKU card(s)`);
  await ensureSkuCount(page, SKUS.length);

  for (let i = 0; i < SKUS.length; i++) {
    console.log(`-- SKU ${i + 1}/${SKUS.length} ------------------`);
    try {
      await fillSku(page, i, SKUS[i]);
    } catch (e) {
      console.error(`\nSKU ${i + 1} FAILED: ${e.message}\n`);
      if (cfg.options.screenshot) {
        await page.screenshot({ path: `test-results/sku-${i + 1}-fail.png`, fullPage: true }).catch(() => { });
      }
      throw e;
    }
  }

  if (cfg.options.removeSubproducts !== false) {
    const subs = page.getByText(/^Subproduct \d+$/);
    if (await subs.count()) {
      console.log(`\nremoving ${await subs.count()} subproduct(s)`);
      for (let g = 0; g < 40 && await subs.count(); g++) {
        await removeLastCard(page, subs, 'Subproduct');
      }
    }
  }

  console.log('\nverify before Save');
  await assertComplete(page);

  console.log('Save');
  const outcome = await saveStep0(page);

  // if the popup's Next already moved us forward, Step0's "Next →" isn't needed
  if (outcome !== 'advanced') {
    const next = page.getByRole('button', { name: /^\s*Next/i }).first();
    await expect(next, '"Next" not found').toBeVisible();
    await next.click();
  }

  console.log(`PASS — ${SKUS.length} SKUs x ${SKUS.map(s => s.components.length).join('/')} components\n`);
});