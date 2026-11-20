import { expect, test } from "./helpers";

test("near-pointer opening is opt-in, autosaves, and resets", async ({ page }) => {
  await page.goto("/?mode=main");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.keyboard.press("Control+,");
  const setting = page.getByRole("checkbox", { name: "Open near mouse pointer", exact: true });
  await expect(setting).not.toBeChecked();
  await setting.check();
  await expect(page.locator("#settings-status")).toHaveText("All changes saved.");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+,");
  await expect(setting).toBeChecked();
  await page.getByRole("button", { name: "Reset Open near mouse pointer to default" }).click();
  await expect(setting).not.toBeChecked();
  await expect(page.locator("#settings-status")).toHaveText("All changes saved.");
});
