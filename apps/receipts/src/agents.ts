/**
 * Agents as forecasters (RC7, ADR-0066 and this repo's ADR-0067).
 *
 * - An owner's wallet signs a delegation: "this agent may pick for me in this group until this date".
 *   The agent becomes a member of its own (`agentOf` = the owner), so it's scored as its own voice.
 * - The agent signs each pick with its own key, naming the delegation. The server checks the signature,
 *   that the delegation is live, and the lock, exactly like a person's signed pick.
 * - Revoking is another message the owner signs. Picks made before it stay valid.
 * - Read-only bearer tokens for the remote MCP server are created the same way. Only their SHA-256 is
 *   kept, and the token is shown once.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { type Db, delegations, groups, mcpTokens, members } from "./db/index.ts";
import {
  delegateMessage,
  freshAt,
  tokenMessage,
  undelegateMessage,
  untokenMessage,
} from "./messages.ts";
import { signedBy, suiAddress } from "./signatures.ts";

export class AgentError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "bad_request"
      | "bad_signature"
      | "not_owner"
      | "taken"
      | "revoked"
      | "expired",
    message: string,
  ) {
    super(message);
  }
}

/** The longest a delegation or a token may last. */
export const MAX_DELEGATION_DAYS = 90;
export const TOKEN_DAYS = 30;

type Delegation = typeof delegations.$inferSelect;
type Member = typeof members.$inferSelect;

async function groupAndOwner(db: Db, groupId: string, ownerAddress: string) {
  const [g] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!g) throw new AgentError("not_found", "No such group.");
  const owner = suiAddress(ownerAddress);
  if (!owner) throw new AgentError("bad_request", "The owner isn't a Sui address.");
  const [m] = await db
    .select()
    .from(members)
    .where(and(eq(members.groupId, g.id), eq(members.address, owner), isNull(members.agentOf)));
  if (!m) {
    throw new AgentError("not_owner", "Join the group with this wallet before naming an agent.");
  }
  return { group: g, owner, ownerMember: m };
}

function checkFresh(at: string, now: Date) {
  if (!freshAt(at, now)) {
    throw new AgentError(
      "bad_signature",
      "The signed time is more than 5 minutes off. Sign again.",
    );
  }
}

export interface DelegateInput {
  groupId: string;
  owner: string;
  agent: string;
  agentName: string;
  until: string;
  at: string;
  signature: string;
}

/** The owner's signed permission. The agent's member row is created once and reused. */
export async function delegate(db: Db, input: DelegateInput, now = new Date()) {
  const { group, owner, ownerMember } = await groupAndOwner(db, input.groupId, input.owner);
  const agent = suiAddress(input.agent);
  if (!agent) throw new AgentError("bad_request", "The agent isn't a Sui address.");
  if (agent === owner) throw new AgentError("bad_request", "An agent needs its own key.");
  const name = input.agentName.trim().slice(0, 40);
  if (!name) throw new AgentError("bad_request", "Name the agent.");
  const until = new Date(input.until);
  if (!Number.isFinite(until.getTime()) || until <= now) {
    throw new AgentError("bad_request", "The delegation must end in the future.");
  }
  if (until.getTime() - now.getTime() > MAX_DELEGATION_DAYS * 86_400_000) {
    throw new AgentError("bad_request", `A delegation lasts at most ${MAX_DELEGATION_DAYS} days.`);
  }
  checkFresh(input.at, now);
  const message = delegateMessage({
    groupId: group.id,
    groupName: group.name,
    owner: input.owner,
    agent: input.agent,
    agentName: name,
    until: input.until,
    at: input.at,
  });
  if (!(await signedBy(message, input.signature, owner))) {
    throw new AgentError(
      "bad_signature",
      "The signature doesn't match this delegation and wallet.",
    );
  }

  const [existing] = await db
    .select()
    .from(members)
    .where(and(eq(members.groupId, group.id), eq(members.address, agent)));
  if (existing && existing.agentOf !== ownerMember.id) {
    throw new AgentError("taken", "That address is already in this group as someone else.");
  }
  const agentMember =
    existing ??
    ((
      await db
        .insert(members)
        .values({
          id: randomUUID(),
          groupId: group.id,
          name,
          test: ownerMember.test,
          address: agent,
          agentOf: ownerMember.id,
        })
        .returning()
    )[0] as Member);
  if (existing && existing.name !== name) {
    await db.update(members).set({ name }).where(eq(members.id, existing.id));
  }
  // One live delegation per agent and group: a new one replaces the old.
  await db
    .update(delegations)
    .set({ revokedAt: now })
    .where(
      and(
        eq(delegations.groupId, group.id),
        eq(delegations.agent, agent),
        isNull(delegations.revokedAt),
      ),
    );
  const [d] = await db
    .insert(delegations)
    .values({
      id: randomUUID(),
      groupId: group.id,
      ownerMemberId: ownerMember.id,
      agentMemberId: agentMember.id,
      owner,
      agent,
      agentName: name,
      until,
      message,
      signature: input.signature,
    })
    .returning();
  return { delegation: d as Delegation, agentMember: { ...agentMember, name } };
}

export interface UndelegateInput {
  groupId: string;
  delegationId: string;
  at: string;
  signature: string;
}

export async function undelegate(db: Db, input: UndelegateInput, now = new Date()) {
  const [d] = await db
    .select()
    .from(delegations)
    .where(and(eq(delegations.id, input.delegationId), eq(delegations.groupId, input.groupId)));
  if (!d) throw new AgentError("not_found", "No such delegation.");
  if (d.revokedAt) throw new AgentError("revoked", "This delegation is already revoked.");
  const [g] = await db.select().from(groups).where(eq(groups.id, d.groupId));
  checkFresh(input.at, now);
  const message = undelegateMessage({
    groupId: d.groupId,
    groupName: g?.name ?? "",
    owner: d.owner,
    agent: d.agent,
    agentName: d.agentName,
    at: input.at,
  });
  if (!(await signedBy(message, input.signature, d.owner))) {
    throw new AgentError("bad_signature", "Only the owner's wallet can revoke this delegation.");
  }
  const [out] = await db
    .update(delegations)
    .set({ revokedAt: now, revokeMessage: message, revokeSignature: input.signature })
    .where(eq(delegations.id, d.id))
    .returning();
  return out as Delegation;
}

/** Why a delegation can't be used at `at`, or null when it can. */
export function delegationProblem(d: Delegation, at: Date): string | null {
  if (d.revokedAt && d.revokedAt <= at) return "The owner revoked this agent's delegation.";
  if (d.until <= at) return "This agent's delegation has ended.";
  return null;
}

/** The agent's newest delegation in a group, live or not, with its owner. */
export async function latestDelegation(db: Db, groupId: string, agentAddress: string) {
  const agent = suiAddress(agentAddress);
  if (!agent) return null;
  const [d] = await db
    .select()
    .from(delegations)
    .where(and(eq(delegations.groupId, groupId), eq(delegations.agent, agent)))
    .orderBy(desc(delegations.createdAt))
    .limit(1);
  if (!d) return null;
  const [owner] = await db.select().from(members).where(eq(members.id, d.ownerMemberId));
  return { delegation: d, owner: owner as Member };
}

// ---------- read-only MCP tokens ----------

export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export interface TokenInput {
  groupId: string;
  owner: string;
  name: string;
  at: string;
  signature: string;
}

/** Creates a token and returns it once; only its hash is stored. */
export async function createToken(db: Db, input: TokenInput, now = new Date()) {
  const { group, owner, ownerMember } = await groupAndOwner(db, input.groupId, input.owner);
  const name = input.name.trim().slice(0, 40);
  if (!name) throw new AgentError("bad_request", "Name the token.");
  checkFresh(input.at, now);
  const message = tokenMessage({
    groupId: group.id,
    groupName: group.name,
    owner: input.owner,
    name,
    at: input.at,
  });
  if (!(await signedBy(message, input.signature, owner))) {
    throw new AgentError("bad_signature", "The signature doesn't match this wallet.");
  }
  const token = `rcpt_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(mcpTokens)
    .values({
      id: randomUUID(),
      groupId: group.id,
      ownerMemberId: ownerMember.id,
      name,
      sha256: tokenHash(token),
      message,
      signature: input.signature,
      expiresAt: new Date(now.getTime() + TOKEN_DAYS * 86_400_000),
    })
    .returning();
  return { token, row: row as typeof mcpTokens.$inferSelect };
}

export async function revokeToken(
  db: Db,
  input: { groupId: string; tokenId: string; at: string; signature: string },
  now = new Date(),
) {
  const [t] = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.id, input.tokenId), eq(mcpTokens.groupId, input.groupId)));
  if (!t) throw new AgentError("not_found", "No such token.");
  if (t.revokedAt) throw new AgentError("revoked", "This token is already revoked.");
  const [g] = await db.select().from(groups).where(eq(groups.id, t.groupId));
  const [owner] = await db.select().from(members).where(eq(members.id, t.ownerMemberId));
  checkFresh(input.at, now);
  const message = untokenMessage({
    groupId: t.groupId,
    groupName: g?.name ?? "",
    owner: owner?.address ?? "",
    tokenId: t.id,
    at: input.at,
  });
  if (!owner?.address || !(await signedBy(message, input.signature, owner.address))) {
    throw new AgentError("bad_signature", "Only the owner's wallet can revoke this token.");
  }
  await db.update(mcpTokens).set({ revokedAt: now }).where(eq(mcpTokens.id, t.id));
}

/** The token's group, or why it's refused. Counts the call. */
export async function checkToken(
  db: Db,
  token: string,
  now = new Date(),
): Promise<{ groupId: string; tokenId: string } | { error: string }> {
  const [t] = await db
    .select()
    .from(mcpTokens)
    .where(eq(mcpTokens.sha256, tokenHash(token)));
  if (!t) return { error: "Unknown token." };
  if (t.revokedAt) return { error: "This token was revoked." };
  if (t.expiresAt <= now) return { error: "This token has expired." };
  await db
    .update(mcpTokens)
    .set({ lastUsedAt: now, calls: t.calls + 1 })
    .where(eq(mcpTokens.id, t.id));
  return { groupId: t.groupId, tokenId: t.id };
}

/** A fixed window per token: `limit` calls per minute. */
export function createRateLimiter(limit = 60, windowMs = 60_000) {
  const hits = new Map<string, { start: number; n: number }>();
  return (key: string, now = Date.now()) => {
    const h = hits.get(key);
    if (!h || now - h.start >= windowMs) {
      hits.set(key, { start: now, n: 1 });
      return true;
    }
    h.n++;
    return h.n <= limit;
  };
}
