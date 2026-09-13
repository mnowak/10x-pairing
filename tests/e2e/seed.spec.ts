import { test, expect } from "@playwright/test";

// The exemplar every generated E2E test in this project is modeled on —
// see tests/e2e/README.md for the rules this pattern encodes.
test("added team army persists after page reload", async ({ page }) => {
  const armyName = `Seed Army ${Date.now()}`;
  await page.goto("/");

  await page.getByRole("textbox", { name: "Add an army" }).fill(armyName);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // Scoped to the roster's listitem role, not a bare page-wide text match:
  // Astro's dev-mode toolbar injects a hidden debug panel elsewhere in the
  // DOM that can also match plain text, which a role-scoped locator avoids.
  const rosterEntry = page.getByRole("listitem").filter({ hasText: armyName });
  await expect(rosterEntry).toBeVisible();

  await page.reload();
  await expect(rosterEntry).toBeVisible();

  // Cleanup — leaves the seeded captain's roster exactly as this test found it.
  await page.getByRole("button", { name: `Remove ${armyName}` }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(rosterEntry).not.toBeVisible();
});
