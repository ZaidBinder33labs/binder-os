import { expect } from "@playwright/test";
import fs from "fs";
import path from "path";

/** all react-select controls */
const controls = (page) => page.locator('[class*="-control"]');

/** DISCOVERY — print the actual options */
export async function dumpDropdown(page, index) {
  const c = controls(page).nth(index);
  await c.scrollIntoViewIfNeeded();
  await c.click();
  await page.waitForTimeout(800);

  const opts = await page.locator('[class*="-option"]').allInnerTexts();
  console.log(`dropdown[${index}] →`, JSON.stringify(opts));

  await page.keyboard.press("Escape");
  return opts;
}

export async function dumpAllDropdowns(page) {
  const total = await controls(page).count();
  console.log("TOTAL DROPDOWNS:", total);
  for (let i = 0; i < total; i++) await dumpDropdown(page, i);
}

/** react-select — type to filter, then click. Fail fast. */
export async function selectDropdown(page, index, value) {
  const c = controls(page).nth(index);
  await c.scrollIntoViewIfNeeded();
  await c.click();
  await page.keyboard.type(value, { delay: 40 });

  const opt = page.locator('[class*="-option"]')
    .filter({ hasText: value })
    .first();

  await opt.waitFor({ state: "visible", timeout: 5000 });
  await opt.click();
  console.log(`dropdown[${index}] = ${value}`);
}

/** fill + verify — if it clears, you'll know immediately */
export async function fillAndVerify(page, placeholder, value, index = 0) {
  const el = page.getByPlaceholder(placeholder).nth(index);
  await el.scrollIntoViewIfNeeded();
  await el.fill(String(value));
  await expect(el).toHaveValue(String(value), { timeout: 3000 });
  console.log(`"${placeholder}" = ${value}`);
}

/**
 * Image upload — SCOPED + VERIFIED
 *
 * ⚠️ The old version used `page.locator('input[type=file]').first()`,
 *    i.e. the FIRST file input on the whole page. In a multi-SKU form all
 *    uploads landed on SKU 1 and the rest stayed empty — but the log still
 *    printed "uploaded". So:
 *      1. pass a scope (the SKU block), not the page
 *      2. VERIFY after upload, don't blindly log
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name                 file name (without extension)
 * @param {import('@playwright/test').Locator} [scope]  SKU block; if omitted, whole page
 */
export async function uploadFile(page, name, scope) {
  const dir = path.join(process.cwd(), "test-files");
  fs.mkdirSync(dir, { recursive: true });

  // 1x1 PNG — a real image is needed, a .txt may be rejected
  const filePath = path.join(dir, `${name}.png`);
  fs.writeFileSync(filePath, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  ));

  const root = scope ?? page;

  const fileInputs = root.locator('input[type="file"]');
  const total = await fileInputs.count();
  if (total === 0) {
    throw new Error(`uploadFile: no file input found inside the scope (${name})`);
  }

  // within the block, the first = the main PRODUCT IMAGE (SUBPRODUCT IMAGE comes later)
  const input = fileInputs.first();

  // how many empty "Click to upload" boxes existed before the upload
  const emptyBefore = await root.getByText(/click to upload/i).count();

  await input.setInputFiles(filePath);

  // VERIFY 1 — did the file attach to the DOM input?
  await expect
    .poll(() => input.evaluate(el => (el.files ? el.files.length : 0)), {
      timeout: 5000,
      message: `${name}: file did not attach to the file input`,
    })
    .toBeGreaterThan(0);

  // VERIFY 2 — did the UI accept it? one "Click to upload" should be gone
  if (emptyBefore > 0) {
    await expect
      .poll(() => root.getByText(/click to upload/i).count(), {
        timeout: 8000,
        message: `${name}: UI did not accept the image — "Click to upload" still visible`,
      })
      .toBeLessThan(emptyBefore);
  }

  console.log(`uploaded: ${filePath}`);
}