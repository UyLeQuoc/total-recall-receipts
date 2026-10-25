/**
 * Receipts' process (ADR-0061): the API and web always; the worker with `RECEIPTS_WORKER=on`; the
 * Telegram bot with `RECEIPTS_BOT=on` (one poller per token, ADR-0060).
 */
import { serve } from "@hono/node-server";
import { tatumUsage } from "@total-recall/chain";

import { createApp } from "./app.ts";
import { createBot } from "./bot.ts";
import { createAnchorer, testnetClient } from "./chain.ts";
import { createDb, groups } from "./db/index.ts";
import { DEPLOYMENTS } from "./deployments.ts";
import { readEnv } from "./env.ts";
import { ingestNow } from "./ingest.ts";
import { keypairFrom } from "./keys.ts";
import { learn } from "./learn.ts";
import { createReceiptsMemory } from "./memory.ts";
import { anchorPending } from "./picks.ts";

const env = readEnv();
const log = (msg: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...data }));
const db = createDb(env.DATABASE_URL);
const memory =
  env.MEMWAL_ACCOUNT_ID && env.MEMWAL_PRIVATE_KEY
    ? createReceiptsMemory(db, {
        key: env.MEMWAL_PRIVATE_KEY,
        accountId: env.MEMWAL_ACCOUNT_ID,
        serverUrl: env.MEMWAL_SERVER_URL,
      })
    : null;
const anchorer = env.SPONSOR_PRIVATE_KEY_TESTNET
  ? createAnchorer(
      testnetClient(env),
      keypairFrom(env.SPONSOR_PRIVATE_KEY_TESTNET, "SPONSOR_PRIVATE_KEY_TESTNET"),
      env.RECEIPTS_PACKAGE_ID ?? DEPLOYMENTS.testnet.packageId,
    )
  : null;

const app = createApp({ db, memory, anchorer, log });
const server = serve({ fetch: app.fetch, port: env.RECEIPTS_PORT });
log("receipts.listening", { port: env.RECEIPTS_PORT, memory: !!memory, anchorer: !!anchorer });

const timers: NodeJS.Timeout[] = [];
if (env.RECEIPTS_WORKER === "on") {
  let busy = false;
  const ingestPass = async () => {
    if (busy) return;
    busy = true;
    try {
      await ingestNow({ db, log });
      if (memory) {
        for (const g of await db.select({ id: groups.id }).from(groups)) {
          const r = await learn({ db, memory }, g.id).catch((err) => {
            log("learn.failed", { group: g.id, error: String(err) });
            return null;
          });
          if (r && (r.trust.length || r.insights.length)) log("learn.wrote", { group: g.id, ...r });
        }
      }
    } finally {
      busy = false;
    }
  };
  void ingestPass();
  timers.push(setInterval(ingestPass, env.RECEIPTS_INGEST_MINUTES * 60_000));
  timers.push(
    setInterval(() => {
      anchorPending({ db, anchorer, log }).catch((err) =>
        log("anchor.failed", { error: String(err) }),
      );
    }, env.RECEIPTS_ANCHOR_MINUTES * 60_000),
  );
  timers.push(setInterval(() => log("tatum.usage", tatumUsage()), 10 * 60_000));
  log("receipts.worker", {
    ingestMinutes: env.RECEIPTS_INGEST_MINUTES,
    anchorMinutes: env.RECEIPTS_ANCHOR_MINUTES,
  });
}

let bot: ReturnType<typeof createBot> | null = null;
if (env.RECEIPTS_BOT === "on" && env.TELEGRAM_BOT_TOKEN) {
  bot = createBot(env.TELEGRAM_BOT_TOKEN, {
    db,
    memory,
    anchorer,
    baseUrl: env.RECEIPTS_BASE_URL,
    log,
  });
  void bot.start({
    drop_pending_updates: true,
    onStart: (me) => log("receipts.bot", { username: me.username }),
  });
}

const stop = async () => {
  for (const t of timers) clearInterval(t);
  await bot?.stop();
  await memory?.flush();
  log("tatum.usage", tatumUsage());
  server.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
