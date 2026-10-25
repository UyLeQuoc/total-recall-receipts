/**
 * `/verify` (RC2, ADR-0061): checks a receipt against the chain, not against our database. A stranger
 * can run the same checks with the receipt JSON and any Sui node.
 *
 * A wallet-signed pick (ADR-0064) also checks the signature: the signed message must describe this
 * pick, and the signer's key must have signed it. The signature is inside the leaf, so the anchor
 * shows it existed before lock.
 */
import type { Anchorer } from "./chain.ts";
import { leafHash, rootFromProof } from "./merkle.ts";
import { parsePickMessage, SIGNED_AT_SKEW_MS } from "./messages.ts";
import type { Receipt } from "./picks.ts";
import { signedBy } from "./signatures.ts";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export const SIGNATURE_CHECK = "signed by the member's wallet";

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
  return null;
}

async function signatureCheck(r: Receipt): Promise<Check> {
  const { signer, signature } = r.pick;
  if (!signer || !signature) {
    return { name: SIGNATURE_CHECK, ok: false, detail: "the receipt has no signature" };
  }
  const mismatch = messageMismatch(r);
  if (mismatch) return { name: SIGNATURE_CHECK, ok: false, detail: mismatch };
  const ok = await signedBy(r.signedMessage as string, signature, signer);
  return {
    name: SIGNATURE_CHECK,
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
