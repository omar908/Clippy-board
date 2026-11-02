import { test, expect, openPreview, expectUnclipped } from "./helpers";

for (const content of ["text", "long", "image", "files"]) {
  test(`${content} content fits the preview viewport`, async ({ page }, info) => {
    await openPreview(page, String(info.project.metadata.mode), content);
    await expectUnclipped(page, "#preview-panel", ".clippy-popup");
    await expectUnclipped(page, ".preview-header > span", "#preview-panel");
    await expectUnclipped(page, ".preview-body", "#preview-panel");
    const overflow = await page.evaluate(() => ({
      root: document.documentElement.scrollWidth - innerWidth,
      header: document.getElementById("preview-header")!.scrollWidth - document.getElementById("preview-header")!.clientWidth,
    }));
    expect(overflow.root).toBeLessThanOrEqual(1);
    expect(overflow.header).toBeLessThanOrEqual(1);
    if (content === "long") {
      await expect(page.locator(".preview-text")).toContainText("<b>Literal text</b>");
      await expect(page.locator(".preview-text b")).toHaveCount(0);
      const metrics = await page.locator(".preview-text").evaluate(e => ({ x: e.scrollWidth - e.clientWidth, y: e.scrollHeight - e.clientHeight }));
      expect(metrics.x).toBeLessThanOrEqual(1);
      expect(metrics.y).toBeGreaterThan(0);
    }
    if (content === "files") {
      await expect(page.locator(".preview-file-row")).toHaveCount(6);
      expect(await page.locator(".preview-file-list").evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
    }
    if (content === "image") {
      const image = page.locator(".preview-image");
      await expect(image).toHaveJSProperty("complete", true);
      expect(await image.evaluate(e => (e as HTMLImageElement).naturalWidth)).toBe(1600);
      await expectUnclipped(page, ".preview-image", ".preview-image-wrap");
      await image.click();
      await expect(page.locator(".preview-image-wrap")).toHaveClass(/zoomed/);
      expect(await page.locator(".preview-image-wrap").evaluate(e => e.scrollWidth - e.clientWidth)).toBeGreaterThan(0);
    }
    if (info.project.name === "docked") {
      expect((await page.locator(".list-column").boundingBox())!.width).toBeGreaterThanOrEqual(360);
      await expectUnclipped(page, ".header-actions button", ".list-column");
      const list = (await page.locator(".list-column").boundingBox())!;
      const panel = (await page.locator("#preview-panel").boundingBox())!;
      expect(list.x + list.width).toBeLessThanOrEqual(panel.x + 1);
    }
    if (info.project.name === "compact") {
      await expect(page.locator(".list-column")).toBeHidden();
      await expectUnclipped(page, "#preview-back", "#preview-panel");
    } else await expect(page.locator("#preview-back")).toBeHidden();
  });
}
