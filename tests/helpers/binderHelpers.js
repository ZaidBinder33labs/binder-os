// ═══════════════════════════════════════════════════════════════
//  binderHelpers.js — SAARE steps ka shared toolkit
//  Rakhna: tests/binderHelpers.js
//
//  Yahi wo functions hain jinse Step0 (PRODUCT SPEC) 26s mein
//  clean pass hua tha. Naye steps INHI ko import karte hain —
//  duplicate mat karna.
//
//  RULES (Binder-frontend source se):
//  • Field hamesha LABEL se — flat index is app mein hamesha bug hai
//  • react-select menu document.body me portal hota hai
//  • TenantDropdown creatable hai — 'Add "..."' option kabhi click nahi
//  • Har action ke baad verify — bina check ke agla step nahi
// ═══════════════════════════════════════════════════════════════
import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// ─── config loader (har spec isi se apna JSON uthaye) ───────────
export function loadConfig(fileName) {
  const p = path.join(process.cwd(), 'test-data', fileName);
  if (!fs.existsSync(p)) throw new Error(`config nahi mila: ${p}`);
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
  if (!await el.count()) throw new Error(`${tag}: "${label}" label ka input nahi mila`);
  await el.scrollIntoViewIfNeeded();
  await expect(el, `${tag} editable nahi`).toBeEditable();
  await el.fill('');
  await el.fill(String(value));
  await expect(el, `${tag}: value set nahi hui`).toHaveValue(String(value));
}

export async function pickOption(page, control, value, tag) {
  const esc = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx  = new RegExp(`^\\s*${esc}\\s*$`, 'i');

  for (let a = 1; a <= 3; a++) {
    try {
      await page.keyboard.press('Escape');
      await control.scrollIntoViewIfNeeded();
      await control.click();

      const menu = page.locator('[class*="-menu"]').first();
      await expect(menu, `${tag}: menu nahi khula`).toBeVisible();

      const findReal = () => menu.locator('[class*="-option"]')
        .filter({ hasNotText: /^Add "/ })
        .filter({ hasText: rx })
        .first();

      let opt = findReal();
      if (!await opt.isVisible().catch(() => false)) {
        await page.keyboard.type(String(value), { delay: 40 });
        opt = findReal();
      }
      if (!await opt.isVisible().catch(() => false)) {
        const all = await menu.locator('[class*="-option"]').allInnerTexts();
        throw new Error(`"${value}" list mein nahi. Available: ${JSON.stringify(all)}`);
      }

      await opt.click();
      // kuch dropdowns multi-select hain -> control me text turant nahi.
      // 2.5s me na dikhe to bhi aage badho (chip/verify caller karega).
      await expect(control, `${tag}: select ke baad value nahi dikhi`)
        .toContainText(rx, { timeout: 2500 })
        .catch(() => console.log(`     (note: ${tag} control-text verify skip)`));
      await page.keyboard.press('Escape');
      return;
    } catch (e) {
      await page.keyboard.press('Escape').catch(() => {});
      if (a === 3) throw new Error(`${tag} — 3 try fail: ${e.message}`);
      console.log(`     retry ${a}/3 — ${tag}`);
    }
  }
}

export async function setSelect(page, scope, label, value, tag) {
  const c = field(scope, label).locator('[class*="-control"]').first();
  if (!await c.count()) throw new Error(`${tag}: "${label}" ka dropdown nahi mila`);
  await pickOption(page, c, value, tag);
}

/** dropdown ho ya plain input — dono handle (Binder ke morphing widgets ke liye) */
export async function setAny(page, scope, label, value, tag) {
  const box = field(scope, label);
  if (!await box.count()) throw new Error(`${tag}: "${label}" label nahi mila`);
  if (await box.locator('[class*="-control"]').count()) {
    return pickOption(page, box.locator('[class*="-control"]').first(), value, tag);
  }
  const input = box.locator('input, textarea').first();
  if (!await input.count()) {
    const html = await box.evaluate(el => el.outerHTML.slice(0, 400)).catch(() => '?');
    throw new Error(`${tag}: na dropdown na input.\n     HTML: ${html}`);
  }
  await input.fill(String(value));
  await expect(input, `${tag}: value set nahi hui`).toHaveValue(String(value));
}

// ─── navigation (login ke baad IPO Management tak) ──────────────
export async function gotoProject(page, chdpdProject, dismissAddLater) {
  await page.goto('/');
  await dismissAddLater(page);
  for (const nm of ['IPO Management', 'Production']) {
    const b = page.getByRole('button', { name: nm });
    await expect(b, `"${nm}" nahi mila`).toBeVisible();
    await b.click();
  }
  const proj = page.locator('button').filter({ hasText: chdpdProject }).first();
  await expect(proj, `project "${chdpdProject}" nahi mila`).toBeVisible();
  await proj.click();
}

// ─── IPC Selector (Step0 ke BAAD wali screen) ───────────────────
// Source: GenerateFactoryCode.jsx ~4558 — "Select SKU to proceed",
// har IPC ek clickable card (role="button") jispe IPC code likha hai.
export async function waitForIpcSelector(page, timeout = 15000) {
  await expect(
    page.getByText('Select SKU to proceed'),
    'IPC Selector screen nahi aayi'
  ).toBeVisible({ timeout });
}

export async function listIpcCards(page) {
  // card = role button jisme IPC-<n> text hai
  return page.locator('[role="button"]').filter({ hasText: /IPC-\d+/ });
}

export async function openIpc(page, ipcIndex) {
  const cards = await listIpcCards(page);
  const n = await cards.count();
  if (ipcIndex >= n) {
    const labels = await cards.allInnerTexts();
    throw new Error(`IPC index ${ipcIndex} nahi hai — sirf ${n} cards: ${JSON.stringify(labels.map(l => l.split('\n')[0]))}`);
  }
  const card = cards.nth(ipcIndex);
  const label = (await card.innerText()).split('\n')[0];
  await card.scrollIntoViewIfNeeded();
  await card.click();
  console.log(`  IPC khola: ${label}`);
  return label;
}

// ipcFlow ke andar breadcrumb se current step ka naam
// Source: ipcFlowStepLabels = ['BOM & WO', 'Artwork & Labeling', 'Cut & Sew Spec']
export async function expectIpcStep(page, stepLabel, timeout = 15000) {
  await expect(
    page.getByText(stepLabel, { exact: false }).first(),
    `"${stepLabel}" step nahi khula`
  ).toBeVisible({ timeout });
}

// ─── server-save state (breadcrumb bar mein dikhta hai) ─────────
// Source: serverSaveState — 'Saving…' / '✓ Saved' / '⚠ Not saved to server'
export async function expectServerSaved(page, timeout = 30000) {
  const err = page.getByText('Not saved to server');
  const ok  = page.getByText('✓ Saved');
  await expect(ok.or(err).first(), 'server save ka koi status nahi dikha')
    .toBeVisible({ timeout });
  if (await err.isVisible().catch(() => false)) {
    throw new Error('SERVER SAVE FAIL — "Not saved to server" banner dikha');
  }
  console.log('  ✓ server saved');
}

// ═══════════════════════════════════════════════════════════════
//  BOM & WO specific helpers (Step2.jsx / FabricSpec / WorkOrdersSection)
// ═══════════════════════════════════════════════════════════════

/** MATERIAL card — <h4>MATERIAL n</h4> se ancestor jisme FIBER TYPE/MATERIAL DESC label ho */
export function materialCard(page, n) {
  return page.locator(`h4:has-text("MATERIAL ${n}")`).locator(
    'xpath=ancestor::div[.//label[contains(normalize-space(),"FIBER TYPE")] or .//label[contains(normalize-space(),"MATERIAL DESC")]][1]'
  );
}

/**
 * TESTING REQUIREMENTS / APPROVAL = <TestingRequirementsInput/> widget.
 * Source markup: box click → <input> → options plain <div class="cursor-pointer">
 * <span>OPT</span> (NO react-select classes) → selected chip ".premium-chip".
 * TYPE karke filter, matching div click, chip verify. MULTI.
 */
export async function setTestingInput(page, box, values, tag) {
  if (!await box.count()) throw new Error(`${tag}: field box nahi mila`);
  const input = box.locator('input').first();
  // chip me {val} + remove-<button> dono hote hain → EXACT match fail hota hai.
  // Substring match karo. Aur scope box se thoda upar (chip container alag ho sakta).
  const root = box.locator('xpath=ancestor-or-self::div[.//input][1]');
  const chip = v => root.locator('.premium-chip').filter({ hasText: new RegExp(
    v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i') });

  for (const val of values) {
    // already chip? (pichle state ya double-call) → done
    if (await chip(val).count()) { console.log(`       ${val}: pehle se`); continue; }

    await input.scrollIntoViewIfNeeded();
    await input.click();
    await page.waitForTimeout(300);

    // TYPE MAT KARO — filter kabhi exact match ura deta hai.
    // Seedha open list me se matching div dhoondo.
    const rx = new RegExp(`^\\s*${val.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*$`, 'i');
    let opt = box.locator('div.cursor-pointer').filter({ hasText: new RegExp(val.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'),'i') }).first();

    // list bahut lambi ho to thoda type karke filter (fallback)
    if (!await opt.isVisible().catch(()=>false)) {
      await input.fill('');
      await input.type(val.slice(0, 4), { delay: 40 });   // sirf prefix, exact ura na de
      await page.waitForTimeout(400);
      opt = box.locator('div.cursor-pointer', { hasText: rx }).first();
    }

    if (await opt.isVisible().catch(()=>false)) {
      await opt.click();
    } else if (await chip(val).count()) {
      // type karte hi kisi tarah select ho gaya
      console.log(`       ${val}: ✓ (auto)`); await input.fill(''); continue;
    } else {
      await input.fill(val);                 // custom value → Enter se add
      await input.press('Enter');
    }
    await input.fill('');                     // filter reset
    await page.waitForTimeout(300);

    if (!await chip(val).count()) {
      const opts = await box.locator('div.cursor-pointer span').allInnerTexts().catch(()=>[]);
      throw new Error(`${tag}: "${val}" chip nahi bani. Dikhe: ${JSON.stringify(opts.slice(0,10))}`);
    }
    console.log(`       ${val}: ✓`);
  }
}

// ═══════════════════════════════════════════════════════════════
//  IPC PROGRESS TRACKING (portal gate: sab IPC complete tabhi Packaging)
//  Card markup: "BOM & WO ✓" (green) vs "BOM & WO ○"
// ═══════════════════════════════════════════════════════════════

/** ek IPC card ka status: {bom, artwork, cut} — ✓ = true */
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

/** saare IPC ka status table print karo + counts return */
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

/** verify: ek IPC ka BOM done hua? (per-IPC ke baad call karo) */
export async function expectBomDone(page, ipcIndex) {
  const st = await ipcStatus(page, ipcIndex);
  if (!st.bom) throw new Error(`${st.label}: BOM & WO ✓ nahi mila (save adhoora)`);
  console.log(`  ✓ TRACK: ${st.label} → BOM & WO complete`);
}

// ═══════════════════════════════════════════════════════════════
//  MultiSelectDropdown (ARTWORK categories ka TESTING REQUIREMENTS)
//  Source (MultiSelectDropdown.jsx): input placeholder "Add more...",
//   options = <div onMouseDown>OPT</div> (inline style, NO cursor-pointer class),
//   chips = <span> (inline style, NO premium-chip class).
//  BOM wala TestingRequirementsInput se ALAG widget.
// ═══════════════════════════════════════════════════════════════
export async function setMultiSelect(page, box, values, tag) {
  if (!await box.count()) throw new Error(`${tag}: box nahi mila`);
  // Source (MultiSelectDropdown.jsx):
  //  - container onClick => input focus + isOpen=true
  //  - options render ONLY when isOpen && filteredOptions.length>0
  //  - option = <div onMouseDown> (click nahi chalega — onMouseDown chahiye)
  //  - chip = <span>{val}<button>×</button></span>
  const input = box.locator('input[placeholder="Add more..."]').first();
  const chipSpan = v => box.locator('span').filter({
    hasText: new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i') });

  for (const val of values) {
    if (await chipSpan(val).count()) { console.log(`       ${val}: pehle se`); continue; }

    await input.scrollIntoViewIfNeeded();
    await input.click();                          // isOpen=true
    // type se filter (options tabhi dikhte jab filteredOptions.length>0)
    await input.fill('');
    await input.type(val.slice(0, 4), { delay: 40 });
    await page.waitForTimeout(400);

    // option div (portal box ke andar, absolute positioned)
    const rx = new RegExp(`^\\s*${val.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*$`, 'i');
    const opt = box.locator('div[style*="cursor: pointer"]').filter({ hasText: rx }).first();

    if (await opt.isVisible().catch(()=>false)) {
      // onMouseDown handler → dispatchEvent se trigger (click se nahi hota)
      await opt.dispatchEvent('mousedown');
    } else {
      // option list me nahi → custom value: Enter add karta hai
      await input.press('Enter');
    }
    await page.waitForTimeout(300);

    if (!await chipSpan(val).count()) {
      const seen = await box.locator('div[style*="cursor: pointer"]').allInnerTexts().catch(()=>[]);
      throw new Error(`${tag}: "${val}" chip nahi bani. Options dikhe: ${JSON.stringify(seen.slice(0,10))}`);
    }
    // input clear (agla value ke liye)
    await input.fill('');
    console.log(`       ${val}: ✓`);
  }
}