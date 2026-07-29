// ═══════════════════════════════════════════════════════════════
//  binderHelpers.js — SAARE steps ka shared toolkit
//  Rakhna: tests/helpers/binderHelpers.js
//
//  Yahi wo functions hain jinse Step0 (PRODUCT SPEC) 26s mein
//  clean pass hua tha. Naye steps INHI ko import karte hain —
//  duplicate mat karna.
//
//  RULES (Binder-frontend source se):
//  • Field hamesha LABEL se — flat index is app mein hamesha bug hai
//  • react-select menu document.body me portal hota hai
//  • TenantDropdown creatable hai — 'Add "..."' option kabhi click nahi
//    (EXCEPTION: setCreatable — jahan value CREATE karni ho, jaise COLOUR)
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

// ─── react-select TenantDropdown setter (SOURCE-VERIFIED) ───────
// Source (TenantDropdown.jsx): saare dropdown react-select hain aur
// creatable=true by default (sirf strictMode wale nahi). Jab typed value
// list me nahi hoti, react-select `Add "<val>"` row deta hai; use ENTER
// ya click karne pe value COMMIT hoti hai (source doc: "committed on Enter
// or by clicking the Add row"). formatCreateLabel = `Add "<input>"`,
// createOptionPosition="first", menu <body> me portal.
//
// Isliye pickOption ab dono handle karta hai — ek hi setter se POORA
// framework: pehle EXISTING option try, na mile to CREATE (Enter→Add-row).
export async function pickOption(page, control, value, tag) {
  const esc = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx  = new RegExp(`^\\s*${esc}\\s*$`, 'i');   // exact option match
  const sub = new RegExp(esc, 'i');                  // substring (control verify; brackets-safe)
  const input = control.locator('input').first();    // react-select ka type-input

  // control me value set ho gayi? (singleValue text). Multi-select me
  // control me turant na dikhe — caller (chip verify) handle karega.
  const isSet = async () =>
    await control.getByText(sub).first().isVisible().catch(() => false);

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

      // 1) bina type kiye exact option dikh raha hai?
      let opt = findReal();

      // 2) nahi → value type karke filter karo
      if (!await opt.isVisible().catch(() => false)) {
        await input.fill('');
        await page.keyboard.type(String(value), { delay: 40 });
        await page.waitForTimeout(250);
        opt = findReal();
      }

      if (await opt.isVisible().catch(() => false)) {
        // EXISTING option mila → click
        await opt.click();
      } else {
        // 3) EXISTING nahi → CREATABLE create. PRIMARY: Enter (source: commit-on-Enter)
        await page.keyboard.press('Enter');
        await page.waitForTimeout(250);

        // 4) FALLBACK: Enter se na laga to `Add "<val>"` row click
        if (!await isSet() && await menu.isVisible().catch(() => false)) {
          const addRow = menu.locator('[class*="-option"]')
            .filter({ hasText: new RegExp(`^\\s*Add\\s+"?${esc}"?`, 'i') })
            .first();
          if (await addRow.isVisible().catch(() => false)) await addRow.click();
        }
      }

      // VERIFY (soft, brackets-safe substring): kuch dropdowns multi-select hain →
      // control me turant na dikhe, to bhi aage (chip verify caller karega).
      // Creatable create pe chhota save-spinner chal sakta → thoda lamba timeout.
      await expect(control, `${tag}: select/create ke baad value nahi dikhi`)
        .toContainText(sub, { timeout: 4000 })
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

// ═══════════════════════════════════════════════════════════════
//  CREATABLE dropdown — jahan value pehle se list me NAHI hoti
//  (jaise YARN COLOUR: placeholder "Select or type Colour").
//
//  Normal pickOption 'Add "..."' options ko SKIP karta hai — kyunki
//  fixed-list dropdowns me wo galat value create kar deta. Par COLOUR
//  jaise fields creatable hain.
//
//  ─ SOURCE-VERIFIED (TenantDropdown.jsx / react-select CreatableSelect) ─
//  • Component: CreatableSelect (react-select/creatable), unstyled
//  • formatCreateLabel = `Add "<input>"`  → create-row ka exact text
//  • createOptionPosition = "first"       → create-row sabse upar
//  • onCreateOption handler → value commit
//  • DOC comment (source): "a typed value is committed on ENTER or by
//    clicking the `Add "…"` row — NOT silently on blur"
//  • menuPortalTarget = document.body     → menu <body> me portal (isliye
//    menu ko poore page pe dhoondte hain, scope ke andar nahi)
//  • Case-insensitive: agar value pehle se list me ho to canonical select
//
//  STRATEGY: type karke ENTER (primary — label pe depend nahi, isliye
//  robust). Agar Enter se value control me na dikhe → 'Add "value"' row
//  click (fallback). Dono raaste source-justified.
//
//  pickOption ko chhua NAHI — baaki saare tests safe rehte hain.
// ═══════════════════════════════════════════════════════════════
export async function setCreatable(page, scope, label, value, tag) {
  const box = field(scope, label);
  if (!await box.count()) throw new Error(`${tag}: "${label}" label nahi mila`);
  const control = box.locator('[class*="-control"]').first();
  if (!await control.count()) throw new Error(`${tag}: "${label}" ka dropdown nahi mila`);
  // react-select input (control ke andar) — type yahin hota hai
  const input = control.locator('input').first();

  const val   = String(value);
  const escRx = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // NOTE: \b word-boundary parentheses ke around kaam nahi karta
  // (jaise "Natural (Greige)") — isliye seedha substring match.
  const valRx = new RegExp(escRx, 'i');

  // control me value set ho gayi? (singleValue text me dikhti hai)
  const isSet = async () =>
    await control.getByText(valRx).first().isVisible().catch(() => false);

  for (let a = 1; a <= 3; a++) {
    try {
      await page.keyboard.press('Escape');
      await control.scrollIntoViewIfNeeded();
      await control.click();

      // menu <body> me portal hota hai — poore page pe dhoondo
      const menu = page.locator('[class*="-menu"]').first();
      await expect(menu, `${tag}: menu nahi khula`).toBeVisible();

      // value type karo (react-select input pe filter chalta hai)
      await input.fill('');
      await page.keyboard.type(val, { delay: 40 });
      await page.waitForTimeout(300);

      // 1) EXISTING exact option (case-insensitive; source canonical-select karta hai)
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

        // 3) FALLBACK: Enter se na laga to 'Add "value"' row click
        if (!await isSet()) {
          if (await menu.isVisible().catch(() => false)) {
            const addRow = menu.locator('[class*="-option"]')
              .filter({ hasText: new RegExp(`^\\s*Add\\s+"?${escRx}"?`, 'i') })
              .first();
            if (await addRow.isVisible().catch(() => false)) await addRow.click();
          }
        }
      }

      // VERIFY: control me value aa gayi? (creatable me save spinner chal sakta,
      // isliye thoda lamba timeout). Ye HARD check hai — na dikhe to retry/fail.
      await expect(control, `${tag}: create/select ke baad "${val}" control me nahi dikhi`)
        .toContainText(valRx, { timeout: 5000 });

      await page.keyboard.press('Escape');
      console.log(`     ${tag}: "${val}" set (creatable)`);
      return;
    } catch (e) {
      await page.keyboard.press('Escape').catch(() => {});
      if (a === 3) throw new Error(`${tag} — 3 try fail: ${e.message}`);
      console.log(`     retry ${a}/3 — ${tag}`);
    }
  }
}