import { test, expect, openPreview } from "./helpers";

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
