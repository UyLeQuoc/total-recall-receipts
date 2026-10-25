/**
 * Re-shoots the U12 exit's pages after a UI-only fix, from the exit's own record
 * (test-results/u12-exit.json), without signing or sending anything. Visitor view: no wallet.
 *   bunx playwright test -c e2e/playwright.config.ts agents-shots
 */
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const RESULT = new URL("../test-results/u12-exit.json", import.meta.url).pathname;
const SHOTS = new URL("../test-results/u12/", import.meta.url).pathname;

test("the U12 pages at 1280 and 375, light and dark", async ({ page }) => {
  test.skip(!existsSync(RESULT), "run agents.e2e.ts first");
  const run = JSON.parse(readFileSync(RESULT, "utf8")) as {
    group: { id: string };
    forecaster: { pick_id?: string }[];
  };
  const pick = run.forecaster.find((p) => p.pick_id)?.pick_id;
  for (const [name, path] of [
    ["receipt", `/p/${pick}`],
    ["agents-visitor", `/g/${run.group.id}/agents`],
    ["leaderboard", `/g/${run.group.id}/scores`],
  ] as const) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const [w, h] of [
        [1280, 900],
        [375, 812],
      ] as const) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(300);
        await page.screenshot({
          path: `${SHOTS}${name}-${w === 375 ? "375" : "desktop"}-${scheme}.png`,
        });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${name} at ${w}px`).toBeLessThanOrEqual(0);
      }
    }
  }
});
