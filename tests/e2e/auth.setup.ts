import { test as setup, expect } from "@playwright/test";

// Seeded local Supabase test captain (see supabase/seed.sql and
// src/lib/testSupport/twoCaptains.ts, which uses the same credentials for
// the unit/integration suite).
const EMAIL = "captain-a@example.test";
const PASSWORD = "test-password";
const authFile = "playwright/.auth/captain-a.json";

// Per the E2E rules: authenticate without the UI. Astro's built-in CSRF
// check rejects a cross-origin form POST, so an explicit Origin header
// (matching baseURL) is required for this request to succeed.
setup("authenticate as captain-a", async ({ page, baseURL }) => {
  const response = await page.request.post(`${baseURL}/api/auth/signin`, {
    headers: { Origin: baseURL ?? "" },
    form: { email: EMAIL, password: PASSWORD },
    maxRedirects: 0,
  });
  expect([302, 303]).toContain(response.status());

  await page.context().storageState({ path: authFile });
});
