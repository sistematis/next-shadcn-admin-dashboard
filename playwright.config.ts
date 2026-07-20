import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration for ERP Sistematis frontend.
 * Tests run against the deployed production instance.
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://erp.sistematis.id",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // ponytail: ERP pages need auth — tests inject token via API in globalSetup
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
