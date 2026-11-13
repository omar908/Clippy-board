import { expect, test } from "./helpers";

test("Appearance defaults to Follow Windows, saves overrides, and resets", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 420 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/?mode=main&density-compact=1");
  await expect(page.locator(".history-item")).toHaveCount(2);
  const root = page.locator("html");
  const surface = page.locator(".clippy-popup");
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.keyboard.press("Control+,");
  const theme = page.getByRole("combobox", { name: "Theme" });
  await expect(theme).toHaveValue("system");
  await theme.selectOption("dark");
  await expect(root).toHaveAttribute("data-theme", "dark");
  await theme.selectOption("light");
  await expect(surface).toHaveCSS("background-color", "rgb(248, 250, 252)");
  await theme.selectOption("system");
  await expect(page.locator("#settings-status")).toHaveText("All changes saved.");
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveAttribute("data-theme", "dark");
  await theme.selectOption("oled");
  await expect(surface).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await page.getByRole("button", { name: "Back" }).click();
  await page.keyboard.press("Control+,");
  await expect(theme).toHaveValue("oled");
  await page.getByRole("button", { name: "Reset Theme to default" }).click();
  await expect(theme).toHaveValue("system");
  await expect(page.locator("#settings-status")).toHaveText("All changes saved.");
  await expect(root).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveAttribute("data-theme", "light");
});

test("separate preview applies the saved OLED palette", async ({ page }) => {
  await page.goto("/?mode=preview&theme=oled");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "oled");
  await expect(page.locator(".clippy-popup")).toHaveCSS("background-color", "rgb(0, 0, 0)");
});
