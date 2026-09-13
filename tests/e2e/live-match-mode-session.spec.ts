import { test, expect, type Page } from "@playwright/test";

// Risks protected (context/foundation/test-plan.md §2, #1 and #6; this
// change's plan.md Phase 4 contract): the suggestion/selection UI must
// never offer an already-committed army again, and a session must not
// start unless both rosters have exactly 5 armies.
//
// captain-a is a shared, ephemeral test fixture (see
// src/lib/testSupport/twoCaptains.ts and vitest.config.ts's
// fileParallelism: false note) — these tests reset and restore its team
// roster rather than assuming any particular starting state. Opponents
// created here are never deleted: this app deliberately has no
// whole-resource opponent-delete route (see
// src/pages/api/deleteGuard.test.ts), so a small number of orphaned test
// opponents accumulating under captain-a is an accepted limitation, not a
// test defect.

// Astro's dev-mode toolbar is a fixed-position overlay that (a) intercepts
// pointer events over whatever it's positioned on top of and (b) exposes
// its own `button`-role elements, both of which collide with this test's
// generic role-based queries. It doesn't exist in a production build —
// this is dev-server-only noise, not part of the app under test.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "astro-dev-toolbar { display: none !important; }";
      document.head.appendChild(style);
    });
  });
});

async function clearTeamRoster(page: Page) {
  await page.goto("/");
  // Scoped to the roster's listitem role: the unified page also renders the
  // opponents section's "Add opponent" form alongside the team roster, and
  // its per-field "Remove army N" buttons (not inside a listitem) would
  // otherwise collide with this same-prefix match.
  const removeButtons = page.getByRole("listitem").getByRole("button", { name: /^Remove /, exact: false });
  while ((await removeButtons.count()) > 0) {
    await removeButtons.first().click();
    await page.getByRole("button", { name: "Confirm" }).click();
  }
}

async function addTeamArmies(page: Page, baseURL: string, names: string[]) {
  for (const army of names) {
    const response = await page.request.post("/api/teams/armies", {
      headers: { Origin: baseURL },
      form: { army },
    });
    expect(response.status()).toBeLessThan(400);
  }
}

async function createOpponentWithArmies(page: Page, baseURL: string, opponentName: string, armyNames: string[]) {
  const createResponse = await page.request.post("/api/opponents", {
    headers: { Origin: baseURL },
    form: { name: opponentName },
    maxRedirects: 0,
  });
  // Widened to optional: Playwright types header lookups as always-string,
  // but a missing "location" header (e.g. an unexpected non-redirect
  // response) really is possible at runtime.
  const headers: Record<string, string | undefined> = createResponse.headers();
  const location = headers.location ?? "";
  const opponentId = /\/dashboard\/opponents\/([^/?]+)/.exec(location)?.[1];
  if (!opponentId) {
    throw new Error(`Could not extract opponent id from redirect: "${location}"`);
  }

  for (const army of armyNames) {
    const response = await page.request.post("/api/opponents/armies", {
      headers: { Origin: baseURL },
      form: { opponent_id: opponentId, army },
    });
    expect(response.status()).toBeLessThan(400);
  }

  return opponentId;
}

// Every real interactive control other than the army-option buttons this
// test needs to click through the reveal sequence.
function armyOptionButtons(page: Page) {
  return page.getByRole("button").filter({ hasNotText: /^Abandon|^Confirm pair/ });
}

function stripSuggestedBadge(rawText: string): string {
  return rawText.replace(/^Suggested/, "").trim();
}

/** Clicks the first available option, returning its (badge-stripped) army name. */
async function pickFirstOption(page: Page): Promise<string> {
  const options = armyOptionButtons(page);
  const raw = (await options.first().textContent()) ?? "";
  const name = stripSuggestedBadge(raw);
  await options.first().click();
  return name;
}

/** Selects the first 2 available options and confirms the pair, returning their names. */
async function pickPairOfOptions(page: Page): Promise<[string, string]> {
  const options = armyOptionButtons(page);
  const rawA = (await options.nth(0).textContent()) ?? "";
  const rawB = (await options.nth(1).textContent()) ?? "";
  await options.nth(0).click();
  await options.nth(1).click();
  await page.getByRole("button", { name: /^Confirm pair/ }).click();
  return [stripSuggestedBadge(rawA), stripSuggestedBadge(rawB)];
}

async function assertOptionNamesExclude(page: Page, excluded: string[]) {
  const texts = await armyOptionButtons(page).allTextContents();
  const cleaned = texts.map(stripSuggestedBadge);
  for (const name of excluded) {
    expect(cleaned, `expected "${name}" (already committed) not to be offered again`).not.toContain(name);
  }
}

test("committed army is never offered again across a full two-sub-round match session", async ({ page, baseURL }) => {
  const url = baseURL ?? "";
  const stamp = Date.now();
  const ourArmyNames = Array.from({ length: 5 }, (_, i) => `E2E-Our-${stamp}-${i + 1}`);
  const theirArmyNames = Array.from({ length: 5 }, (_, i) => `E2E-Their-${stamp}-${i + 1}`);

  await clearTeamRoster(page);
  await addTeamArmies(page, url, ourArmyNames);
  const opponentId = await createOpponentWithArmies(page, url, `E2E Opponent ${stamp}`, theirArmyNames);

  await page.goto(`/dashboard/opponents/${opponentId}/match`);

  // Sub-round 1
  const ourDefender1 = await pickFirstOption(page); // our-defender
  const theirDefender1 = await pickFirstOption(page); // their-defender (data entry)
  await assertOptionNamesExclude(page, [ourDefender1]); // our-attacker-pair must not re-offer our own committed defender
  const ourOffered1 = await pickPairOfOptions(page); // our-attacker-pair
  const theirPick1 = await pickFirstOption(page); // their-pick (must be one of ourOffered1)
  expect(ourOffered1).toContain(theirPick1);
  await assertOptionNamesExclude(page, [theirDefender1]); // their-attacker-pair must not re-offer their own committed defender
  const theirOffered1 = await pickPairOfOptions(page); // their-attacker-pair
  const ourAccept1 = await pickFirstOption(page); // our-accept (must be one of theirOffered1)
  expect(theirOffered1).toContain(ourAccept1);

  // Sub-round 2 — the real guardrail check: none of sub-round 1's 4 committed
  // armies (2 per side) may be offered again anywhere in this sub-round.
  await assertOptionNamesExclude(page, [ourDefender1, theirPick1]);
  const ourDefender2 = await pickFirstOption(page);
  await assertOptionNamesExclude(page, [theirDefender1, ourAccept1]);
  const theirDefender2 = await pickFirstOption(page);
  await assertOptionNamesExclude(page, [ourDefender1, theirPick1, ourDefender2]);
  const ourOffered2 = await pickPairOfOptions(page);
  const theirPick2 = await pickFirstOption(page);
  expect(ourOffered2).toContain(theirPick2);
  await assertOptionNamesExclude(page, [theirDefender1, ourAccept1, theirDefender2]);
  const theirOffered2 = await pickPairOfOptions(page);
  const ourAccept2 = await pickFirstOption(page);
  expect(theirOffered2).toContain(ourAccept2);

  // Session complete: the two remaining armies (one per side, never chosen
  // above) are auto-paired as the refused attacker.
  await expect(page.getByText("Session complete!")).toBeVisible();
  await expect(page.getByText("Refused attacker (auto-paired)")).toBeVisible();

  const committedOurs = new Set([ourDefender1, theirPick1, ourDefender2, theirPick2]);
  const committedTheirs = new Set([theirDefender1, ourAccept1, theirDefender2, ourAccept2]);
  const refusedOurs = ourArmyNames.find((name) => !committedOurs.has(name));
  const refusedTheirs = theirArmyNames.find((name) => !committedTheirs.has(name));
  expect(refusedOurs).toBeDefined();
  expect(refusedTheirs).toBeDefined();
  await expect(page.getByText(`${refusedOurs} vs ${refusedTheirs}`)).toBeVisible();

  // Cleanup — leaves captain-a's team roster as this test found it.
  await clearTeamRoster(page);
});

test("match mode is blocked when the opponent roster has fewer than 5 armies", async ({ page, baseURL }) => {
  const url = baseURL ?? "";
  const stamp = Date.now();
  // Deliberately incomplete (3, not 5) — decoupled from the team roster's
  // own state, so this test needs no team-side setup or cleanup at all.
  const opponentId = await createOpponentWithArmies(page, url, `E2E Incomplete Opponent ${stamp}`, [
    `E2E-Their-${stamp}-1`,
    `E2E-Their-${stamp}-2`,
    `E2E-Their-${stamp}-3`,
  ]);

  await page.goto(`/dashboard/opponents/${opponentId}/match`);

  await expect(page.getByText("Both rosters need exactly 5 armies before match mode can start.")).toBeVisible();
  await expect(armyOptionButtons(page)).toHaveCount(0);
});
