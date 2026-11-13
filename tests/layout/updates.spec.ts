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
  await page.setViewportSize({ width: 360, height: 420 });
  await page.route("https://api.github.com/repos/omar908/Clippy-board/releases/latest", route =>
    route.fulfill({ json: { tag_name: "v999.0.0" }, headers: { "Access-Control-Allow-Origin": "*" } }),
  );
  await page.goto("/?mode=main&signed-update=1");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.keyboard.press("Control+,");
  const content = page.locator(".settings-content");
  await expect(page.getByRole("checkbox", { name: "Check for updates automatically" })).toBeEnabled();
  const scrollPosition = await content.evaluate(element => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  expect(scrollPosition).toBeGreaterThan(0);

  const check = page.getByRole("button", { name: "Check for updates", exact: true });
  await expect(check).toBeInViewport({ ratio: 1 });
  await check.click();
  const install = page.getByRole("button", { name: "Install and restart" });
  await expect(page.locator("#update-status")).toHaveText("Clippy-board 999.0.0 is available.");
  await expect(page.locator("#update-status")).toBeInViewport({ ratio: 1 });
  await expect(install).toBeInViewport({ ratio: 1 });
  await install.click();
  const dialog = page.getByRole("dialog", { name: "Install update?" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-install-version", /.+/);
  await dialog.getByRole("button", { name: "Install and restart" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-install-version", "999.0.0");
  await page.getByRole("dialog", { name: "Update failed" }).getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#update-status")).toContainText("Couldn’t install the signed update");
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeEnabled();
  await expect(retry).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Open release page" })).toBeInViewport({ ratio: 1 });
  expect(await content.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
});

test("automatic updates offer the same confirmation from the main window", async ({ page }) => {
  await page.clock.install();
  await page.route("https://api.github.com/repos/omar908/Clippy-board/releases/latest", route =>
    route.fulfill({ json: { tag_name: "v999.0.0" }, headers: { "Access-Control-Allow-Origin": "*" } }),
  );
  await page.goto("/?mode=main&signed-update=1");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page.clock.fastForward(31_000);
  const button = page.getByRole("button", { name: "Update available", exact: true });
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Install update?" });
  await expect(dialog).toContainText("999.0.0");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("html")).not.toHaveAttribute("data-install-version", /.+/);
  await button.click();
  await dialog.getByRole("button", { name: "Install and restart" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-install-version", "999.0.0");
  await expect(page.getByRole("dialog", { name: "Update failed" })).toBeVisible();
});
