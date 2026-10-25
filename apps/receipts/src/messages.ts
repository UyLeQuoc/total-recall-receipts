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
}

export function pickMessage(m: PickMessage): string {
  return [
    PICK_HEADER,
    `group: ${oneLine(m.groupId)}`,
    `event: ${oneLine(m.eventId)} (${oneLine(m.eventTitle)})`,
    `side: ${m.side} (${oneLine(m.sideLabel)})`,
    `confidence: ${m.confidencePct}%`,
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
} | null {
  const f = fields(text, PICK_HEADER);
  if (!f) return null;
  const groupId = f.get("group");
  const eventId = f.get("event")?.split(" (")[0];
  const side = f.get("side")?.split(" (")[0];
  const confidence = /^(\d{1,2})%$/.exec(f.get("confidence") ?? "")?.[1];
  const at = f.get("at");
  if (!groupId || !eventId || (side !== "yes" && side !== "no") || !confidence || !at) return null;
  return { groupId, eventId, side, confidencePct: Number(confidence), at };
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

/** True when `at` is a real time within the allowed skew of `now`. */
export function freshAt(at: string, now: Date): boolean {
  const t = Date.parse(at);
  return Number.isFinite(t) && Math.abs(now.getTime() - t) <= SIGNED_AT_SKEW_MS;
}
