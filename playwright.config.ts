import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Always serial (not just in CI): every E2E test in this project acts
  // against the single seeded captain-a fixture (team roster capped at 5
  // armies) — same shared-state hazard the unit/integration suite already
  // documents in vitest.config.ts (fileParallelism: false) for the same
  // underlying reason.
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
  },
  // Requires the local Supabase stack running (`npx supabase start`) — the
  // dev server itself starts fine without it, but auth.setup.ts's sign-in
  // needs a real Supabase instance to authenticate against.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/captain-a.json" },
      dependencies: ["setup"],
    },
  ],
});
