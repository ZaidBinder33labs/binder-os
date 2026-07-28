// ═══════════════════════════════════════════════════════════════
//  runtimeHelpers.js — buyer→IPO→pipeline chain ka glue
//  Rakhna: tests/runtimeHelpers.js
//
//  DO KAAM:
//   1. Runtime handoff — buyer.json / current-ipo.json .runtime/ me
//      likho aur padho. Yahi se saare specs "kaunsa IPO" jaante hain.
//      (bilkul .auth/user.json wale pattern jaisa — ek run ki state
//       ek file me, agle spec ko pass.)
//   2. API verification — buyer-codes & ipos endpoints seedhe hit karke
//      ASSERT karo (UI ke bharose nahi). Auth = Bearer token jo
//      .auth/user.json ke localStorage me capture hua hai.
//
//  SOURCE-VERIFIED (Binder-frontend):
//   • API base   : import.meta.env.VITE_API_URL ||
//                  'https://binder-backend-0szj.onrender.com/api/'
//   • auth       : authService.getAccessToken() =
//                  localStorage.getItem('access_token') → 'Bearer <t>'
//   • buyer list : GET  ims/buyer-codes/      → {results|data|[]} , item.code
//   • buyer make : POST ims/buyer-codes/      → {status,data:{code,...}}
//   • IPO  list  : GET  ims/ipos/             → item.ipo_code / buyer_code_text
//   • IPO  make  : POST ims/ipos/             → {status,data:{ipo_code,po_sr_no,id}}
// ═══════════════════════════════════════════════════════════════
import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// ─── paths ──────────────────────────────────────────────────────
const RUNTIME_DIR = path.join(process.cwd(), '.runtime');
const AUTH_FILE   = path.join(process.cwd(), '.auth', 'user.json');

export const BUYER_FILE = path.join(RUNTIME_DIR, 'buyer.json');
export const IPO_FILE   = path.join(RUNTIME_DIR, 'current-ipo.json');

// backend base — trailing slash guaranteed (source default me hai)
export const API_BASE =
  (process.env.VITE_API_URL || 'https://binder-backend-0szj.onrender.com/api/')
    .replace(/\/?$/, '/');

// ─── runtime read/write ─────────────────────────────────────────
export function writeRuntime(file, obj) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...obj, _writtenAt: new Date().toISOString() }, null, 2));
  console.log(`  📝 runtime: ${path.relative(process.cwd(), file)} Written`);
}

export function readRuntime(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

/**
 * Jis IPO pe Part 1–3 chalenge wo resolve karo. Priority:
 *   1. BINDER_PROJECT env  (kisi purane IPO pe manually chalao)
 *   2. .runtime/current-ipo.json  (abhi 02-ipo.spec ne banaya)
 *   3. cfg.navigation.chdpdProject  (purana hardcoded fallback — kuch nahi tootta)
 */
export function resolveProject(cfg) {
  if (process.env.BINDER_PROJECT) {
    console.log(`  🔗 project (env): ${process.env.BINDER_PROJECT}`);
    return process.env.BINDER_PROJECT;
  }
  const rt = readRuntime(IPO_FILE);
  if (rt?.ipoCode) {
    console.log(`  🔗 project (runtime): ${rt.ipoCode}`);
    return rt.ipoCode;
  }
  console.log(`  🔗 project (fallback JSON): ${cfg.navigation.chdpdProject}`);
  return cfg.navigation.chdpdProject;
}

// ─── auth token (.auth/user.json ke localStorage se) ────────────
// Playwright ka storageState cookies dobara bhej deta hai, par Binder
// JWT localStorage me rakhta hai (cookie me nahi) — isliye token khud
// nikaal kar Bearer header banate hain.
export function accessTokenFromStorage() {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error(`.auth/user.json nahi mila — pehle setup (login) chalao`);
  }
  const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  for (const o of state.origins ?? []) {
    const hit = (o.localStorage ?? []).find(x => x.name === 'access_token');
    if (hit?.value) return hit.value;
  }
  throw new Error('access_token .auth/user.json ke localStorage me nahi mila');
}

/**
 * request-context banao jisme Authorization header laga ho.
 * Spec me: test(..., async ({ page, playwright }) => {
 *            const api = await apiContext(playwright);
 * playwright.request.newContext() har supported version (1.16+) me hota hai.
 */
export async function apiContext(playwright) {
  const token = accessTokenFromStorage();
  return await playwright.request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
}

// list payloads alag-alag shape me aate hain (source: results|data|[])
const items = (p) =>
  Array.isArray(p) ? p
  : Array.isArray(p?.results) ? p.results
  : Array.isArray(p?.data) ? p.data
  : Array.isArray(p?.data?.results) ? p.data.results
  : [];

// ─── BUYER: API verify ──────────────────────────────────────────
/** saare buyer codes (strings) — GET ims/buyer-codes/ */
export async function apiListBuyerCodes(api) {
  const res = await api.get('ims/buyer-codes/');
  expect(res.ok(), `GET buyer-codes ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return items(body).map(b => b.code || b.id).filter(Boolean);
}

/** ASSERT: diya gaya buyer code backend ki list me maujood hai */
export async function apiAssertBuyerExists(api, code) {
  const all = await apiListBuyerCodes(api);
  expect(all, `buyer code "${code}" API list me nahi (mile: ${JSON.stringify(all.slice(0, 12))})`)
    .toContain(code);
  console.log(`  ✅ API verify: buyer code ${code} exists`);
}

/**
 * FIELD-LEVEL read-back: buyer code ka poora record backend se padho aur
 * har field (buyerName / endCustomer / contactPerson) EXACT match karo.
 * (apiAssertBuyerExists sirf "code hai?" — ye "us code me sahi data hai?")
 *
 * Backend fields (source: GenerateBuyerCode.jsx — verified):
 *   buyer_name, retailer (=End Customer), contact_person, code
 */
export async function apiVerifyBuyerFields(api, code, expected) {
  const res = await api.get('ims/buyer-codes/');
  expect(res.ok(), `GET buyer-codes ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const list = items(body);

  // us code wala record dhoondo
  const rec = list.find(b => String(b.code || b.id) === String(code));
  expect(rec, `buyer code "${code}" ka record backend me nahi mila`).toBeTruthy();

  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const check = (label, actualKeys, want) => {
    if (want == null) return;                       // expected me nahi diya to skip
    let actual;
    for (const k of actualKeys) if (rec[k] != null && rec[k] !== '') { actual = rec[k]; break; }
    expect(norm(actual),
      `${label}: backend me galat — chaha "${want}", mila "${actual ?? '(khali)'}"`
    ).toBe(norm(want));
    console.log(`     ✓ ${label}: "${actual}"`);
  };

  console.log(`  🔎 FIELD VERIFY: buyer ${code}`);
  check('BUYER NAME',    ['buyer_name', 'buyerName'],       expected.buyerName);
  check('END CUSTOMER',  ['retailer', 'end_customer'],      expected.endCustomer);
  check('CONTACT PERSON',['contact_person', 'contactPerson'], expected.contactPerson);
  console.log(`  ✅ buyer ${code} — saare fields BACKEND-VERIFIED`);
  return rec;
}

// ─── IPO: API verify ────────────────────────────────────────────
/** ek IPO record dhoondo by ipo_code — GET ims/ipos/ */
export async function apiFindIpo(api, ipoCode) {
  const res = await api.get('ims/ipos/');
  expect(res.ok(), `GET ipos ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return items(body).find(x => (x.ipo_code || x.ipoCode) === ipoCode) || null;
}

/**
 * ASSERT: IPO backend me maujood hai; optional buyer code match.
 * Return: wo record (aage status/tracking padhne ke liye).
 */
export async function apiAssertIpo(api, ipoCode, { buyerCode } = {}) {
  const rec = await apiFindIpo(api, ipoCode);
  expect(rec, `IPO "${ipoCode}" API me nahi mila`).toBeTruthy();
  if (buyerCode) {
    const got = rec.buyer_code_text || rec.buyerCode || '';
    expect(got, `IPO ${ipoCode} ka buyer_code_text galat: "${got}" (chaha "${buyerCode}")`)
      .toBe(buyerCode);
  }
  console.log(`  ✅ API verify: IPO ${ipoCode} exists` + (buyerCode ? ` (buyer ${buyerCode})` : ''));
  return rec;
}