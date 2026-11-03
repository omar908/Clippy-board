import { test, expect, openPreview, expectUnclipped } from "./helpers";

for (const content of ["text", "long", "image", "files"]) {
  test(`current clipboard badge is separate from selection and fits a narrow ${content} card`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 580 });
    await page.goto(`/?mode=main&content=${content}&clipboard=second`);
    const badge = page.locator(".item-clipboard-badge");
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveText("On clipboard");
    await expect(page.locator('.history-item[data-id="second"]')).toHaveClass(/on-clipboard/);
    await expect(page.locator('.history-item[data-id="first"]')).toHaveClass(/selected/);
    await expectUnclipped(page, ".item-clipboard-badge, .item-actions", '.history-item[data-id="second"]');
    // Startup with unsupported/empty/untracked contents has no confirmed match.
    await page.goto(`/?mode=main&content=${content}`);
    await expect(page.locator(".history-item")).toHaveCount(2);
    await expect(badge).toHaveCount(0);
  });
}

test("clipboard changes and copying update the badge without changing selection", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 580 });
  await page.goto("/?mode=main&clipboard=second");
  await expect(page.locator(".item-clipboard-badge")).toHaveCount(1);
  await page.keyboard.press("Home");
  await page.locator("#pause-btn").click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("test-current-clipboard", { detail: "first" })));
  await expect(page.locator('.history-item[data-id="first"]')).toHaveClass(/on-clipboard/);
  await expect(page.locator(".history-item.selected")).toHaveAttribute("data-id", "first");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("test-current-clipboard", { detail: null })));
  await expect(page.locator(".item-clipboard-badge")).toHaveCount(0);
  await page.locator('.history-item[data-id="second"] .item-content-text').click();
  await expect(page.locator('.history-item[data-id="second"]')).toHaveClass(/on-clipboard/);
  await expect(page.locator(".item-clipboard-badge")).toHaveCount(1);
});

test("Restore defaults to Ctrl+R and can be overridden in Settings", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 580 });
  await page.goto("/?mode=main&deleted=1");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.locator('[data-filter="deleted"]').click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Control+r");
  await expect(page.locator(".history-item")).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-copy-count", "0");
  await page.locator("#settings-btn").click();
  const field = page.locator("#shortcut-item-restore");
  await expect(field).toHaveValue("Ctrl+R");
  await field.focus();
  await page.keyboard.press("Control+k");
  await expect(page.locator("#settings-status")).toHaveText("All changes saved.");
  await page.locator("#settings-back-btn").click();
  await page.keyboard.press("Control+k");
  await expect(page.locator(".history-item")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-copy-count", "0");
  await page.locator('[data-filter="all"]').click();
  await expect(page.locator(".history-item")).toHaveCount(4);
});

test("native Alt+Space routing honors menu recording, overrides, and disabling", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {} });
    Object.defineProperty(navigator, "platform", { value: "Win32" });
  });
  await page.goto("/?mode=main");
  await expect(page.locator(".history-item")).toHaveCount(2);
  // Real DOM key is deferred to the host; its forwarded key executes once.
  await page.keyboard.press("Alt+Space");
  await expect(page.locator("html")).toHaveAttribute("data-menu-count", "0");
  const forward = () => page.evaluate(() => window.dispatchEvent(new Event("test-native-menu-key")));
  await forward();
  await expect(page.locator("html")).toHaveAttribute("data-menu-count", "1");
  await page.locator("#settings-btn").click();
  const field = page.locator("#shortcut-window-menu");
  await expect(field).toHaveValue("Alt+Space");
  await field.focus();
  await page.keyboard.press("Backspace");
  await forward();
  await expect(field).toHaveValue("Alt+Space");
  await expect(page.locator("html")).toHaveAttribute("data-menu-count", "1");
  await page.keyboard.press("Control+m");
  await expect(page.locator("#settings-status")).toHaveText("All changes saved.");
  await page.locator("#settings-back-btn").click();
  await forward();
  await expect(page.locator("html")).toHaveAttribute("data-menu-count", "1");
  await page.keyboard.press("Control+m");
  await expect(page.locator("html")).toHaveAttribute("data-menu-count", "2");
  await page.locator("#settings-btn").click();
  await field.focus(); await page.keyboard.press("Backspace");
  await expect(page.locator("#settings-status")).toHaveText("All changes saved.");
  await page.locator("#settings-back-btn").click();
  await forward(); await page.keyboard.press("Control+m");
  await expect(page.locator("html")).toHaveAttribute("data-menu-count", "2");
});

test("Restore button keeps original order and does not copy", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 580 });
  await page.goto("/?mode=main&deleted=1");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.locator('[data-filter="deleted"]').click();
  await page.locator('.history-item[data-id="trash-first"]').getByRole("button", { name: "Undo restore" }).click();
  await expect(page.locator(".history-item")).toHaveCount(1);
  await page.locator('[data-filter="all"]').click();
  await expect(page.locator(".history-item")).toHaveCount(3);
  await expect(page.locator(".history-item").last()).toHaveAttribute("data-id", "trash-first");
  await expect(page.locator("html")).toHaveAttribute("data-copy-count", "0");
});

for (const activation of ["pointer", "keyboard"]) {
  test(`Deleted supports ${activation} copy and Delete through shared actions`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 580 });
    await page.goto("/?mode=main&deleted=1");
    await expect(page.locator(".history-item")).toHaveCount(2);
    await page.locator('[data-filter="deleted"]').click();
    await expect(page.locator('.history-item[data-id="trash-first"]')).toBeVisible();
    if (activation === "pointer") await page.locator('.history-item[data-id="trash-first"] .item-content-text').click();
    else {
      await page.keyboard.press("Home");
      await page.keyboard.press("Enter");
    }
    await expect(page.locator("html")).toHaveAttribute("data-copy-count", "1");
    await expect(page.locator("html")).toHaveAttribute("data-last-copy-id", "trash-first");
    await expect(page.locator(".history-item")).toHaveCount(1);
    await expect(page.locator('.history-item[data-id="trash-first"]')).toHaveCount(0);
    await page.locator('[data-filter="all"]').click();
    await expect(page.locator(".history-item")).toHaveCount(3);
    await expect(page.locator(".history-item").first()).toHaveAttribute("data-id", "trash-first");
    await page.locator('[data-filter="deleted"]').click();
    await page.keyboard.press("End");
    await page.keyboard.press("Delete");
    await expect(page.locator(".history-item")).toHaveCount(0);
    await expect(page.locator('.history-item[data-id="trash-second"]')).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-copy-count", "1");
  });
}

for (const activation of ["pointer", "keyboard"]) {
  test(`compact Back restores history through ${activation} without copying`, async ({ page }) => {
    await page.setViewportSize({ width: 460, height: 580 });
    await openPreview(page, "main");
    const selected = await page.locator(".history-item.selected").getAttribute("data-id");
    if (activation === "pointer") await page.getByRole("button", { name: "Back to history" }).click();
    else {
      await page.getByRole("button", { name: "Back to history" }).focus();
      await page.keyboard.press("Enter");
    }
    await expect(page.locator("#preview-panel")).toBeHidden();
    await expect(page.locator(".list-column")).toBeVisible();
    await expect(page.locator(".history-item.selected")).toHaveAttribute("data-id", selected!);
    await expect(page.locator("html")).toHaveAttribute("data-copy-count", "0");
  });
}

test("resizing switches between compact and docked while keeping both columns usable", async ({ page }) => {
  await page.setViewportSize({ width: 460, height: 580 });
  await openPreview(page, "main", "long");
  await expect(page.locator(".clippy-popup")).toHaveClass(/preview-compact/);
  await page.setViewportSize({ width: 700, height: 580 });
  await expect(page.locator(".clippy-popup")).not.toHaveClass(/preview-compact/);
  await expect(page.locator(".list-column")).toBeVisible();
  expect((await page.locator(".list-column").boundingBox())!.width).toBeGreaterThanOrEqual(360);
  expect((await page.locator("#preview-panel").boundingBox())!.width).toBeGreaterThanOrEqual(280);
  await page.setViewportSize({ width: 460, height: 580 });
  await expect(page.getByRole("button", { name: "Back to history" })).toBeVisible();
  await expect(page.locator(".preview-text")).toContainText("Literal text");
});
