import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/layout",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results/layout",
  use: {
    browserName: "chromium", baseURL: "http://127.0.0.1:4174",
    locale: "en-US", timezoneId: "UTC", colorScheme: "dark",
    screenshot: "only-on-failure", trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite --config tests/layout/vite.config.ts --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174", reuseExistingServer: false, timeout: 60_000,
  },
  projects: [
    { name: "separate-minimum", testMatch: "**/preview.spec.ts", metadata: { mode: "preview" }, use: { viewport: { width: 280, height: 420 }, deviceScaleFactor: 1 } },
    { name: "separate-225-percent", testMatch: "**/preview.spec.ts", metadata: { mode: "preview" }, use: { viewport: { width: 331, height: 560 }, deviceScaleFactor: 2.25 } },
    { name: "separate-preferred", testMatch: "**/preview.spec.ts", metadata: { mode: "preview" }, use: { viewport: { width: 480, height: 700 }, deviceScaleFactor: 1.25 } },
    { name: "docked", metadata: { mode: "main" }, use: { viewport: { width: 700, height: 580 }, deviceScaleFactor: 1 } },
    { name: "compact", metadata: { mode: "main" }, use: { viewport: { width: 460, height: 580 }, deviceScaleFactor: 2 } },
  ],
});
