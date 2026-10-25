/**
 * `/verify` (RC2, ADR-0061): checks a receipt against the chain, not against our database. A stranger
 * can run the same checks with the receipt JSON and any Sui node.
 *
 * A wallet-signed pick (ADR-0064) also checks the signature: the signed message must describe this
 * pick, and the signer's key must have signed it. The signature is inside the leaf, so the anchor
 * shows it existed before lock.
 *
 * An agent's pick (ADR-0066) checks the agent's signature the same way, plus the owner's delegation:
 * the owner's wallet signed it, it names this group and this agent, and it was live when the agent
 * picked. A revocation the server knows of travels in the receipt; one it hides can't be checked.
 */
import type { Anchorer } from "./chain.ts";
import { leafHash, leafVersion, rootFromProof } from "./merkle.ts";
import { parseDelegateMessage, parsePickMessage, SIGNED_AT_SKEW_MS } from "./messages.ts";
import type { Receipt } from "./picks.ts";
import { signedBy, suiAddress } from "./signatures.ts";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export const SIGNATURE_CHECK = "signed by the member's wallet";
export const AGENT_SIGNATURE_CHECK = "signed by the agent's key";
export const DELEGATION_CHECK = "the owner delegated this agent";

const same = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && suiAddress(a) === suiAddress(b);

/** Why a signed message doesn't describe this pick, or null when it does. */
function messageMismatch(r: Receipt): string | null {
  const m = r.signedMessage ? parsePickMessage(r.signedMessage) : null;
  if (!m) return "the receipt has no readable signed message";
  const p = r.pick;
  if (m.groupId !== p.groupId) return "the message names another group";
  if (m.eventId !== p.eventId) return "the message names another event";
  if (m.side !== p.side) return `the message says ${m.side}, the pick says ${p.side}`;
  if (m.confidencePct !== Math.round(p.confidence * 100)) {
    return `the message says ${m.confidencePct}%, the pick says ${Math.round(p.confidence * 100)}%`;
  }
  if (Math.abs(Date.parse(m.at) - Date.parse(p.createdAt)) > SIGNED_AT_SKEW_MS) {
    return "the message was signed more than 5 minutes from the pick's time";
  }
  if (p.delegationId) {
    if (!m.agentFor) return "the message doesn't say whom the agent picks for";
    if (m.agentFor.delegationId !== p.delegationId) return "the message names another delegation";
    if (r.delegation && !same(m.agentFor.owner, r.delegation.owner)) {
      return "the message names another owner";
    }
  } else if (m.agentFor) {
    return "the message is an agent's, but the pick has no delegation";
  }
  return null;
}

/** The owner's delegation was signed by the owner, names this agent, and was live at the pick. */
async function delegationCheck(r: Receipt): Promise<Check> {
  const fail = (detail: string) => ({ name: DELEGATION_CHECK, ok: false, detail });
  const d = r.delegation;
  if (!d) return fail("the receipt has no delegation");
  if (d.id !== r.pick.delegationId) return fail("the receipt's delegation isn't the pick's");
  const m = parseDelegateMessage(d.message);
  if (!m) return fail("the delegation message is unreadable");
  if (m.groupId !== r.pick.groupId) return fail("the delegation is for another group");
  if (!same(m.owner, d.owner)) return fail("the delegation names another owner");
  if (!same(m.agent, r.pick.signer)) return fail("the delegation is for another agent");
  if (Date.parse(m.until) !== Date.parse(d.until))
    return fail("the delegation's end doesn't match");
  if (!(await signedBy(d.message, d.signature, d.owner))) {
    return fail(`the delegation isn't signed by the owner ${d.owner}`);
  }
  const at = Date.parse(r.pick.createdAt);
  if (Date.parse(d.until) <= at) return fail(`the delegation ended ${d.until}, before the pick`);
  if (d.revokedAt && Date.parse(d.revokedAt) <= at) {
    return fail(`the owner revoked the delegation ${d.revokedAt}, before the pick`);
  }
  return {
    name: DELEGATION_CHECK,
    ok: true,
    detail: `${d.owner} let ${r.pick.signer} pick until ${d.until}${d.revokedAt ? `; revoked later, ${d.revokedAt}` : ""}`,
  };
}

async function signatureCheck(r: Receipt): Promise<Check> {
  const { signer, signature } = r.pick;
  const name = r.pick.delegationId ? AGENT_SIGNATURE_CHECK : SIGNATURE_CHECK;
  if (!signer || !signature) {
    return { name, ok: false, detail: "the receipt has no signature" };
  }
  const mismatch = messageMismatch(r);
  if (mismatch) return { name, ok: false, detail: mismatch };
  const ok = await signedBy(r.signedMessage as string, signature, signer);
  return {
    name,
    ok,
    detail: ok ? `${signer} signed this pick` : `the signature isn't ${signer}'s over this message`,
  };
}

export async function verifyReceipt(anchorer: Pick<Anchorer, "read"> | null, r: Receipt) {
  const checks: Check[] = [];
  const signed = !!(r.pick.signer || r.pick.signature);
  const leaf = leafHash(r.pick);
  checks.push({
    name: "pick matches its leaf",
    ok: leaf === r.leaf,
    detail: leaf === r.leaf ? leaf : `recomputed ${leaf}, receipt says ${r.leaf}`,
  });
  if (signed) checks.push(await signatureCheck(r));
  if (leafVersion(r.pick) === 3) checks.push(await delegationCheck(r));
  if (!r.anchor) {
    checks.push({
      name: "anchored on Sui",
      ok: false,
      detail: "not anchored yet; the next batch is within 10 minutes",
    });
    return { ok: false, signed, checks };
  }
  if (!anchorer) {
    checks.push({
      name: "anchor transaction on Sui",
      ok: false,
      detail: "this server has no Sui client configured",
    });
    return { ok: false, signed, checks };
  }
  const onchain = await anchorer.read(r.anchor.digest);
  checks.push({
    name: "anchor transaction on Sui",
    ok: !!onchain?.success,
    detail: onchain
      ? `${r.anchor.digest} (${onchain.count} picks)`
      : `${r.anchor.digest} not found`,
  });
  const root = rootFromProof(leaf, r.proof);
  checks.push({
    name: "proof reaches the onchain root",
    ok: !!onchain && root === onchain.root,
    detail: onchain
      ? `computed ${root.slice(0, 16)}…, onchain ${onchain.root.slice(0, 16)}…`
      : "no onchain root",
  });
  const locksAt = Date.parse(r.event.locksAt);
  checks.push({
    name: "anchored before lock",
    ok: !!onchain && onchain.tsMs <= locksAt,
    detail: onchain
      ? `anchored ${new Date(onchain.tsMs).toISOString()}, locked ${r.event.locksAt}`
      : "no onchain time",
  });
  return { ok: checks.every((c) => c.ok), signed, checks };
}
