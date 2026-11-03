import { test, expect, expectUnclipped } from "./helpers";

test("compact mode autosaves, survives reopening Settings and resets to default", async ({ page }) => {
  await page.goto("/?mode=main&many=1&content=long");
  await page.mouse.move(0, 0);
  await expect(page.locator(".history-item")).toHaveCount(30);
  const first = page.locator(".history-item").first();
  const originalHeight = (await first.boundingBox())!.height;
  await page.keyboard.press("Control+,");
  const toggle = page.getByLabel("Compact mode", { exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(page.locator("#settings-status")).toHaveText("All changes saved.");
  await expect(page.locator("html")).toHaveClass(/density-compact/);
  await page.mouse.move(0, 0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-page")).toBeHidden();
  expect((await first.boundingBox())!.height).toBeLessThan(originalHeight - 15);
  await expect(first).toHaveClass(/selected/);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".history-item.selected")).toHaveAttribute("data-id", "item-1");
  await page.keyboard.press("Control+,");
  await expect(toggle).toBeChecked();
  await expect(page.locator("#default-setting-compact-mode")).toHaveText("Default: Off · Customized");
  await page.getByRole("button", { name: "Reset Compact mode to default", exact: true }).click();
  await expect(page.locator("#settings-status")).toHaveText("All changes saved.");
  await expect(page.locator("html")).not.toHaveClass(/density-compact/);
  await page.mouse.move(0, 0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-page")).toBeHidden();
  expect((await first.boundingBox())!.height).toBe(originalHeight);
});

for (const content of ["long", "image", "files"]) {
  test(`saved compact mode fits more ${content} cards at minimum size and preserves full previews`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 420 });
    await page.goto(`/?mode=main&many=1&content=${content}&clipboard=item-0`);
    await expect(page.locator(".history-item")).toHaveCount(30);
    const visibleCount = () => page.locator(".history-container").evaluate(container => {
      const bounds = container.getBoundingClientRect();
      return [...container.querySelectorAll(".history-item")].filter(card => card.getBoundingClientRect().bottom <= bounds.bottom).length;
    });
    const normalCount = await visibleCount();
    const normalHeight = (await page.locator(".history-item").first().boundingBox())!.height;
    await page.goto(`/?mode=main&many=1&content=${content}&clipboard=item-0&density-compact=1`);
    await expect(page.locator("html")).toHaveClass(/density-compact/);
    await expect(page.locator(".history-item")).toHaveCount(30);
    expect(await visibleCount()).toBeGreaterThan(normalCount);
    expect((await page.locator(".history-item").first().boundingBox())!.height).toBeLessThan(normalHeight);
    await expect(page.locator(".item-clipboard-badge")).toBeVisible();
    await expectUnclipped(page, ".history-item:first-child .item-action-btn, .history-item:first-child .item-clipboard-badge", ".history-container");
    await page.keyboard.press("Home");
    await expect(page.locator("#preview-panel")).toBeVisible();
    if (content === "long") await expect(page.locator("#preview-body")).toContainText("Literal text");
    if (content === "files") await expect(page.locator("#preview-body")).toContainText("file-5.txt");
    if (content === "image") await expect(page.locator("#preview-body img")).toBeVisible();
    await page.keyboard.press("Control+,");
    // Settings intentionally scrolls vertically; every row must fit horizontally.
    const overflow = await page.locator(".settings-content").evaluate(container => container.scrollWidth - container.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.locator("#setting-compact-mode").locator("..").scrollIntoViewIfNeeded();
    await expectUnclipped(page, "#setting-compact-mode, #default-setting-compact-mode", ".settings-content");
  });
}
