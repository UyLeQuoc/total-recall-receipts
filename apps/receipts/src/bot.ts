/**
 * The Telegram bot (RC4, ADR-0061). In a group chat, the chat is a Receipts group and each sender is
 * a member. `/pick Celtics 70` finds the next open game for that team. Runs only with
 * `RECEIPTS_BOT=on`, and never alongside another poller on the same token (ADR-0060).
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Bot, type Context } from "grammy";
import type { Anchorer } from "./chain.ts";
import { type Db, groups, members } from "./db/index.ts";
import { openEvents } from "./ingest.ts";
import { forecastsOf, marketProbs, memberVoice, receiptsCall } from "./learn.ts";
import { parseConfidence, pct } from "./markets.ts";
import type { ReceiptsMemory } from "./memory.ts";
import { logPick, PickError, receiptFor } from "./picks.ts";
import { statsByVoice } from "./scoring.ts";
import { verifyReceipt } from "./verify.ts";

export interface BotDeps {
  db: Db;
  memory: ReceiptsMemory | null;
  anchorer: Anchorer | null;
  baseUrl: string;
  now?: () => Date;
  log?: (msg: string, data?: Record<string, unknown>) => void;
}

export const HELP = [
  "🧾 Receipts keeps the group's receipts.",
  "/board: open markets and Receipts' call",
  "/pick <team or #> <confidence>: e.g. /pick Celtics 70",
  "/call <team or #>: why Receipts leans the way it does",
  "/me: your record",
  "/verify <receipt id>: check a pick against Sui",
].join("\n");

async function ensureMember(db: Db, ctx: Context) {
  const chat = ctx.chat;
  const from = ctx.from;
  if (!chat || !from) return null;
  const chatId = String(chat.id);
  let [group] = await db.select().from(groups).where(eq(groups.telegramChatId, chatId));
  if (!group) {
    const title = "title" in chat && chat.title ? chat.title : `${from.first_name}'s picks`;
    [group] = await db
      .insert(groups)
      .values({ id: randomUUID(), name: title, telegramChatId: chatId })
      .returning();
  }
  if (!group) return null;
  const userId = String(from.id);
  let [member] = await db
    .select()
    .from(members)
    .where(and(eq(members.groupId, group.id), eq(members.telegramUserId, userId)));
  if (!member) {
    [member] = await db
      .insert(members)
      .values({
        id: randomUUID(),
        groupId: group.id,
        name: from.first_name.slice(0, 60),
        telegramUserId: userId,
      })
      .returning();
  }
  return member ? { group, member } : null;
}

/** "Celtics", "BOS" or a board number → the next open market and which side that team is. */
export async function findMarket(db: Db, query: string, now: Date) {
  const open = await openEvents(db, now);
  const n = Number(query.replace("#", ""));
  if (Number.isInteger(n) && n >= 1 && n <= open.length) return { event: open[n - 1], side: null };
  const q = query.toLowerCase();
  for (const e of open) {
    const refs = e.refs as Record<string, string>;
    if (
      [refs.home, refs.homeShort].some((x) => x?.toLowerCase() === q) ||
      e.yesLabel.toLowerCase().startsWith(q)
    ) {
      return { event: e, side: "yes" as const };
    }
    if (refs.away?.toLowerCase() === q || e.noLabel.toLowerCase().startsWith(q))
      return { event: e, side: "no" as const };
  }
  return null;
}

export function createBot(
  token: string,
  deps: BotDeps,
  botInfo?: ConstructorParameters<typeof Bot>[1] extends infer O
    ? O extends { botInfo?: infer B }
      ? B
      : never
    : never,
) {
  const bot = new Bot(token, botInfo ? { botInfo } : {});
  const now = () => deps.now?.() ?? new Date();

  bot.command(["start", "help"], async (ctx) => {
    await ensureMember(deps.db, ctx);
    await ctx.reply(HELP);
  });

  bot.command("board", async (ctx) => {
    const who = await ensureMember(deps.db, ctx);
    if (!who) return;
    const open = (await openEvents(deps.db, now())).slice(0, 8);
    if (!open.length) return void (await ctx.reply("Nothing open right now."));
    const lines: string[] = [];
    for (const [i, e] of open.entries()) {
      const k = deps.memory
        ? await receiptsCall(
            { db: deps.db, memory: deps.memory, labels: (v) => v },
            who.group.id,
            e.id,
          ).catch(() => null)
        : null;
      lines.push(
        `#${i + 1} ${e.title} (${e.league}, locks ${e.startsAt.toISOString().slice(11, 16)} UTC)${k?.prob != null ? `: Receipts ${pct(k.prob)} ${e.yesLabel}` : ""}`,
      );
    }
    await ctx.reply(`${lines.join("\n")}\n\n${deps.baseUrl}/g/${who.group.id}`);
  });

  bot.command("pick", async (ctx) => {
    const who = await ensureMember(deps.db, ctx);
    if (!who) return;
    const [target, confRaw, sideRaw] = ctx.match.trim().split(/\s+/);
    if (!target || !confRaw) return void (await ctx.reply("Usage: /pick Celtics 70"));
    const found = await findMarket(deps.db, target, now());
    if (!found?.event) return void (await ctx.reply(`No open market for "${target}".`));
    const side = found.side ?? (sideRaw === "no" ? "no" : "yes");
    if (parseConfidence(confRaw) === null) return void (await ctx.reply("Confidence is 50–99."));
    try {
      const r = await logPick(
        {
          db: deps.db,
          memory: deps.memory,
          anchorer: deps.anchorer,
          ...(deps.log ? { log: deps.log } : {}),
        },
        {
          groupId: who.group.id,
          memberId: who.member.id,
          eventId: found.event.id,
          side,
          confidence: confRaw,
          now: now(),
        },
      );
      const lockIn = Math.round((found.event.startsAt.getTime() - now().getTime()) / 60_000);
      await ctx.reply(
        [
          `🧾 Locked in: ${r.pick.sideLabel} at ${r.pick.confidenceLabel}, ${lockIn} min before lock.`,
          r.nudge ? `🧠 ${r.nudge.text}` : null,
          `Receipt: ${deps.baseUrl}/p/${r.pick.id}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (err) {
      await ctx.reply(
        err instanceof PickError ? err.message : "Couldn't log that pick. Try again.",
      );
    }
  });

  bot.command("call", async (ctx) => {
    const who = await ensureMember(deps.db, ctx);
    if (!who || !deps.memory) return;
    const found = await findMarket(deps.db, ctx.match.trim() || "1", now());
    if (!found?.event) return void (await ctx.reply("No such open market."));
    const k = await receiptsCall(
      { db: deps.db, memory: deps.memory, labels: (v) => v },
      who.group.id,
      found.event.id,
    ).catch(() => null);
    if (!k || k.prob === null) return void (await ctx.reply("No numbers for that market yet."));
    await ctx.reply(
      [
        `Receipts: ${pct(k.prob)} ${found.event.yesLabel}`,
        ...k.chips.map((c) => `🧠 ${c.text}`),
      ].join("\n"),
    );
  });

  bot.command("me", async (ctx) => {
    const who = await ensureMember(deps.db, ctx);
    if (!who) return;
    const stats = statsByVoice(forecastsOf(await marketProbs(deps.db, who.group.id))).filter(
      (s) => s.voice === memberVoice(who.member.id),
    );
    if (!stats.length) return void (await ctx.reply("No resolved picks yet."));
    await ctx.reply(
      stats
        .map((s) => `${s.league}: ${s.hits}/${s.n} right, Brier ${s.brier.toFixed(3)}`)
        .join("\n"),
    );
  });

  bot.command("verify", async (ctx) => {
    const id = ctx.match.trim();
    const r = id ? await receiptFor(deps.db, id) : null;
    if (!r || !deps.anchorer) return void (await ctx.reply("No such receipt."));
    const v = await verifyReceipt(deps.anchorer, r);
    await ctx.reply(
      [
        v.ok ? "✅ Verified on Sui" : "❌ Not verified",
        ...v.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name}`),
      ].join("\n"),
    );
  });

  bot.catch((err) => deps.log?.("bot.error", { error: String(err.error) }));
  return bot;
}
