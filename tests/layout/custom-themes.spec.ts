import { expect, test } from "./helpers";

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
  const [picker] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Import theme…" }).click(),
  ]);
  await expect(page.locator("html")).toHaveAttribute("data-interacting", "true");
  await picker.setFiles({
    name: "night-sky.clippy-theme.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(palette)),
  });
  await expect(page.getByRole("dialog", { name: "Import theme" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-interacting", "true");
  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-interacting", "false");
  await chooseFile({ ...palette, version: 2 });
  await expect(page.locator("#theme-file-status")).toContainText("version is unsupported");
  await expect(editor).toBeHidden();
  await chooseFile(palette);
  await expect(page.getByRole("dialog", { name: "Import theme" })).toBeVisible();
  await expect(editor.getByRole("status")).toContainText("Text on the window has low contrast");
  const iconStyle = editor.getByLabel("Icon style");
  await expect(iconStyle).toHaveValue("emoji");
  await iconStyle.selectOption("outline");
  await editor.getByRole("checkbox", { name: "Alternate Text icon" }).check();
  await editor.getByText("Customize icons", { exact: true }).click();
  const settingsIcon = editor.locator("#theme-icon-role-settings");
  await settingsIcon.selectOption("emoji:file-alt");
  const sampleSettingsIcon = editor.locator('#theme-sample [data-icon="settings"]');
  await expect.poll(() => sampleSettingsIcon.evaluate(element =>
    getComputedStyle(element, "::before").content)).toContain("📁");
  await expect(editor.locator("#theme-sample")).toHaveAttribute("data-icon-style", "outline");
  await expect.poll(() => editor.locator('#theme-sample [data-icon="text"]').evaluate(element =>
    getComputedStyle(element, "::after").maskImage)).toContain("data:image/svg+xml");
  await expect(page.locator("html")).toHaveAttribute("data-icon-style", "emoji");
  await editor.getByRole("button", { name: "Save and apply" }).click();
  await expect(editor).toBeHidden();
  const exportButton = page.getByRole("button", { name: "Export theme…" });
  const status = page.locator("#theme-file-status");
  await page.evaluate(() => { document.documentElement.dataset.themeExportOutcome = "cancel"; });
  await exportButton.click();
  await expect(status).toHaveText("Export canceled.");
  await page.evaluate(() => { document.documentElement.dataset.themeExportOutcome = "error"; });
  await exportButton.click();
  await expect(status).toContainText("Couldn’t save the theme.");
  await page.evaluate(() => { delete document.documentElement.dataset.themeExportOutcome; });
  await exportButton.click();
  await expect(status).toHaveText("Theme saved to C:\\Users\\Tester\\Downloads\\Night sky.clippy-theme.json");
  const exported = JSON.parse((await page.locator("html").getAttribute("data-theme-export-contents"))!);
  expect(exported).toEqual({ ...palette, icons: {
    style: "outline", text: true, image: false, file: false, overrides: { settings: "emoji:file-alt" },
  } });
  await chooseFile(exported);
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue("Night sky (2)");
  await expect(iconStyle).toHaveValue("outline");
  await expect(settingsIcon).toHaveValue("emoji:file-alt");
  await expect(editor.getByRole("checkbox", { name: "Alternate Text icon" })).toBeChecked();
  await expect(editor.getByText(/name is already in use/)).toBeVisible();
  await editor.getByRole("button", { name: "Save and apply" }).click();
  await expect(editor).toBeHidden();
  const theme = page.getByRole("combobox", { name: "Theme", exact: true });
  await expect(theme.locator("option", { hasText: "Night sky" })).toHaveCount(2);
  await expect(theme.locator("option:checked")).toHaveText("Night sky (2)");
  await expect(page.locator("html")).toHaveAttribute("data-icon-style", "outline");
  await expect.poll(() => page.locator('#settings-btn [data-icon]').evaluate(element =>
    getComputedStyle(element, "::before").content)).toContain("📁");
  await page.getByRole("button", { name: "Edit theme…" }).click();
  const reset = editor.getByRole("button", { name: "Reset Settings icon" });
  if (!(await reset.isVisible())) await editor.getByText("Customize icons", { exact: true }).click();
  await reset.click();
  await expect(settingsIcon).toHaveValue("");
  await editor.getByRole("button", { name: "Save and apply" }).click();
  await expect(editor).toBeHidden();
  await expect.poll(() => page.locator('#settings-btn [data-icon]').evaluate(element =>
    getComputedStyle(element, "::after").display)).toBe("inline-block");
});
