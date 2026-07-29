// ═══════════════════════════════════════════════════════════════
//  binderHelpers.js — shared toolkit for ALL steps
//  Location: tests/helpers/binderHelpers.js
//
//  These are the functions that got Step0 (PRODUCT SPEC) to a clean pass
//  in 26s. New steps import THESE — don't duplicate them.
//
//  RULES (from the Binder-frontend source):
//  • Always resolve a field by LABEL — a flat index is always a bug in this app
//  • The react-select menu portals to document.body
//  • TenantDropdown is creatable — never click the 'Add "..."' option
//    (EXCEPTION: setCreatable — where you WANT to create a value, like COLOUR)
//  • Verify after every action — no next step without a check
// ═══════════════════════════════════════════════════════════════
import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// ─── config loader (each spec loads its own JSON via this) ──────
export function loadConfig(fileName) {
  const p = path.join(process.cwd(), 'test-data', fileName);
  if (!fs.existsSync(p)) throw new Error(`config not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ─── templates ──────────────────────────────────────────────────
export const tpl = v => typeof v !== 'string' ? v
  : v.replace('{{random}}', Math.random().toString(36).slice(2, 8).toUpperCase())
     .replace('{{futureDate}}', (() => {
       const d = new Date(); d.setDate(d.getDate() + 30);
       const p = x => String(x).padStart(2, '0');
       return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
     })());

// ─── label-based field resolution ───────────────────────────────
export const field = (scope, label) => scope.locator(
  `xpath=.//label[normalize-space(translate(., "*", ""))="${label}"]/parent::*`
);

// ─── verified setters ───────────────────────────────────────────
export async function setText(scope, label, value, tag) {
  const el = field(scope, label).locator('input, textarea').first();
  if (!await el.count()) throw new Error(`${tag}: input for label "${label}" not found`);
  await el.scrollIntoViewIfNeeded();
  await expect(el, `${tag} not editable`).toBeEditable();
  await el.fill('');
  await el.fill(String(value));
  await expect(el, `${tag}: value was not set`).toHaveValue(String(value));
}

// ─── react-select TenantDropdown setter (SOURCE-VERIFIED) ───────
// Source (TenantDropdown.jsx): all dropdowns are react-select and
// creatable=true by default (only strictMode ones aren't). When the typed
// value isn't in the list, react-select shows an `Add "<val>"` row; choosing
// it with ENTER or a click COMMITS the value (source doc: "committed on Enter
// or by clicking the Add row"). formatCreateLabel = `Add "<input>"`,
// createOptionPosition="first", the menu portals to <body>.
//
// So pickOption now handles both — one setter for the WHOLE framework:
// first try the EXISTING option, if not found CREATE it (Enter → Add-row).
export async function pickOption(page, control, value, tag) {
  const esc = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx  = new RegExp(`^\\s*${esc}\\s*$`, 'i');   // exact option match
  const sub = new RegExp(esc, 'i');                  // substring (control verify; brackets-safe)
  const input = control.locator('input').first();    // react-select's type-input

  // did the value get set in the control? (singleValue text). In multi-select
  // it may not show in the control right away — the caller (chip verify) handles that.
  const isSet = async () =>
    await control.getByText(sub).first().isVisible().catch(() => false);

  for (let a = 1; a <= 3; a++) {
    try {
      await page.keyboard.press('Escape');
      await control.scrollIntoViewIfNeeded();
      await control.click();

      const menu = page.locator('[class*="-menu"]').first();
      await expect(menu, `${tag}: menu did not open`).toBeVisible();

      const findReal = () => menu.locator('[class*="-option"]')
        .filter({ hasNotText: /^Add "/ })
        .filter({ hasText: rx })
        .first();

      // 1) is the exact option visible without typing?
      let opt = findReal();

      // 2) no → type the value to filter
      if (!await opt.isVisible().catch(() => false)) {
        await input.fill('');
        await page.keyboard.type(String(value), { delay: 40 });
        await page.waitForTimeout(250);
        opt = findReal();
      }

      if (await opt.isVisible().catch(() => false)) {
        // EXISTING option found → click
        await opt.click();
      } else {
        // 3) not EXISTING → CREATABLE create. PRIMARY: Enter (source: commit-on-Enter)
        await page.keyboard.press('Enter');
        await page.waitForTimeout(250);

        // 4) FALLBACK: if Enter didn't take, click the `Add "<val>"` row
        if (!await isSet() && await menu.isVisible().catch(() => false)) {
          const addRow = menu.locator('[class*="-option"]')
            .filter({ hasText: new RegExp(`^\\s*Add\\s+"?${esc}"?`, 'i') })
            .first();
          if (await addRow.isVisible().catch(() => false)) await addRow.click();
        }
      }

      // VERIFY (soft, brackets-safe substring): some dropdowns are multi-select →
      // may not show in the control right away, so proceed anyway (chip verify by caller).
      // A creatable create may show a small save-spinner → slightly longer timeout.
      await expect(control, `${tag}: value not shown after select/create`)
        .toContainText(sub, { timeout: 4000 })
        .catch(() => console.log(`     (note: ${tag} control-text verify skipped)`));
      await page.keyboard.press('Escape');
      return;
    } catch (e) {
      await page.keyboard.press('Escape').catch(() => {});
      if (a === 3) throw new Error(`${tag} — 3 attempts failed: ${e.message}`);
      console.log(`     retry ${a}/3 — ${tag}`);
    }
  }
}

export async function setSelect(page, scope, label, value, tag) {
  const c = field(scope, label).locator('[class*="-control"]').first();
  if (!await c.count()) throw new Error(`${tag}: dropdown for "${label}" not found`);
  await pickOption(page, c, value, tag);
}

/** dropdown or plain input — handle both (for Binder's morphing widgets) */
export async function setAny(page, scope, label, value, tag) {
  const box = field(scope, label);
  if (!await box.count()) throw new Error(`${tag}: label "${label}" not found`);
  if (await box.locator('[class*="-control"]').count()) {
    return pickOption(page, box.locator('[class*="-control"]').first(), value, tag);
  }
  const input = box.locator('input, textarea').first();
  if (!await input.count()) {
    const html = await box.evaluate(el => el.outerHTML.slice(0, 400)).catch(() => '?');
    throw new Error(`${tag}: neither dropdown nor input.\n     HTML: ${html}`);
  }
  await input.fill(String(value));
  await expect(input, `${tag}: value was not set`).toHaveValue(String(value));
}

// ─── navigation (after login, up to IPO Management) ─────────────
export async function gotoProject(page, chdpdProject, dismissAddLater) {
  await page.goto('/');
  await dismissAddLater(page);
  for (const nm of ['IPO Management', 'Production']) {
    const b = page.getByRole('button', { name: nm });
    await expect(b, `"${nm}" not found`).toBeVisible();
    await b.click();
  }
  const proj = page.locator('button').filter({ hasText: chdpdProject }).first();
  await expect(proj, `project "${chdpdProject}" not found`).toBeVisible();
  await proj.click();
}

// ─── IPC Selector (the screen AFTER Step0) ──────────────────────
// Source: GenerateFactoryCode.jsx ~4558 — "Select SKU to proceed",
// each IPC is a clickable card (role="button") with the IPC code on it.
export async function waitForIpcSelector(page, timeout = 15000) {
  await expect(
    page.getByText('Select SKU to proceed'),
    'IPC Selector screen did not appear'
  ).toBeVisible({ timeout });
}

export async function listIpcCards(page) {
  // card = a role button that has IPC-<n> text
  return page.locator('[role="button"]').filter({ hasText: /IPC-\d+/ });
}

export async function openIpc(page, ipcIndex) {
  const cards = await listIpcCards(page);
  const n = await cards.count();
  if (ipcIndex >= n) {
    const labels = await cards.allInnerTexts();
    throw new Error(`IPC index ${ipcIndex} doesn't exist — only ${n} cards: ${JSON.stringify(labels.map(l => l.split('\n')[0]))}`);
  }
  const card = cards.nth(ipcIndex);
  const label = (await card.innerText()).split('\n')[0];
  await card.scrollIntoViewIfNeeded();
  await card.click();
  console.log(`  opened IPC: ${label}`);
  return label;
}

// current step name from the ipcFlow breadcrumb
// Source: ipcFlowStepLabels = ['BOM & WO', 'Artwork & Labeling', 'Cut & Sew Spec']
export async function expectIpcStep(page, stepLabel, timeout = 15000) {
  await expect(
    page.getByText(stepLabel, { exact: false }).first(),
    `"${stepLabel}" step did not open`
  ).toBeVisible({ timeout });
}

// ─── server-save state (shown in the breadcrumb bar) ────────────
// Source: serverSaveState — 'Saving…' / '✓ Saved' / '⚠ Not saved to server'
export async function expectServerSaved(page, timeout = 30000) {
  const err = page.getByText('Not saved to server');
  const ok  = page.getByText('✓ Saved');
  await expect(ok.or(err).first(), 'no server-save status appeared')
    .toBeVisible({ timeout });
  if (await err.isVisible().catch(() => false)) {
    throw new Error('SERVER SAVE FAILED — "Not saved to server" banner appeared');
  }
  console.log('  ✓ server saved');
}

// ═══════════════════════════════════════════════════════════════
//  BOM & WO specific helpers (Step2.jsx / FabricSpec / WorkOrdersSection)
// ═══════════════════════════════════════════════════════════════

/** MATERIAL card — from <h4>MATERIAL n</h4> to the ancestor holding the FIBER TYPE/MATERIAL DESC label */
export function materialCard(page, n) {
  return page.locator(`h4:has-text("MATERIAL ${n}")`).locator(
    'xpath=ancestor::div[.//label[contains(normalize-space(),"FIBER TYPE")] or .//label[contains(normalize-space(),"MATERIAL DESC")]][1]'
  );
}

/**
 * TESTING REQUIREMENTS / APPROVAL = <TestingRequirementsInput/> widget.
 * Source markup: box click → <input> → options are plain <div class="cursor-pointer">
 * <span>OPT</span> (NO react-select classes) → selected chip ".premium-chip".
 * Type to filter, click the matching div, verify the chip. MULTI.
 */
export async function setTestingInput(page, box, values, tag) {
  if (!await box.count()) throw new Error(`${tag}: field box not found`);
  const input = box.locator('input').first();
  // the chip contains both {val} + a remove-<button> → EXACT match fails.
  // Use a substring match. And scope a bit above the box (the chip container may differ).
  const root = box.locator('xpath=ancestor-or-self::div[.//input][1]');
  const chip = v => root.locator('.premium-chip').filter({ hasText: new RegExp(
    v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i') });

  for (const val of values) {
    // already a chip? (previous state or a double-call) → done
    if (await chip(val).count()) { console.log(`       ${val}: already present`); continue; }

    await input.scrollIntoViewIfNeeded();
    await input.click();
    await page.waitForTimeout(300);

    // DON'T TYPE — the filter sometimes drops the exact match.
    // Find the matching div directly from the open list.
    const rx = new RegExp(`^\\s*${val.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*$`, 'i');
    let opt = box.locator('div.cursor-pointer').filter({ hasText: new RegExp(val.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'),'i') }).first();

    // if the list is very long, type a bit to filter (fallback)
    if (!await opt.isVisible().catch(()=>false)) {
      await input.fill('');
      await input.type(val.slice(0, 4), { delay: 40 });   // only a prefix, so exact isn't dropped
      await page.waitForTimeout(400);
      opt = box.locator('div.cursor-pointer', { hasText: rx }).first();
    }

    if (await opt.isVisible().catch(()=>false)) {
      await opt.click();
    } else if (await chip(val).count()) {
      // somehow got selected while typing
      console.log(`       ${val}: ✓ (auto)`); await input.fill(''); continue;
    } else {
      await input.fill(val);                 // custom value → add via Enter
      await input.press('Enter');
    }
    await input.fill('');                     // reset the filter
    await page.waitForTimeout(300);

    if (!await chip(val).count()) {
      const opts = await box.locator('div.cursor-pointer span').allInnerTexts().catch(()=>[]);
      throw new Error(`${tag}: chip for "${val}" was not created. Seen: ${JSON.stringify(opts.slice(0,10))}`);
    }
    console.log(`       ${val}: ✓`);
  }
}

// ═══════════════════════════════════════════════════════════════
//  IPC PROGRESS TRACKING (portal gate: Packaging only when all IPCs complete)
//  Card markup: "BOM & WO ✓" (green) vs "BOM & WO ○"
// ═══════════════════════════════════════════════════════════════

/** one IPC card's status: {bom, artwork, cut} — ✓ = true */
export async function ipcStatus(page, ipcIndex) {
  const cards = await listIpcCards(page);
  const card = cards.nth(ipcIndex);
  const txt = await card.innerText().catch(() => '');
  return {
    bom:     /BOM & WO\s*✓/.test(txt),
    artwork: /Artwork\s*✓/.test(txt),
    cut:     /Cut & Sew\s*✓/.test(txt),
    label:   (txt.split('\n')[0] || '').trim(),
  };
}

/** print the status table for all IPCs + return counts */
export async function reportAllIpc(page) {
  const cards = await listIpcCards(page);
  const n = await cards.count();
  console.log('\n  ┌─ IPC PROGRESS ─────────────────────────');
  let done = { bom: 0, artwork: 0, cut: 0 };
  for (let i = 0; i < n; i++) {
    const st = await ipcStatus(page, i);
    done.bom += st.bom ? 1 : 0;
    done.artwork += st.artwork ? 1 : 0;
    done.cut += st.cut ? 1 : 0;
    console.log(`  │ ${st.label.padEnd(22)} BOM:${st.bom?'✓':'○'} ART:${st.artwork?'✓':'○'} CUT:${st.cut?'✓':'○'}`);
  }
  console.log(`  └─ ${n} IPC | BOM ${done.bom}/${n} · Artwork ${done.artwork}/${n} · Cut&Sew ${done.cut}/${n}\n`);
  return { total: n, ...done };
}

/** verify: is one IPC's BOM done? (call after each IPC) */
export async function expectBomDone(page, ipcIndex) {
  const st = await ipcStatus(page, ipcIndex);
  if (!st.bom) throw new Error(`${st.label}: BOM & WO ✓ not found (save incomplete)`);
  console.log(`  ✓ TRACK: ${st.label} → BOM & WO complete`);
}

// ═══════════════════════════════════════════════════════════════
//  MultiSelectDropdown (ARTWORK categories' TESTING REQUIREMENTS)
//  Source (MultiSelectDropdown.jsx): input placeholder "Add more...",
//   options = <div onMouseDown>OPT</div> (inline style, NO cursor-pointer class),
//   chips = <span> (inline style, NO premium-chip class).
//  A DIFFERENT widget from the BOM TestingRequirementsInput.
// ═══════════════════════════════════════════════════════════════
export async function setMultiSelect(page, box, values, tag) {
  if (!await box.count()) throw new Error(`${tag}: box not found`);
  // Source (MultiSelectDropdown.jsx):
  //  - container onClick => input focus + isOpen=true
  //  - options render ONLY when isOpen && filteredOptions.length>0
  //  - option = <div onMouseDown> (click won't work — needs onMouseDown)
  //  - chip = <span>{val}<button>×</button></span>
  const input = box.locator('input[placeholder="Add more..."]').first();
  const chipSpan = v => box.locator('span').filter({
    hasText: new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i') });

  for (const val of values) {
    if (await chipSpan(val).count()) { console.log(`       ${val}: already present`); continue; }

    await input.scrollIntoViewIfNeeded();
    await input.click();                          // isOpen=true
    // type to filter (options only show when filteredOptions.length>0)
    await input.fill('');
    await input.type(val.slice(0, 4), { delay: 40 });
    await page.waitForTimeout(400);

    // option div (inside the portal box, absolutely positioned)
    const rx = new RegExp(`^\\s*${val.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*$`, 'i');
    const opt = box.locator('div[style*="cursor: pointer"]').filter({ hasText: rx }).first();

    if (await opt.isVisible().catch(()=>false)) {
      // onMouseDown handler → trigger via dispatchEvent (a click won't do it)
      await opt.dispatchEvent('mousedown');
    } else {
      // not in the option list → custom value: Enter adds it
      await input.press('Enter');
    }
    await page.waitForTimeout(300);

    if (!await chipSpan(val).count()) {
      const seen = await box.locator('div[style*="cursor: pointer"]').allInnerTexts().catch(()=>[]);
      throw new Error(`${tag}: chip for "${val}" was not created. Options seen: ${JSON.stringify(seen.slice(0,10))}`);
    }
    // clear the input (for the next value)
    await input.fill('');
    console.log(`       ${val}: ✓`);
  }
}

// ═══════════════════════════════════════════════════════════════
//  CREATABLE dropdown — where the value is NOT already in the list
//  (like YARN COLOUR: placeholder "Select or type Colour").
//
//  The normal pickOption SKIPS 'Add "..."' options — because for
//  fixed-list dropdowns that would create a wrong value. But fields
//  like COLOUR are creatable.
//
//  ─ SOURCE-VERIFIED (TenantDropdown.jsx / react-select CreatableSelect) ─
//  • Component: CreatableSelect (react-select/creatable), unstyled
//  • formatCreateLabel = `Add "<input>"`  → exact text of the create-row
//  • createOptionPosition = "first"       → create-row is at the top
//  • onCreateOption handler → commits the value
//  • DOC comment (source): "a typed value is committed on ENTER or by
//    clicking the `Add "…"` row — NOT silently on blur"
//  • menuPortalTarget = document.body     → menu portals to <body> (so we
//    look for the menu on the whole page, not inside the scope)
//  • Case-insensitive: if the value already exists, select the canonical one
//
//  STRATEGY: type then ENTER (primary — doesn't depend on the label text,
//  so it's robust). If Enter doesn't show the value in the control → click
//  the 'Add "value"' row (fallback). Both paths are source-justified.
//
//  pickOption is NOT touched — all other tests stay safe.
// ═══════════════════════════════════════════════════════════════
export async function setCreatable(page, scope, label, value, tag) {
  const box = field(scope, label);
  if (!await box.count()) throw new Error(`${tag}: label "${label}" not found`);
  const control = box.locator('[class*="-control"]').first();
  if (!await control.count()) throw new Error(`${tag}: dropdown for "${label}" not found`);
  // react-select input (inside the control) — typing happens here
  const input = control.locator('input').first();

  const val   = String(value);
  const escRx = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // NOTE: the \b word-boundary doesn't work around parentheses
  // (like "Natural (Greige)") — so use a plain substring match.
  const valRx = new RegExp(escRx, 'i');

  // did the value get set in the control? (shows in the singleValue text)
  const isSet = async () =>
    await control.getByText(valRx).first().isVisible().catch(() => false);

  for (let a = 1; a <= 3; a++) {
    try {
      await page.keyboard.press('Escape');
      await control.scrollIntoViewIfNeeded();
      await control.click();

      // the menu portals to <body> — search the whole page
      const menu = page.locator('[class*="-menu"]').first();
      await expect(menu, `${tag}: menu did not open`).toBeVisible();

      // type the value (the filter runs on the react-select input)
      await input.fill('');
      await page.keyboard.type(val, { delay: 40 });
      await page.waitForTimeout(300);

      // 1) EXISTING exact option (case-insensitive; source selects canonical)
      const existing = menu.locator('[class*="-option"]')
        .filter({ hasNotText: /^Add "/ })
        .filter({ hasText: new RegExp(`^\\s*${escRx}\\s*$`, 'i') })
        .first();

      if (await existing.isVisible().catch(() => false)) {
        await existing.click();
      } else {
        // 2) PRIMARY: Enter → onCreateOption commit (source: "committed on Enter")
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);

        // 3) FALLBACK: if Enter didn't take, click the 'Add "value"' row
        if (!await isSet()) {
          if (await menu.isVisible().catch(() => false)) {
            const addRow = menu.locator('[class*="-option"]')
              .filter({ hasText: new RegExp(`^\\s*Add\\s+"?${escRx}"?`, 'i') })
              .first();
            if (await addRow.isVisible().catch(() => false)) await addRow.click();
          }
        }
      }

      // VERIFY: is the value in the control now? (a creatable create may show a
      // save spinner, hence the longer timeout). This is a HARD check — if not
      // shown, retry/fail.
      await expect(control, `${tag}: "${val}" not shown in control after create/select`)
        .toContainText(valRx, { timeout: 5000 });

      await page.keyboard.press('Escape');
      console.log(`     ${tag}: "${val}" set (creatable)`);
      return;
    } catch (e) {
      await page.keyboard.press('Escape').catch(() => {});
      if (a === 3) throw new Error(`${tag} — 3 attempts failed: ${e.message}`);
      console.log(`     retry ${a}/3 — ${tag}`);
    }
  }
}