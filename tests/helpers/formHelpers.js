import { expect } from "@playwright/test";
import fs from "fs";
import path from "path";

/** saare react-select controls */
const controls = (page) => page.locator('[class*="-control"]');

/** DISCOVERY — asli options print karo */
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

/** react-select — type karke filter, phir click. Fail fast. */
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

/** fill + verify — clear ho gaya to turant pata chalega */
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
 * ⚠️ Purana version `page.locator('input[type=file]').first()` use karta tha,
 *    yani poore page ka PEHLA file input. Multi-SKU form mein saare uploads
 *    SKU 1 pe hi chadh jaate the aur baaki khali reh jaate the — par log
 *    phir bhi "uploaded" chhaap deta tha. Isliye:
 *      1. scope pass karo (SKU block), page nahi
 *      2. upload ke baad VERIFY karo, blindly log mat karo
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name                 file ka naam (extension ke bina)
 * @param {import('@playwright/test').Locator} [scope]  SKU block; na do to poora page
 */
export async function uploadFile(page, name, scope) {
  const dir = path.join(process.cwd(), "test-files");
  fs.mkdirSync(dir, { recursive: true });

  // 1x1 PNG — asli image chahiye, txt reject ho sakta hai
  const filePath = path.join(dir, `${name}.png`);
  fs.writeFileSync(filePath, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  ));

  const root = scope ?? page;

  const fileInputs = root.locator('input[type="file"]');
  const total = await fileInputs.count();
  if (total === 0) {
    throw new Error(`uploadFile: scope ke andar koi file input nahi mila (${name})`);
  }

  // block ke andar pehla = main PRODUCT IMAGE (SUBPRODUCT IMAGE baad mein aata hai)
  const input = fileInputs.first();

  // upload se pehle kitne "Click to upload" khali box the
  const emptyBefore = await root.getByText(/click to upload/i).count();

  await input.setInputFiles(filePath);

  // VERIFY 1 — file DOM input pe attach hui?
  await expect
    .poll(() => input.evaluate(el => (el.files ? el.files.length : 0)), {
      timeout: 5000,
      message: `${name}: file input pe file attach nahi hui`,
    })
    .toBeGreaterThan(0);

  // VERIFY 2 — UI ne accept kiya? ek "Click to upload" kam hona chahiye
  if (emptyBefore > 0) {
    await expect
      .poll(() => root.getByText(/click to upload/i).count(), {
        timeout: 8000,
        message: `${name}: UI ne image accept nahi ki — "Click to upload" abhi bhi dikh raha hai`,
      })
      .toBeLessThan(emptyBefore);
  }

  console.log(`uploaded: ${filePath}`);
}
