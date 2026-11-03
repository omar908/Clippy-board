import { test, expect, expectUnclipped } from "./helpers";
import type { Page } from "@playwright/test";

async function openSettings(page: Page) {
  await page.goto("/?mode=main");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.keyboard.press("Control+,");
  await expect(page.locator("#settings-status")).toHaveText("All changes saved.");
}
async function control(page: Page, detail: { failures?: number; delay?: number; loadFailures?: number }) {
  await page.evaluate(detail => window.dispatchEvent(new CustomEvent("test-settings-save", { detail })), detail);
}
const saved = (page: Page) => expect(page.locator("#settings-status")).toHaveText("All changes saved.");

test("per-entry failure wraps at minimum size, survives unrelated saves and retries without an alert", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 420 });
  const dialogs: string[] = [];
  page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await openSettings(page);
  await control(page, { failures: 1 });
  await page.locator("#setting-show-pinned").uncheck();
  const error = page.locator("#save-setting-show-pinned");
  await expect(error).toContainText("Could not write settings");
  await expect(page.locator("#settings-status")).toHaveText("1 setting needs attention.");
  await page.locator("#setting-compact-mode").check();
  await expect(page.locator("html")).toHaveClass(/density-compact/);
  await expect(page.locator("#setting-show-pinned")).not.toBeChecked();
  await expect(error).toContainText("Could not write settings");
  await error.scrollIntoViewIfNeeded();
  await expectUnclipped(page, "#save-setting-show-pinned", ".settings-content");
  await expectUnclipped(page, "#settings-status", ".settings-page");
  await page.getByRole("button", { name: "Retry saving Show pinned items in All", exact: true }).click();
  await saved(page);
  await expect(error).toContainText("Saved");
  await page.mouse.move(0, 0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-page")).toBeHidden();
  await page.keyboard.press("Control+,");
  await expect(page.locator("#setting-show-pinned")).not.toBeChecked();
  await expect(page.locator("#setting-compact-mode")).toBeChecked();
  expect(dialogs).toEqual([]);
});

test("numbers validate on blur, remain editable during other saves, and block leaving until reviewed or corrected", async ({ page }) => {
  await openSettings(page);
  const number = page.locator("#setting-max-history");
  await number.fill("");
  await expect(page.locator("html")).toHaveAttribute("data-settings-writes", "0");
  await number.blur();
  await expect(page.locator("#save-setting-max-history")).toContainText("whole number from 1 to 10000");
  await expect(number).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Retry saving Max history items", exact: true })).toBeHidden();
  await page.locator("#setting-compact-mode").check();
  await expect(page.locator("html")).toHaveClass(/density-compact/);
  await expect(number).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-leave")).toBeVisible();
  await expect(page.locator("#settings-page")).toBeVisible();
  await page.locator("#settings-review").click();
  await expect(number).toBeFocused();
  await number.fill("10001"); await number.press("Enter");
  await expect(number).toHaveAttribute("aria-invalid", "true");
  await number.fill("250"); await number.press("Enter");
  await saved(page);
  await expect(number).toHaveAttribute("aria-invalid", "false");
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-page")).toBeHidden();
  await page.keyboard.press("Control+,");
  await expect(number).toHaveValue("250");
});

test("Back commits a valid number without requiring a blur or a Save button", async ({ page }) => {
  await openSettings(page);
  await page.locator("#setting-delete-ttl").fill("0");
  await page.keyboard.press("Control+,");
  await expect(page.locator("#settings-page")).toBeHidden();
  await page.keyboard.press("Control+,");
  await expect(page.locator("#setting-delete-ttl")).toHaveValue("0");
  await expect(page.getByRole("button", { name: "Save Settings", exact: true })).toHaveCount(0);
  await page.locator("#setting-max-history").fill("100");
  await page.keyboard.press("Control+,");
  await expect(page.locator("#settings-page")).toBeHidden();
});

test("a failed number stays unsaved on Escape until explicit retry or discard", async ({ page }) => {
  await openSettings(page);
  await control(page, { failures: 1 });
  const number = page.locator("#setting-max-history");
  await number.fill("220"); await number.press("Enter");
  await expect(page.locator("#save-setting-max-history")).toContainText("Could not write settings");
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-leave")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-settings-writes", "1");
  await page.locator("#settings-review").click();
  await expect(number).toBeFocused();
  await page.getByRole("button", { name: "Retry saving Max history items", exact: true }).click();
  await saved(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-page")).toBeHidden();
});

test("serial saves preserve rapid reversals and unfinished number drafts", async ({ page }) => {
  await openSettings(page);
  await control(page, { delay: 350 });
  const compact = page.locator("#setting-compact-mode");
  await compact.check();
  await expect(page.locator("#save-setting-compact-mode")).toContainText("Saving");
  await compact.uncheck();
  await page.locator("#setting-show-pinned").uncheck();
  const number = page.locator("#setting-max-history");
  await number.fill("321");
  await expect(page.locator("#save-setting-show-pinned")).toContainText("Saved");
  await expect(number).toHaveValue("321");
  await expect(compact).not.toBeChecked();
  await expect(page.locator("html")).not.toHaveClass(/density-compact/);
  await number.press("Enter");
  await saved(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-page")).toBeHidden();
  await page.keyboard.press("Control+,");
  await expect(number).toHaveValue("321");
  await expect(compact).not.toBeChecked();
  await expect(page.locator("#setting-show-pinned")).not.toBeChecked();
});

test("shortcut conflicts leave active bindings intact, allow swaps and reset all atomically", async ({ page }) => {
  await openSettings(page);
  const restore = page.locator("#shortcut-item-restore");
  const pause = page.locator("#shortcut-pause");
  await restore.focus(); await page.keyboard.press("Control+p");
  await expect(page.locator("#save-shortcut-item-restore")).toContainText("both use Ctrl+P");
  await expect(page.locator("html")).toHaveAttribute("data-settings-writes", "0");
  await pause.focus(); await page.keyboard.press("Control+r");
  await saved(page);
  await page.getByRole("button", { name: "Reset all shortcuts", exact: true }).click();
  await saved(page);
  await expect(restore).toHaveValue("Ctrl+R");
  await expect(pause).toHaveValue("Ctrl+P");
  await expect(page.locator("html")).toHaveAttribute("data-settings-writes", "2");
  await page.mouse.move(0, 0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-page")).toBeHidden();
  await page.keyboard.press("Control+,");
  await expect(restore).toHaveValue("Ctrl+R");
});

test("discard affects only unsaved changes and the window close button also guards them", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 420 });
  await openSettings(page);
  await page.locator("#setting-compact-mode").check();
  await saved(page);
  await control(page, { failures: 1 });
  await page.locator("#setting-show-pinned").uncheck();
  await expect(page.locator("#settings-status")).toHaveText("1 setting needs attention.");
  await page.locator("#close-btn").click();
  await expect(page.locator("#settings-leave")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-hide-count", "0");
  await expectUnclipped(page, "#settings-review, #settings-discard", ".settings-page");
  await page.locator("#settings-discard").click();
  await expect(page.locator("#settings-page")).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-hide-count", "1");
  await page.keyboard.press("Control+,");
  await expect(page.locator("#setting-compact-mode")).toBeChecked();
  await expect(page.locator("#setting-show-pinned")).toBeChecked();
});

test("a failed settings load disables editing and offers inline retry", async ({ page }) => {
  await page.goto("/?mode=main");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await control(page, { loadFailures: 1 });
  await page.keyboard.press("Control+,");
  await expect(page.locator("#settings-status")).toContainText("Could not load settings");
  await expect(page.locator("#setting-start-on-login")).toBeDisabled();
  await expect(page.locator("#shortcuts-reset")).toBeDisabled();
  await page.locator("#settings-retry").click();
  await saved(page);
  await expect(page.locator("#setting-start-on-login")).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-btn")).toBeFocused();
});
