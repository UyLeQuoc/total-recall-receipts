/**
 * What a wallet signs (ADR-0064). Joining a group and each pick are personal messages the member's
 * wallet signs. The server rebuilds the same text from its own records before it checks the signature,
 * so a receipt proves who picked (the signature) and when (the anchor).
 *
 * The web imports this file too, so the text it asks the wallet to sign can't drift from the text the
 * server checks. No Node or browser APIs here.
 */

export const PICK_HEADER = "Receipts pick";
export const JOIN_HEADER = "Receipts: join a group";
export const DELEGATE_HEADER = "Receipts: let an agent pick for me";
export const UNDELEGATE_HEADER = "Receipts: stop an agent";
export const TOKEN_HEADER = "Receipts: create a read-only MCP token";
export const UNTOKEN_HEADER = "Receipts: revoke an MCP token";
/** How far a signed message's `at` may be from the server's clock. */
export const SIGNED_AT_SKEW_MS = 5 * 60_000;

/** One line per field, so a stray newline in a title can't forge another field. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

export interface PickMessage {
  groupId: string;
  eventId: string;
  eventTitle: string;
  side: "yes" | "no";
  sideLabel: string;
  /** Whole percent, 50–99. */
  confidencePct: number;
  /** ISO 8601, from the signer's clock. */
  at: string;
  /**
   * An agent's pick (ADR-0066): whom it picks for and under which delegation. The agent's own key
   * signs, so the delegation id ties the signature to the owner's signed permission.
   */
  agentFor?: { owner: string; ownerName: string; delegationId: string };
}

export function pickMessage(m: PickMessage): string {
  return [
    PICK_HEADER,
    `group: ${oneLine(m.groupId)}`,
    `event: ${oneLine(m.eventId)} (${oneLine(m.eventTitle)})`,
    `side: ${m.side} (${oneLine(m.sideLabel)})`,
    `confidence: ${m.confidencePct}%`,
    ...(m.agentFor
      ? [
          `agent for: ${oneLine(m.agentFor.owner)} (${oneLine(m.agentFor.ownerName)})`,
          `delegation: ${oneLine(m.agentFor.delegationId)}`,
        ]
      : []),
    `at: ${oneLine(m.at)}`,
  ].join("\n");
}

function fields(text: string, header: string): Map<string, string> | null {
  const lines = text.split("\n");
  if (lines[0] !== header) return null;
  const out = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const i = line.indexOf(": ");
    if (i < 1) return null;
    out.set(line.slice(0, i), line.slice(i + 2));
  }
  return out;
}

/** The fields a verifier compares with the pick. Labels in parentheses are for the signer's eyes. */
export function parsePickMessage(text: string): {
  groupId: string;
  eventId: string;
  side: "yes" | "no";
  confidencePct: number;
  at: string;
  /** Present on an agent's pick. */
  agentFor?: { owner: string; delegationId: string };
} | null {
  const f = fields(text, PICK_HEADER);
  if (!f) return null;
  const groupId = f.get("group");
  const eventId = f.get("event")?.split(" (")[0];
  const side = f.get("side")?.split(" (")[0];
  const confidence = /^(\d{1,2})%$/.exec(f.get("confidence") ?? "")?.[1];
  const at = f.get("at");
  if (!groupId || !eventId || (side !== "yes" && side !== "no") || !confidence || !at) return null;
  const owner = f.get("agent for")?.split(" (")[0];
  const delegationId = f.get("delegation");
  if (!!owner !== !!delegationId) return null;
  return {
    groupId,
    eventId,
    side,
    confidencePct: Number(confidence),
    at,
    ...(owner && delegationId ? { agentFor: { owner, delegationId } } : {}),
  };
}

export interface JoinMessage {
  groupId: string;
  groupName: string;
  name: string;
  address: string;
  test: boolean;
  at: string;
}

export function joinMessage(m: JoinMessage): string {
  return [
    JOIN_HEADER,
    `group: ${oneLine(m.groupId)} (${oneLine(m.groupName)})`,
    `name: ${oneLine(m.name)}`,
    `address: ${oneLine(m.address)}`,
    `test member: ${m.test ? "yes" : "no"}`,
    `at: ${oneLine(m.at)}`,
  ].join("\n");
}

// ---------- agents (ADR-0066) ----------

export interface DelegateMessage {
  groupId: string;
  groupName: string;
  /** The owner's wallet: the member the agent picks for. */
  owner: string;
  agent: string;
  agentName: string;
  /** ISO 8601: the delegation ends here. */
  until: string;
  at: string;
}

/** The owner's permission: this agent may pick for me in this group until this date. */
export function delegateMessage(m: DelegateMessage): string {
  return [
    DELEGATE_HEADER,
    `group: ${oneLine(m.groupId)} (${oneLine(m.groupName)})`,
    `owner: ${oneLine(m.owner)}`,
    `agent: ${oneLine(m.agent)} (${oneLine(m.agentName)})`,
    `until: ${oneLine(m.until)}`,
    `at: ${oneLine(m.at)}`,
  ].join("\n");
}

export function parseDelegateMessage(
  text: string,
): { groupId: string; owner: string; agent: string; until: string; at: string } | null {
  const f = fields(text, DELEGATE_HEADER);
  if (!f) return null;
  const groupId = f.get("group")?.split(" (")[0];
  const owner = f.get("owner");
  const agent = f.get("agent")?.split(" (")[0];
  const until = f.get("until");
  const at = f.get("at");
  if (!groupId || !owner || !agent || !until || !at) return null;
  return { groupId, owner, agent, until, at };
}

/** The owner takes the permission back. */
export function undelegateMessage(m: Omit<DelegateMessage, "until">): string {
  return [
    UNDELEGATE_HEADER,
    `group: ${oneLine(m.groupId)} (${oneLine(m.groupName)})`,
    `owner: ${oneLine(m.owner)}`,
    `agent: ${oneLine(m.agent)} (${oneLine(m.agentName)})`,
    `at: ${oneLine(m.at)}`,
  ].join("\n");
}

export interface TokenMessage {
  groupId: string;
  groupName: string;
  owner: string;
  name: string;
  at: string;
}

/** A read-only bearer token for the remote MCP server, scoped to one group. */
export function tokenMessage(m: TokenMessage): string {
  return [
    TOKEN_HEADER,
    `group: ${oneLine(m.groupId)} (${oneLine(m.groupName)})`,
    `owner: ${oneLine(m.owner)}`,
    `name: ${oneLine(m.name)}`,
    `at: ${oneLine(m.at)}`,
  ].join("\n");
}

export function untokenMessage(m: Omit<TokenMessage, "name"> & { tokenId: string }): string {
  return [
    UNTOKEN_HEADER,
    `group: ${oneLine(m.groupId)} (${oneLine(m.groupName)})`,
    `owner: ${oneLine(m.owner)}`,
    `token: ${oneLine(m.tokenId)}`,
    `at: ${oneLine(m.at)}`,
  ].join("\n");
}

/** True when `at` is a real time within the allowed skew of `now`. */
export function freshAt(at: string, now: Date): boolean {
  const t = Date.parse(at);
  return Number.isFinite(t) && Math.abs(now.getTime() - t) <= SIGNED_AT_SKEW_MS;
}
