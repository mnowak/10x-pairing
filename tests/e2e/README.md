# E2E Testing Rules

Playwright tests in this directory run against the real app (auth, routing,
DB all real) — see `playwright.config.ts` for the webServer/project setup and
`auth.setup.ts` for how authentication is established. `seed.spec.ts` is the
exemplar every test here should be modeled on.

- Use `getByRole`, `getByLabel`, `getByText` as primary locators.
  Fall back to `getByTestId` only when accessibility attributes are ambiguous.
- Never use CSS selectors, XPath, or DOM structure for locating elements.
- Each test must be independently runnable — no shared state between tests.
- Never use `page.waitForTimeout()`. Wait for specific conditions:
  `toBeVisible()`, `waitForURL()`, `waitForResponse()`.
- Assert the business outcome, not implementation details.
- Use unique identifiers (e.g. a timestamp suffix) for test data to avoid
  collisions across parallel/repeated runs. Clean up what the test created.
- Use `storageState` for authentication (`playwright/.auth/captain-a.json`,
  produced by `auth.setup.ts`) — never log in through the UI in individual
  tests.
- Name the test after the risk it protects, e.g. `test('committed army is
  never offered again across a full match session', ...)`, not `test('test
  1', ...)`. Trace risk names back to `context/foundation/test-plan.md`.

Run a single spec: `npx playwright test path/to/file.spec.ts`
Run everything: `npm run test:e2e`
Requires local Supabase running (`npx supabase start`) — the dev server
starts on its own via `webServer`, but `auth.setup.ts` needs a real Supabase
instance to sign in against.
