import { test, expect, openPreview } from "./helpers";

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
