/**
 * Receipts' web with a wallet (ADR-0064): a wallet joins the e2e group, signs a pick on an upcoming
 * real game, the receipt shows a valid signature, and a tampered copy fails verify.
 *
 * One group, "Web e2e (test)", is reused across runs: each new group makes the worker write trust
 * snapshots for it, and a fresh wallet per run is enough for a fresh member.
 */
import { mkdirSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { expect, type Page, test } from "@playwright/test";
import { connect, installTestWallet } from "./test-wallet.ts";

const GROUP = "Web e2e (test)";
const SHOTS = new URL("../test-results/", import.meta.url).pathname;
/** Picks on a game this close to lock are anchored at once; the e2e stays clear of that. */
const CLEAR_OF_LOCK_MS = 30 * 60_000;

async function e2eGroup(page: Page): Promise<string> {
  const groups = (await (await page.request.get("/api/groups")).json()) as {
    id: string;
    name: string;
  }[];
  const found = groups.find((g) => g.name === GROUP);
  if (found) return found.id;
  const res = await page.request.post("/api/groups", { data: { name: GROUP } });
  return ((await res.json()) as { id: string }).id;
}

test("a wallet joins, signs a pick, and the receipt proves it", async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const kp = Ed25519Keypair.generate();
  const address = kp.toSuiAddress();
  const wallet = await installTestWallet(page, kp);
  const groupId = await e2eGroup(page);

  await page.goto(`/g/${groupId}`);
  await expect(page.getByRole("heading", { name: GROUP })).toBeVisible();
  await connect(page);

  // Join: one signed message, no transaction.
  await page.getByPlaceholder("Your name in the group").fill(`Wallet ${address.slice(2, 6)}`);
  await page.getByLabel(/only testing/).check();
  await page.getByRole("button", { name: "Sign and join" }).click();
  await expect(page.getByText(/You're in as/)).toContainText("(test)");
  expect(wallet.signed[0]).toContain("Receipts: join a group");
  expect(wallet.signed[0]).toContain(`address: ${address}`);

  // An upcoming real game, well before its lock.
  const markets = page.getByTestId("market");
  await expect(markets.first()).toBeVisible();
  const count = await markets.count();
  let card = null;
  for (let i = 0; i < count; i++) {
    const m = markets.nth(i);
    const league = await m.getAttribute("data-league");
    const starts = Date.parse((await m.getAttribute("data-starts")) ?? "");
    if ((league === "NBA" || league === "EPL") && starts - Date.now() > CLEAR_OF_LOCK_MS) {
      card = m;
      break;
    }
  }
  expect(card, "an NBA or EPL game more than 30 minutes from lock").not.toBeNull();
  if (!card) return;
  const title = (await card.locator("p").first().textContent()) ?? "";

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: `${SHOTS}board-desktop.png`, fullPage: false });
  await page.setViewportSize({ width: 375, height: 812 });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}board-375.png`, fullPage: false });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "no horizontal scroll at 375px").toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 900 });

  await card.getByLabel("Confidence").fill("72");
  await card.getByRole("button", { name: /Sign and lock in/ }).click();
  await page.waitForURL(/\/p\//);
  const receipt = page.url();
  const pickMessage = wallet.signed.at(-1) ?? "";
  expect(pickMessage).toContain("Receipts pick");
  expect(pickMessage).toContain("confidence: 72%");
  expect(pickMessage).toContain(title.trim());

  // The receipt: the signer, and the signature check passes.
  await expect(page.getByTestId("signer")).toHaveText(address);
  const checks = page.getByTestId("checks");
  await expect(checks.locator('[data-check="pick matches its leaf"]')).toHaveAttribute(
    "data-ok",
    "true",
  );
  await expect(checks.locator(`[data-check="signed by the member's wallet"]`)).toHaveAttribute(
    "data-ok",
    "true",
  );
  await page.screenshot({ path: `${SHOTS}receipt-desktop.png`, fullPage: true });

  // A tampered signature fails the same checks.
  await page.getByRole("button", { name: "Verify a tampered copy" }).click();
  const tampered = page.getByTestId("tampered-checks");
  await expect(tampered.locator(`[data-check="signed by the member's wallet"]`)).toHaveAttribute(
    "data-ok",
    "false",
  );
  await expect(tampered.locator('[data-check="pick matches its leaf"]')).toHaveAttribute(
    "data-ok",
    "false",
  );
  await expect(page.getByText("Not verified")).toBeVisible();

  // The board shows the pick as the member's own, signed.
  await page.goto(`/g/${groupId}`);
  await expect(page.getByText(/Your pick:/).first()).toBeVisible();

  // Learning: the walk-forward curve over the backfilled games.
  await page.getByRole("link", { name: "Learning" }).click();
  await expect(page.getByTestId("learning").locator("svg").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}learning-desktop.png`, fullPage: false });
  await page.getByRole("link", { name: "Leaderboard" }).click();
  await expect(page.getByRole("table").first()).toBeVisible();
  console.log(
    JSON.stringify({
      groupId,
      address,
      receipt,
      event: title.trim(),
      signed: wallet.signed.length,
    }),
  );
});
