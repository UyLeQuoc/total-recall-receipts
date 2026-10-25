/**
 * Pick receipts (ADR-0061). A leaf is `sha256("receipts/v1" ‖ canonical pick JSON)`, an inner node is
 * `sha256(left ‖ right)`, and an odd node is promoted unchanged. The root goes onchain with
 * `receipts::anchor`; the proof lets anyone recompute it from one pick.
 *
 * A pick signed by the member's wallet (ADR-0064) hashes as `receipts/v2`, with the signer and the
 * signature in the leaf, so the anchor proves the signature existed before lock. Unsigned picks keep
 * v1, and every leaf already anchored still verifies.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const DOMAIN_V1 = "receipts/v1";
const DOMAIN_V2 = "receipts/v2";

export interface PickLeaf {
  id: string;
  groupId: string;
  memberId: string;
  eventId: string;
  side: string;
  confidence: number;
  /** ISO 8601, UTC. */
  createdAt: string;
  /** The wallet that signed the pick (v2 only). */
  signer?: string;
  /** Its personal-message signature over the pick's message (v2 only). */
  signature?: string;
}

const signed = (p: PickLeaf) => !!(p.signer && p.signature);

/** Fixed key order and fixed precision, so the same pick always hashes the same. */
export function canonicalPick(p: PickLeaf): string {
  const base = {
    v: signed(p) ? 2 : 1,
    id: p.id,
    groupId: p.groupId,
    memberId: p.memberId,
    eventId: p.eventId,
    side: p.side,
    confidence: p.confidence.toFixed(2),
    createdAt: new Date(p.createdAt).toISOString(),
  };
  return JSON.stringify(signed(p) ? { ...base, signer: p.signer, signature: p.signature } : base);
}

export function leafHash(p: PickLeaf): string {
  const domain = signed(p) ? DOMAIN_V2 : DOMAIN_V1;
  return bytesToHex(sha256(concatBytes(utf8ToBytes(domain), utf8ToBytes(canonicalPick(p)))));
}

export interface ProofStep {
  sibling: string;
  /** The sibling sits on the left of the running hash. */
  left: boolean;
}

const node = (a: string, b: string) =>
  bytesToHex(sha256(concatBytes(hexToBytes(a), hexToBytes(b))));

export function buildTree(leaves: string[]): { root: string; proofs: ProofStep[][] } {
  if (!leaves.length) throw new Error("a batch needs at least one leaf");
  const proofs: ProofStep[][] = leaves.map(() => []);
  // positions[i] = where leaf i's running hash sits on the current level.
  let positions = leaves.map((_, i) => i);
  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] as string;
      const right = level[i + 1];
      next.push(right === undefined ? left : node(left, right));
    }
    positions = positions.map((pos, leaf) => {
      const sibling = pos % 2 === 0 ? pos + 1 : pos - 1;
      if (sibling < level.length) {
        proofs[leaf]?.push({ sibling: level[sibling] as string, left: sibling < pos });
      }
      return Math.floor(pos / 2);
    });
    level = next;
  }
  return { root: level[0] as string, proofs };
}

export function rootFromProof(leaf: string, proof: ProofStep[]): string {
  return proof.reduce((h, s) => (s.left ? node(s.sibling, h) : node(h, s.sibling)), leaf);
}
