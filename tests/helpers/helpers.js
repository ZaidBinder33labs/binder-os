export async function dismissAddLater(page, timeout = 10000) {
  const btn = page.getByRole("button", { name: "Add later" });
  try {
    await btn.waitFor({ state: "visible", timeout });
    await btn.click();
    await btn.waitFor({ state: "hidden", timeout: 5000 });
    console.log("✅ popup dismissed");
    return true;
  } catch {
    console.log("ℹ️ popup not found");
    return false;
  }
}