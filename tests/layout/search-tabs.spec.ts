import { expect, test } from "./helpers";

test("search keeps caret navigation and derives tab shortcuts from saved bindings", async ({ page }) => {
  await page.goto("/?mode=main");
  await expect(page.locator(".history-item")).toHaveCount(2);
  const search = page.locator("#search-input");
  await search.fill("hello world");
  await search.press("End");
  await search.press("ArrowLeft");
  expect(await search.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(10);
  await expect(page.locator('.filter-tab[data-filter="all"]')).toHaveClass(/active/);
  await search.press("Alt+ArrowRight");
  await expect(page.locator('.filter-tab[data-filter="pinned"]')).toHaveClass(/active/);
  await expect(search).toBeFocused();
  await page.keyboard.press("Control+,");
  const next = page.getByRole("textbox", { name: "Next tab", exact: true });
  await next.focus();
  await page.keyboard.press("Control+K");
  await expect(page.locator("#settings-status")).toHaveText("All changes saved.");
  await expect(next.locator("..")).toContainText("While searching: Ctrl+Alt+K");
  await page.keyboard.press("Escape");
  await search.focus();
  await search.press("Control+Alt+K");
  await expect(page.locator('.filter-tab[data-filter="text"]')).toHaveClass(/active/);
  await page.keyboard.press("Control+,");
  await next.focus();
  await page.keyboard.press("Space");
  await expect(next.locator("..")).toContainText("both use Alt+Space while searching");
});
