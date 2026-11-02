import { test as base, expect, type Page } from "@playwright/test";

export const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await use(errors);
    expect(errors, "production frontend should initialize without errors").toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function openPreview(page: Page, mode: string, content = "text") {
  await page.goto(`/?mode=${mode}&content=${content}`);
  if (mode === "main") {
    await expect(page.locator(".history-item")).toHaveCount(2);
    await page.keyboard.press("Home");
  }
  await expect(page.locator("#preview-panel")).toBeVisible();
  await expect(page.getByRole("complementary")).toBeVisible();
  await expect(page.locator("#preview-body > :first-child")).toBeVisible();
}

export async function expectUnclipped(page: Page, selector: string, container: string) {
  const result = await page.locator(container).evaluate((parent, selector) => {
    const bounds = parent.getBoundingClientRect();
    return [...parent.querySelectorAll<HTMLElement>(selector)].filter(element => element.getClientRects().length > 0)
      .map(element => {
        const r = element.getBoundingClientRect();
        return { text: element.textContent, left: r.left - bounds.left, top: r.top - bounds.top,
          right: bounds.right - r.right, bottom: bounds.bottom - r.bottom };
      });
  }, selector);
  expect(result.length).toBeGreaterThan(0);
  for (const element of result) {
    expect(element.left, JSON.stringify(element)).toBeGreaterThanOrEqual(-1);
    expect(element.top, JSON.stringify(element)).toBeGreaterThanOrEqual(-1);
    expect(element.right, JSON.stringify(element)).toBeGreaterThanOrEqual(-1);
    expect(element.bottom, JSON.stringify(element)).toBeGreaterThanOrEqual(-1);
  }
}
