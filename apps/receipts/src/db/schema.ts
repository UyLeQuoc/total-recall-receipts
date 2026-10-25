/**
 * Receipts' own Postgres schema (ADR-0060). Numbers live here; memory holds the conclusions the
 * product acts on, and `memories` indexes every write so a 🧠 chip can link its blob.
 */
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const receipts = pgSchema("receipts");

export const groups = receipts.table("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  telegramChatId: text("telegram_chat_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const members = receipts.table(
  "members",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    name: text("name").notNull(),
    telegramUserId: text("telegram_user_id"),
    /** Test members are labelled everywhere they show (no invented picks shown as real). */
    test: boolean("test").notNull().default(false),
    /** The member's Sui wallet, when they joined from the web (ADR-0064). Their picks must be signed. */
    address: text("address"),
    /**
     * An agent (ADR-0066): the owner member it picks for. The agent's own key is `address`, and its
     * picks are signed by that key under the owner's delegation.
     */
    agentOf: text("agent_of"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("members_group_tg").on(t.groupId, t.telegramUserId),
    uniqueIndex("members_group_address").on(t.groupId, t.address),
  ],
);

/** A binary market: "Will <yes> happen?" Games ask whether the home side wins (ADR-0061). */
export const events = receipts.table(
  "events",
  {
    id: text("id").primaryKey(),
    league: text("league").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    yesLabel: text("yes_label").notNull(),
    noLabel: text("no_label").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    /** 1 = yes happened, 0 = no; null until resolved. */
    outcome: integer("outcome"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    refs: jsonb("refs").$type<Record<string, string>>().notNull().default({}),
    detail: text("detail"),
    backfill: boolean("backfill").notNull().default(false),
  },
  (t) => [index("events_league_start").on(t.league, t.startsAt)],
);

/** A source's probability of "yes" before lock: the books, Polymarket, Kalshi. */
export const quotes = receipts.table(
  "quotes",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    voice: text("voice").notNull(),
    prob: doublePrecision("prob").notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    backfill: boolean("backfill").notNull().default(false),
    raw: jsonb("raw"),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.voice] })],
);

export const anchors = receipts.table("anchors", {
  id: text("id").primaryKey(),
  root: text("root").notNull(),
  count: integer("count").notNull(),
  digest: text("digest"),
  tsMs: text("ts_ms"),
  network: text("network").notNull().default("testnet"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const picks = receipts.table(
  "picks",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    /** "yes" or "no". */
    side: text("side").notNull(),
    /** 0.5–0.99: how sure the member is of their side. */
    confidence: doublePrecision("confidence").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    leaf: text("leaf").notNull(),
    /** A wallet-signed pick (ADR-0064): the signer, its signature and the exact message signed. */
    signer: text("signer"),
    signature: text("signature"),
    signedMessage: text("signed_message"),
    /** An agent's pick (ADR-0066): the owner's delegation it was made under. */
    delegationId: text("delegation_id"),
    anchorId: text("anchor_id").references(() => anchors.id),
    leafIndex: integer("leaf_index"),
  },
  (t) => [
    uniqueIndex("picks_one_per_member").on(t.memberId, t.eventId),
    index("picks_unanchored").on(t.anchorId),
  ],
);

/**
 * An owner's signed permission for an agent to pick for them in one group (ADR-0066). Revoking is a
 * second signed message; both stay, so a receipt can show what was allowed when the agent picked.
 */
export const delegations = receipts.table(
  "delegations",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    ownerMemberId: text("owner_member_id")
      .notNull()
      .references(() => members.id),
    agentMemberId: text("agent_member_id")
      .notNull()
      .references(() => members.id),
    owner: text("owner").notNull(),
    agent: text("agent").notNull(),
    agentName: text("agent_name").notNull(),
    until: timestamp("until", { withTimezone: true }).notNull(),
    message: text("message").notNull(),
    signature: text("signature").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeMessage: text("revoke_message"),
    revokeSignature: text("revoke_signature"),
  },
  (t) => [index("delegations_agent").on(t.groupId, t.agent)],
);

/**
 * Bearer tokens for the remote, read-only MCP server (ADR-0066). Only the SHA-256 of a token is kept;
 * the token itself is shown once.
 */
export const mcpTokens = receipts.table(
  "mcp_tokens",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    ownerMemberId: text("owner_member_id")
      .notNull()
      .references(() => members.id),
    name: text("name").notNull(),
    sha256: text("sha256").notNull(),
    message: text("message").notNull(),
    signature: text("signature").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    calls: integer("calls").notNull().default(0),
  },
  (t) => [uniqueIndex("mcp_tokens_sha").on(t.sha256)],
);

/** Every memory Receipts writes, so a 🧠 chip can link its blob and a test can count them. */
export const memories = receipts.table(
  "memories",
  {
    id: text("id").primaryKey(),
    namespace: text("namespace").notNull(),
    kind: text("kind").notNull(),
    text: text("text").notNull(),
    sha256: text("sha256").notNull(),
    jobId: text("job_id"),
    blobId: text("blob_id"),
    status: text("status").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("memories_ns").on(t.namespace, t.createdAt)],
);
