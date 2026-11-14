import { expect, test } from "./helpers";
import { readFile } from "node:fs/promises";

test("custom themes preview drafts, save multiple palettes, and support editing and deletion", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 420 });
  await page.goto("/?mode=main&density-compact=1&text-size=130");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.keyboard.press("Control+,");
  const theme = page.getByRole("combobox", { name: "Theme", exact: true });
  const create = page.getByRole("button", { name: "Create theme…" });
  const editor = page.locator("#theme-editor");
  const windowColor = editor.getByLabel("Window", { exact: true });
  const sample = editor.locator("#theme-sample");
  const surface = page.locator(".clippy-popup");
  await create.click();
  await windowColor.fill("#f3f4f6");
  await expect(sample).toHaveCSS("background-color", "rgb(243, 244, 246)");
  await expect(editor.getByRole("status")).toContainText("Text on the window has low contrast");
  await expect(surface).not.toHaveCSS("background-color", "rgb(243, 244, 246)");
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(theme).toHaveValue("system");

  await create.click();
  await editor.getByLabel("Name", { exact: true }).fill("Midnight");
  await windowColor.fill("#101020");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("test-settings-save", { detail: { failures: 1 } })));
  await editor.getByRole("button", { name: "Save and apply" }).click();
  await expect(editor.getByRole("alert")).toContainText("Could not write settings");
  await expect(windowColor).toHaveValue("#101020");
  await expect(theme).toHaveValue("system");
  await editor.getByRole("button", { name: "Save and apply" }).click();
  await expect(editor).toBeHidden();
  await expect(surface).toHaveCSS("background-color", "rgb(16, 16, 32)");
  await create.click();
  await editor.getByLabel("Name", { exact: true }).fill("Daylight");
  await editor.getByLabel("Starting theme").selectOption("light");
  await editor.getByRole("button", { name: "Save and apply" }).click();
  await expect(editor).toBeHidden();
  await theme.selectOption({ label: "Midnight" });
  await expect(surface).toHaveCSS("background-color", "rgb(16, 16, 32)");
  await page.getByRole("button", { name: "Edit theme…" }).click();
  await editor.getByLabel("Name", { exact: true }).fill("Midnight blue");
  await editor.getByRole("button", { name: "Save and apply" }).click();
  await expect(editor).toBeHidden();
  await expect(theme.locator("option:checked")).toHaveText("Midnight blue");
  await page.getByRole("button", { name: "Delete theme…" }).click();
  await editor.getByRole("button", { name: "Delete theme", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(theme).toHaveValue("system");
  await expect(theme.locator("option", { hasText: "Midnight blue" })).toHaveCount(0);
  await expect(theme.locator("option", { hasText: "Daylight" })).toHaveCount(1);
});

test("theme files round-trip through the editor without overwriting the original", async ({ page }) => {
  await page.goto("/?mode=main");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.keyboard.press("Control+,");
  const editor = page.locator("#theme-editor");
  const file = page.locator("#theme-file");
  const palette = {
    format: "clippy-board-theme", version: 1, name: "Night sky", base: "dark",
    window: "#222222", card: "#333333", text: "#222222", accent: "#bbbbff",
  };
  const chooseFile = (content: unknown) => file.setInputFiles({
    name: "night-sky.clippy-theme.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(content)),
  });

  await expect(page.getByRole("button", { name: "Import theme…" })).toBeEnabled();
  await chooseFile({ ...palette, version: 2 });
  await expect(page.locator("#theme-file-status")).toContainText("version is unsupported");
  await expect(editor).toBeHidden();
  await chooseFile(palette);
  await expect(page.getByRole("dialog", { name: "Import theme" })).toBeVisible();
  await expect(editor.getByRole("status")).toContainText("Text on the window has low contrast");
  await editor.getByRole("button", { name: "Save and apply" }).click();
  await expect(editor).toBeHidden();
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: "Export theme…" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Night-sky.clippy-theme.json");
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(exported).toEqual(palette);
  await chooseFile(exported);
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue("Night sky (2)");
  await expect(editor.getByText(/name is already in use/)).toBeVisible();
  await editor.getByRole("button", { name: "Save and apply" }).click();
  await expect(editor).toBeHidden();
  const theme = page.getByRole("combobox", { name: "Theme", exact: true });
  await expect(theme.locator("option", { hasText: "Night sky" })).toHaveCount(2);
  await expect(theme.locator("option:checked")).toHaveText("Night sky (2)");
});
