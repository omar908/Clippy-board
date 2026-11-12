import { expect, test } from "./helpers";

test("Settings saves the update opt-out and can still open a newer release manually", async ({ page }) => {
  await page.route("https://api.github.com/repos/omar908/Clippy-board/releases/latest", route =>
    route.fulfill({ json: { tag_name: "v999.0.0" }, headers: { "Access-Control-Allow-Origin": "*" } }),
  );
  await page.goto("/?mode=main");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.keyboard.press("Control+,");
  const automatic = page.getByRole("checkbox", { name: "Check for updates automatically" });
  await expect(automatic).toBeChecked();
  await automatic.uncheck();
  await expect(page.locator("#settings-status")).toHaveText("All changes saved.");
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-page")).toBeHidden();
  await page.keyboard.press("Control+,");
  await expect(automatic).not.toBeChecked();

  await page.getByRole("button", { name: "Check for updates", exact: true }).click();
  await expect(page.locator("#update-status")).toHaveText("Clippy-board 999.0.0 is available.");
  await expect(page.getByRole("button", { name: "Install and restart" })).toBeHidden();
  await page.getByRole("button", { name: "Open release page" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-opened-url", "https://github.com/omar908/Clippy-board/releases/tag/v999.0.0",
  );
});

test("a failed signed installation leaves the release page and retry available", async ({ page }) => {
  await page.route("https://api.github.com/repos/omar908/Clippy-board/releases/latest", route =>
    route.fulfill({ json: { tag_name: "v999.0.0" }, headers: { "Access-Control-Allow-Origin": "*" } }),
  );
  await page.goto("/?mode=main&signed-update=1");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.keyboard.press("Control+,");
  await page.getByRole("button", { name: "Check for updates", exact: true }).click();
  const install = page.getByRole("button", { name: "Install and restart" });
  await install.click();
  await expect(page.locator("html")).toHaveAttribute("data-install-version", "999.0.0");
  await expect(page.locator("#update-status")).toContainText("Couldn’t install the signed update");
  await expect(install).toBeEnabled();
  await expect(page.getByRole("button", { name: "Open release page" })).toBeVisible();
});
