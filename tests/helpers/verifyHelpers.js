// ═══════════════════════════════════════════════════════════════
//  verifyHelpers.js — PRODUCTION QA ASSERTION LAYER (v2 — FIXED)
//  Location: tests/helpers/verifyHelpers.js
//
//  WHAT CHANGED (v1 failed):
//   • v1 read the `factory-codes` (COMMITTED) endpoint → 0 rows, because
//     BOM/Artwork/CutSew are still at the "DRAFT/section" stage (committed
//     only happens once the whole wizard + packaging is finally committed).
//   • FIX: read `factory-codes/sections/?ipo_id=` (DRAFT). This is the store
//     each step's Save writes to immediately (source-verified:
//     GenerateFactoryCode.jsx → persistSection('bomwo'/'artwork'/'cutsew')).
//
//  SECTION SHAPE (source: GenerateFactoryCode.jsx ~2430, verified):
//   sections endpoint → { sections: [ { sku_key, section, payload } ] }
//     section='bomwo'  → payload.rawMaterials[] each: {
//         componentName, materialType,
//         fabricFiberType, fabricName, fabricComposition, gsm,   ← FABRIC
//         fiberType, yarnType,                                    ← YARN
//         ...
//     }
//     section='artwork'→ payload.artworkMaterials[]
//     section='cutsew' → payload.workOrderSpecs[] / sizes
//   sku_key = SKU index as string ('0','1',...) — maps to the IPC index.
//
//  WHY NON-FLAKY: we read from the backend DRAFT store, not the UI.
//   Not "was it saved" — "did the CORRECT value persist in the backend?" — real QA.
// ═══════════════════════════════════════════════════════════════
import { expect } from '@playwright/test';

const pick = (obj, ...keys) => {
  for (const k of keys) if (obj && obj[k] != null && obj[k] !== '') return obj[k];
  return undefined;
};
const norm = (v) => String(v ?? '').trim().toLowerCase();

export function assertField(label, actual, expected) {
  expect(norm(actual),
    `${label}: wrong in backend — expected "${expected}", got "${actual ?? '(empty)'}"`
  ).toBe(norm(expected));
}
export function assertContains(label, actual, expected) {
  expect(norm(actual).includes(norm(expected)),
    `${label}: "${expected}" not found in backend value "${actual ?? '(empty)'}"`
  ).toBeTruthy();
}

// ── DRAFT sections from the backend (each step's Save writes here) ──
export async function fetchSections(api, ipoId) {
  if (!ipoId) throw new Error('fetchSections: ipoId required (.runtime/current-ipo.json)');
  const res = await api.get(`ims/factory-codes/sections/?ipo_id=${encodeURIComponent(ipoId)}`);
  expect(res.ok(), `GET sections ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const sections = Array.isArray(body?.sections) ? body.sections
    : Array.isArray(body) ? body
    : Array.isArray(body?.results) ? body.results : [];
  return sections; // [] is also valid (the caller decides)
}

// get one section's payload against a sku_key ('0','1'..)
function sectionPayload(sections, skuKey, sectionName) {
  const row = sections.find(s =>
    String(pick(s, 'sku_key', 'skuKey')) === String(skuKey) &&
    norm(pick(s, 'section')) === norm(sectionName)
  );
  return row ? (row.payload ?? row.slice ?? null) : null;
}

// IPC index (0-based) → sku_key. Source (GenerateFactoryCode.jsx:66):
// format 'product_0' / 'product_1' ... (subproduct_ is separate). Main SKU = product_N.
const skuKeyForIpc = (ipcIndex) => `product_${ipcIndex}`;

// ═══════════════════════════════════════════════════════════════
//  BOM verify — section 'bomwo' → rawMaterials[] field-by-field
// ═══════════════════════════════════════════════════════════════
export function verifyBomFromSections(sections, ipcIndex, componentName, exp) {
  const skuKey = skuKeyForIpc(ipcIndex);
  const payload = sectionPayload(sections, skuKey, 'bomwo');
  expect(payload, `IPC${ipcIndex} (sku ${skuKey}): 'bomwo' section not in backend`).toBeTruthy();

  const rms = payload.rawMaterials || payload.raw_materials || [];
  const rm = rms.find(m => norm(pick(m, 'componentName', 'component_name', 'name')) === norm(componentName));
  expect(rm, `IPC${ipcIndex} "${componentName}": raw material not found in section`).toBeTruthy();

  // FABRIC material fields (source: fabricFiberType/fabricName/fabricComposition/gsm)
  if (exp.fiberType)   assertField(`${componentName} FIBER`,   pick(rm, 'fabricFiberType', 'fiberType'), exp.fiberType);
  if (exp.fabricName)  assertField(`${componentName} FABRIC`,  pick(rm, 'fabricName'), exp.fabricName);
  if (exp.composition) assertContains(`${componentName} COMPOSITION`, pick(rm, 'fabricComposition', 'composition'), exp.composition);
  if (exp.gsm)         assertField(`${componentName} GSM`,     pick(rm, 'gsm', 'GSM'), exp.gsm);
  // Optional fields (Phase-1 full coverage) — verify only when provided in the JSON
  if (exp.fiberCategory)   assertField(`${componentName} FIBER-CAT`, pick(rm, 'fabricFiberCategory', 'fiberCategory'), exp.fiberCategory);
  if (exp.constructionType)assertField(`${componentName} CONSTRUCTION`, pick(rm, 'constructionType'), exp.constructionType);
  if (exp.weaveKnitType)   assertField(`${componentName} WEAVE/KNIT`, pick(rm, 'weaveKnitType'), exp.weaveKnitType);
  if (exp.machineType)     assertField(`${componentName} MACHINE`, pick(rm, 'fabricMachineType', 'machineType'), exp.machineType);
  if (exp.origin)          assertField(`${componentName} ORIGIN`, pick(rm, 'fabricOrigin', 'origin'), exp.origin);
  console.log(`  ✅ VERIFY BOM: ${componentName} → ${exp.fiberType}/${exp.fabricName} (backend match)`);
}

// ═══════════════════════════════════════════════════════════════
//  YARN verify — section 'bomwo' → rawMaterials[] (yarn fields)
//  Backend keys: fiberType, yarnType, yarnComposition, yarnCountRange,
//  yarnPlyOptions, fiberCategory, origin, yarnColour, ...
// ═══════════════════════════════════════════════════════════════
export function verifyYarnFromSections(sections, ipcIndex, componentName, exp) {
  const skuKey = skuKeyForIpc(ipcIndex);
  const payload = sectionPayload(sections, skuKey, 'bomwo');
  expect(payload, `IPC${ipcIndex} (sku ${skuKey}): 'bomwo' section not in backend`).toBeTruthy();

  const rms = payload.rawMaterials || payload.raw_materials || [];
  const rm = rms.find(m => norm(pick(m, 'componentName', 'component_name', 'name')) === norm(componentName));
  expect(rm, `IPC${ipcIndex} "${componentName}": yarn material not found in section`).toBeTruthy();

  if (exp.fiberType)     assertField(`${componentName} YARN-FIBER`, pick(rm, 'fiberType'), exp.fiberType);
  if (exp.yarnType)      assertField(`${componentName} YARN-TYPE`,  pick(rm, 'yarnType'), exp.yarnType);
  if (exp.composition)   assertContains(`${componentName} YARN-COMP`, pick(rm, 'yarnComposition', 'composition'), exp.composition);
  if (exp.countRange)    assertField(`${componentName} COUNT-RANGE`, pick(rm, 'yarnCountRange', 'countRange'), exp.countRange);
  if (exp.plyOptions)    assertField(`${componentName} PLY`, pick(rm, 'yarnPlyOptions', 'plyOptions'), exp.plyOptions);
  if (exp.fiberCategory) assertField(`${componentName} FIBER-CAT`, pick(rm, 'fiberCategory'), exp.fiberCategory);
  if (exp.origin)        assertField(`${componentName} ORIGIN`, pick(rm, 'origin', 'fabricOrigin'), exp.origin);
  console.log(`  ✅ VERIFY YARN: ${componentName} → ${exp.fiberType}/${exp.yarnType} (backend match)`);
}

// ═══════════════════════════════════════════════════════════════
//  Artwork verify — section 'artwork' → artworkMaterials[]
// ═══════════════════════════════════════════════════════════════
export function verifyArtworkFromSections(sections, ipcIndex, exp) {
  const skuKey = skuKeyForIpc(ipcIndex);
  const payload = sectionPayload(sections, skuKey, 'artwork');
  expect(payload, `IPC${ipcIndex}: 'artwork' section not in backend`).toBeTruthy();

  const ams = payload.artworkMaterials || payload.artwork_materials || [];
  const am = ams.find(m => norm(pick(m, 'artworkCategory', 'category')) === norm(exp.category));
  expect(am, `IPC${ipcIndex}: artwork (${exp.category}) not found in section`).toBeTruthy();
  if (exp.category) assertField(`IPC${ipcIndex} CATEGORY`, pick(am, 'artworkCategory', 'category'), exp.category);
  console.log(`  ✅ VERIFY ARTWORK: IPC${ipcIndex} → ${exp.category} (backend match)`);
}

// ═══════════════════════════════════════════════════════════════
//  Count/presence sanity — how many SKUs have a bomwo section?
// ═══════════════════════════════════════════════════════════════
export function verifyBomSectionsPresent(sections, expectedSkuCount) {
  const bomwo = sections.filter(s => norm(pick(s, 'section')) === 'bomwo');
  const uniqueSkus = new Set(bomwo.map(s => String(pick(s, 'sku_key', 'skuKey'))));
  expect(uniqueSkus.size,
    `BOM sections: ${uniqueSkus.size} SKU(s) had a bomwo, expected ${expectedSkuCount}`
  ).toBe(expectedSkuCount);
  console.log(`  ✅ VERIFY: ${expectedSkuCount} SKU(s) BOM section confirmed in backend`);
}