// ═══════════════════════════════════════════════════════════════
//  runtimeHelpers.js — glue for the buyer→IPO→pipeline chain
//  Location: tests/helpers/runtimeHelpers.js
//
//  TWO JOBS:
//   1. Runtime handoff — write and read buyer.json / current-ipo.json
//      in .runtime/. This is how every spec knows "which IPO" to use.
//      (Same pattern as .auth/user.json — one run's state in one file,
//       passed to the next spec.)
//   2. API verification — hit the buyer-codes & ipos endpoints directly
//      and ASSERT (not relying on the UI). Auth = Bearer token captured
//      in .auth/user.json's localStorage.
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

// backend base — trailing slash guaranteed (present in source default)
export const API_BASE =
  (process.env.VITE_API_URL || 'https://binder-backend-0szj.onrender.com/api/')
    .replace(/\/?$/, '/');

// ─── runtime read/write ─────────────────────────────────────────
export function writeRuntime(file, obj) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...obj, _writtenAt: new Date().toISOString() }, null, 2));
  console.log(`  📝 runtime: ${path.relative(process.cwd(), file)} written`);
}

export function readRuntime(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

/**
 * Resolve the IPO that Part 1–3 will run against. Priority:
 *   1. BINDER_PROJECT env  (manually run against some older IPO)
 *   2. .runtime/current-ipo.json  (just created by 02-ipo.spec)
 *   3. cfg.navigation.chdpdProject  (old hardcoded fallback — nothing breaks)
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

// ─── auth token (from .auth/user.json's localStorage) ───────────
// Playwright's storageState re-sends cookies, but Binder keeps the JWT
// in localStorage (not in a cookie) — so we extract the token ourselves
// and build the Bearer header.
export function accessTokenFromStorage() {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error(`.auth/user.json not found — run setup (login) first`);
  }
  const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  for (const o of state.origins ?? []) {
    const hit = (o.localStorage ?? []).find(x => x.name === 'access_token');
    if (hit?.value) return hit.value;
  }
  throw new Error('access_token not found in .auth/user.json localStorage');
}

/**
 * Build a request-context with the Authorization header attached.
 * In the spec: test(..., async ({ page, playwright }) => {
 *            const api = await apiContext(playwright);
 * playwright.request.newContext() exists in every supported version (1.16+).
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

// list payloads come in different shapes (source: results|data|[])
const items = (p) =>
  Array.isArray(p) ? p
  : Array.isArray(p?.results) ? p.results
  : Array.isArray(p?.data) ? p.data
  : Array.isArray(p?.data?.results) ? p.data.results
  : [];

// ─── BUYER: API verify ──────────────────────────────────────────
/** all buyer codes (strings) — GET ims/buyer-codes/ */
export async function apiListBuyerCodes(api) {
  const res = await api.get('ims/buyer-codes/');
  expect(res.ok(), `GET buyer-codes ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return items(body).map(b => b.code || b.id).filter(Boolean);
}

/** ASSERT: the given buyer code exists in the backend list */
export async function apiAssertBuyerExists(api, code) {
  const all = await apiListBuyerCodes(api);
  expect(all, `buyer code "${code}" not in API list (got: ${JSON.stringify(all.slice(0, 12))})`)
    .toContain(code);
  console.log(`  ✅ API verify: buyer code ${code} exists`);
}

/**
 * FIELD-LEVEL read-back: read the buyer code's full record from the backend
 * and EXACT-match every field (buyerName / endCustomer / contactPerson).
 * (apiAssertBuyerExists only checks "does the code exist?" — this checks
 *  "does that code hold the correct data?")
 *
 * Backend fields (source: GenerateBuyerCode.jsx — verified):
 *   buyer_name, retailer (=End Customer), contact_person, code
 */
export async function apiVerifyBuyerFields(api, code, expected) {
  const res = await api.get('ims/buyer-codes/');
  expect(res.ok(), `GET buyer-codes ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const list = items(body);

  // find the record with that code
  const rec = list.find(b => String(b.code || b.id) === String(code));
  expect(rec, `record for buyer code "${code}" not found in backend`).toBeTruthy();

  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const check = (label, actualKeys, want) => {
    if (want == null) return;                       // not provided in expected → skip
    let actual;
    for (const k of actualKeys) if (rec[k] != null && rec[k] !== '') { actual = rec[k]; break; }
    expect(norm(actual),
      `${label}: wrong in backend — expected "${want}", got "${actual ?? '(empty)'}"`
    ).toBe(norm(want));
    console.log(`     ✓ ${label}: "${actual}"`);
  };

  console.log(`  🔎 FIELD VERIFY: buyer ${code}`);
  check('BUYER NAME',    ['buyer_name', 'buyerName'],       expected.buyerName);
  check('END CUSTOMER',  ['retailer', 'end_customer'],      expected.endCustomer);
  check('CONTACT PERSON',['contact_person', 'contactPerson'], expected.contactPerson);
  console.log(`  ✅ buyer ${code} — all fields BACKEND-VERIFIED`);
  return rec;
}

// ─── IPO: API verify ────────────────────────────────────────────
/** find one IPO record by ipo_code — GET ims/ipos/ */
export async function apiFindIpo(api, ipoCode) {
  const res = await api.get('ims/ipos/');
  expect(res.ok(), `GET ipos ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return items(body).find(x => (x.ipo_code || x.ipoCode) === ipoCode) || null;
}

/**
 * ASSERT: the IPO exists in the backend; optional buyer code match.
 * Return: that record (for reading status/tracking later).
 */
export async function apiAssertIpo(api, ipoCode, { buyerCode } = {}) {
  const rec = await apiFindIpo(api, ipoCode);
  expect(rec, `IPO "${ipoCode}" not found in API`).toBeTruthy();
  if (buyerCode) {
    const got = rec.buyer_code_text || rec.buyerCode || '';
    expect(got, `IPO ${ipoCode} has wrong buyer_code_text: "${got}" (expected "${buyerCode}")`)
      .toBe(buyerCode);
  }
  console.log(`  ✅ API verify: IPO ${ipoCode} exists` + (buyerCode ? ` (buyer ${buyerCode})` : ''));
  return rec;
}