/**
 * The U12 exit for Receipts (RC7, ADR-0066), on testnet:
 * 1. In a fresh "(test)" group, the owner (an injected test wallet with a generated key) joins and
 *    delegates the reference forecaster from the Agents page.
 * 2. The forecaster, a real model through Receipts' stdio MCP server, picks two real upcoming games.
 * 3. Both picks are anchored on Sui (this repo's sponsor), and each receipt verifies the agent's
 *    signature, the owner's delegation and the anchor.
 * 4. The owner revokes; the forecaster's next pick is refused, and so is a direct signed attempt.
 * Screenshots at 1280 and 375, light and dark, go to test-results/u12/. The run's record goes to
 * test-results/u12-exit.json. The agent's key stays in .env; only its address is used here.
 *   bunx playwright test -c e2e/playwright.config.ts agents
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { expect, type Page, test } from "@playwright/test";
import { keypairFrom } from "../src/keys.ts";
import { pickMessage } from "../src/messages.ts";
import { connect, installTestWallet } from "./test-wallet.ts";

const API = "http://localhost:8812";
const ROOT = new URL("..", import.meta.url).pathname;
const SHOTS = new URL("../test-results/u12/", import.meta.url).pathname;
const RESULT = new URL("../test-results/u12-exit.json", import.meta.url).pathname;

const envValue = (name: string) =>
  new RegExp(`^${name}=(.+)$`, "m").exec(readFileSync(`${ROOT}../../.env`, "utf8"))?.[1];

/** Runs the reference forecaster; one JSON line per pick or refusal. */
function forecaster(groupId: string, count: number) {
  const r = spawnSync(
    "bun",
    [
      "--env-file=../../.env",
      "agents/forecaster/run.ts",
      "--group",
      groupId,
      "--count",
      String(count),
      "--api",
      API,
    ],
    { cwd: ROOT, encoding: "utf8", timeout: 180_000 },
  );
  if (r.status !== 0) throw new Error(`forecaster failed: ${r.stderr.slice(-800)}`);
  return r.stdout
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l) as Record<string, string | number>);
}

async function shoot(page: Page, name: string) {
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
      expect(overflow, `${name}: no horizontal scroll at ${w}px`).toBeLessThanOrEqual(0);
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 900 });
}

test("an owner delegates an AI agent, it picks through MCP, and a revoke stops it", async ({
  page,
}) => {
  test.setTimeout(600_000);
  mkdirSync(SHOTS, { recursive: true });
  const t0 = Date.now();
  const out: Record<string, unknown> = { startedAt: new Date().toISOString() };
  const agentKp = keypairFrom(envValue("RECEIPTS_AGENT_KEY"), "RECEIPTS_AGENT_KEY");
  const agent = agentKp.toSuiAddress();
  out.agent = agent;

  // A fresh test group, and an owner wallet that holds nothing.
  const name = `Agents U12 ${new Date().toISOString().slice(5, 16).replace("T", " ")} (test)`;
  const { id: groupId } = (await (
    await page.request.post(`${API}/api/groups`, { data: { name } })
  ).json()) as {
    id: string;
  };
  out.group = { id: groupId, name };
  const ownerKp = Ed25519Keypair.generate();
  const owner = ownerKp.toSuiAddress();
  out.owner = owner;
  const wallet = await installTestWallet(page, ownerKp);
  await page.goto(`/g/${groupId}`);
  await connect(page);
  await page.getByPlaceholder("Your name in the group").fill("Owen");
  await page.getByLabel(/only testing/).check();
  await page.getByRole("button", { name: "Sign and join" }).click();
  await expect(page.getByText(/You're in as/)).toContainText("Owen (test)");

  // 1. Delegate the forecaster from the Agents page.
  await page.getByRole("link", { name: "Agents" }).first().click();
  await page.getByLabel("The agent's Sui address").fill(agent);
  await page.getByLabel("Its name").fill("Forecaster");
  await page.getByRole("button", { name: "7 days" }).click();
  await page.getByRole("button", { name: "Sign and delegate" }).click();
  const card = page.getByTestId("delegation").first();
  await expect(card).toHaveAttribute("data-status", "live");
  expect(wallet.signed.at(-1)).toContain("Receipts: let an agent pick for me");
  expect(wallet.signed.at(-1)).toContain(`agent: ${agent} (Forecaster)`);
  out.delegatedAt = new Date().toISOString();

  // 2. The forecaster picks two real upcoming games through MCP.
  const picks = forecaster(groupId, 2);
  out.forecaster = picks;
  const made = picks.filter((p) => p.pick_id);
  expect(made, JSON.stringify(picks)).toHaveLength(2);

  // 3. Anchored with this repo's sponsor; each receipt verifies.
  const anchor = (await (await page.request.post(`${API}/api/anchor?group=${groupId}`)).json()) as {
    digest?: string;
    count?: number;
  };
  out.anchor = anchor;
  const verified: unknown[] = [];
  for (const p of made) {
    const v = (await (await page.request.get(`${API}/api/picks/${p.pick_id}/verify`)).json()) as {
      ok: boolean;
      checks: { name: string; ok: boolean; detail: string }[];
    };
    verified.push({ pick: p.pick_id, ...v });
    expect(v.ok, JSON.stringify(v.checks)).toBe(true);
    for (const name of [
      "signed by the agent's key",
      "the owner delegated this agent",
      "anchor transaction on Sui",
      "proof reaches the onchain root",
      "anchored before lock",
    ]) {
      expect(v.checks.find((c) => c.name === name)?.ok, name).toBe(true);
    }
  }
  out.verified = verified;

  // The receipt page labels the agent, its owner and its reason.
  await page.goto(`/p/${made[0]?.pick_id}`);
  await expect(page.getByTestId("who")).toContainText("Forecaster, agent for Owen (test)");
  await expect(page.getByTestId("reason")).toBeVisible();
  await expect(page.getByText("Verified on Sui")).toBeVisible();
  await shoot(page, "receipt");
  await page.getByRole("button", { name: "Verify a tampered copy" }).click();
  await expect(
    page.getByTestId("tampered-checks").locator(`[data-check="signed by the agent's key"]`),
  ).toHaveAttribute("data-ok", "false");

  // The board shows the agent's pick among the group's voices.
  await page.goto(`/g/${groupId}`);
  const market = page.locator(`[data-testid="market"][data-event="${made[0]?.event_id}"]`);
  await expect(market.getByText("Forecaster, agent for Owen (test)")).toBeVisible();
  await market.scrollIntoViewIfNeeded();
  await shoot(page, "board");

  await page.getByRole("link", { name: "Agents" }).first().click();
  await expect(card).toContainText("Picks");
  await shoot(page, "agents");

  // 4. The owner revokes. The forecaster is refused, and so is a pick it signs directly.
  await card.getByRole("button", { name: "Revoke" }).click();
  await expect(card).toHaveAttribute("data-status", "revoked");
  expect(wallet.signed.at(-1)).toContain("Receipts: stop an agent");
  out.revokedAt = new Date().toISOString();
  const after = forecaster(groupId, 1);
  out.afterRevoke = after;
  expect(after[0]?.refused ?? after[0]?.skipped, JSON.stringify(after)).toBeTruthy();

  const board = (await (await page.request.get(`${API}/api/groups/${groupId}/board`)).json()) as {
    id: string;
    title: string;
    yesLabel: string;
    startsAt: string;
  }[];
  const target = board.find(
    (e) =>
      !made.some((p) => p.event_id === e.id) && Date.parse(e.startsAt) - Date.now() > 30 * 60_000,
  );
  expect(target).toBeTruthy();
  if (target) {
    const delegations = (await (
      await page.request.get(`${API}/api/groups/${groupId}/delegations`)
    ).json()) as {
      id: string;
    }[];
    const signedAt = new Date().toISOString();
    const text = pickMessage({
      groupId,
      eventId: target.id,
      eventTitle: target.title,
      side: "yes",
      sideLabel: target.yesLabel,
      confidencePct: 60,
      at: signedAt,
      agentFor: { owner, ownerName: "Owen", delegationId: delegations[0]?.id ?? "" },
    });
    const { signature } = await agentKp.signPersonalMessage(new TextEncoder().encode(text));
    const direct = await page.request.post(`${API}/api/agent-picks`, {
      data: {
        groupId,
        eventId: target.id,
        side: "yes",
        confidence: 0.6,
        agent,
        delegationId: delegations[0]?.id,
        signedAt,
        signature,
      },
    });
    out.directAfterRevoke = { status: direct.status(), body: await direct.json() };
    expect(direct.status()).toBe(403);
  }
  await page.reload();
  await shoot(page, "agents-revoked");

  await page.getByRole("link", { name: "Leaderboard" }).first().click();
  await page.getByRole("link", { name: "Learning" }).first().click();
  out.finishedAt = new Date().toISOString();
  out.seconds = Math.round((Date.now() - t0) / 1000);
  writeFileSync(RESULT, JSON.stringify(out, null, 2));
});
