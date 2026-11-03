import { test, expect, expectUnclipped, openPreview } from "./helpers";

test("opening Settings dismisses an active preview", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 580 });
  await openPreview(page, "main");
  await page.keyboard.press("Control+,");
  await expect(page.locator("#settings-page")).toBeVisible();
  await expect(page.locator("#settings-back-btn")).toBeFocused();
  await expect(page.locator("#preview-panel")).toBeHidden();
});

test("Settings supports keyboard navigation and returns focus without trapping shortcut fields", async ({ page }) => {
  await page.goto("/?mode=main");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.locator("#search-input").focus();
  await page.keyboard.press("Control+,");
  await expect(page.locator("#settings-page")).toBeVisible();
  await expect(page.locator("#settings-back-btn")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Start with Windows", { exact: true })).toBeFocused();
  await page.locator("#shortcut-item-restore").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#shortcut-window-menu")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#shortcut-item-restore")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-page")).toBeHidden();
  await expect(page.locator("#search-input")).toBeFocused();
  await page.keyboard.press("Control+,");
  await page.locator("#setting-max-history").focus();
  await page.keyboard.press("Control+,");
  await expect(page.locator("#settings-page")).toBeHidden();
});

test("defaults and per-entry resets cover shortcuts, numbers and toggles at minimum width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 580 });
  await page.goto("/?mode=main");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.keyboard.press("Control+,");
  const restore = page.locator("#shortcut-item-restore");
  await restore.focus(); await page.keyboard.press("Control+k");
  await expect(page.locator("#default-shortcut-item-restore")).toHaveText("Default: Ctrl+R · Customized");
  await page.locator("#shortcut-window-menu").focus(); await page.keyboard.press("Control+m");
  await page.getByRole("button", { name: "Reset Restore item without copying to default", exact: true }).click();
  await expect(restore).toHaveValue("Ctrl+R");
  await expect(page.locator("#shortcut-window-menu")).toHaveValue("Ctrl+M");
  await expect(page.locator("#default-shortcut-item-restore")).toHaveText("Default: Ctrl+R");
  await page.locator("#setting-max-history").fill("250");
  await expect(page.locator("#default-setting-max-history")).toHaveText("Default: 100 · Customized");
  await page.getByRole("button", { name: "Reset Max history items to default", exact: true }).click();
  await expect(page.locator("#setting-max-history")).toHaveValue("100");
  await page.getByLabel("Show pinned items in All", { exact: true }).uncheck();
  await expect(page.locator("#default-setting-show-pinned")).toHaveText("Default: On · Customized");
  await page.getByRole("button", { name: "Reset Show pinned items in All to default", exact: true }).click();
  await expect(page.getByLabel("Show pinned items in All", { exact: true })).toBeChecked();
  for (const field of ["shortcut-item-restore", "shortcut-window-menu", "setting-max-history", "setting-start-on-login"]) {
    const row = `#${field}`;
    const bounds = await page.locator(row).locator("..").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
  }
  await expectUnclipped(page, ".settings-field-reset, .settings-input", "#shortcut-fields");
});

test("startup changes are explicit and unrelated saves respect Task Manager state", async ({ page }) => {
  await page.goto("/?mode=main");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.keyboard.press("Control+,");
  const startup = page.getByLabel("Start with Windows", { exact: true });
  await expect(startup).not.toBeChecked();
  await startup.check();
  await page.locator("#settings-save-btn").click();
  await expect(page.locator("html")).toHaveAttribute("data-startup-writes", "1");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("test-startup-state", { detail: false })));
  await page.locator("#setting-max-history").fill("150");
  await page.locator("#settings-save-btn").click();
  await expect(startup).not.toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-startup-writes", "1");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+,");
  await expect(startup).not.toBeChecked();
  await expect(page.locator("#setting-max-history")).toHaveValue("150");
});

test("hiding pinned entries changes only All and its count", async ({ page }) => {
  await page.goto("/?mode=main&pinned=1");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.keyboard.press("Control+,");
  await page.getByLabel("Show pinned items in All", { exact: true }).uncheck();
  await page.locator("#settings-save-btn").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".history-item")).toHaveCount(1);
  await expect(page.locator("#count-all")).toHaveText("1");
  await expect(page.locator("#count-pinned")).toHaveText("1");
  await page.locator('[data-filter="pinned"]').click();
  await expect(page.locator(".history-item")).toHaveCount(1);
  await expect(page.locator(".history-item")).toHaveAttribute("data-id", "first");
  await page.locator('[data-filter="text"]').click();
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.locator('[data-filter="all"]').click();
  await page.keyboard.press("Control+,");
  await page.getByRole("button", { name: "Reset Show pinned items in All to default", exact: true }).click();
  await page.locator("#settings-save-btn").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await expect(page.locator("#count-all")).toHaveText("2");
});

test("a saved All preference loads at startup and explains an empty view of pinned-only history", async ({ page }) => {
  await page.goto("/?mode=main&only-pinned=1&hide-pinned=1");
  await expect(page.locator("#count-all")).toHaveText("0");
  await expect(page.locator(".history-item")).toHaveCount(0);
  await expect(page.locator(".empty-title")).toHaveText("No unpinned items");
  await page.locator('[data-filter="pinned"]').click();
  await expect(page.locator(".history-item")).toHaveCount(2);
});
