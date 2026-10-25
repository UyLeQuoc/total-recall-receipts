/**
 * Personal-message signatures (ADR-0064). Ed25519, Secp256k1 and Secp256r1 wallets verify offline.
 * zkLogin would need a Sui client and an Enoki key, so it isn't accepted yet.
 */

import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";

export function suiAddress(raw: string): string | null {
  const a = normalizeSuiAddress(raw.trim());
  return isValidSuiAddress(a) ? a : null;
}

/** Whether `signature` is `address`'s signature over `message`. Never throws. */
export async function signedBy(
  message: string,
  signature: string,
  address: string,
): Promise<boolean> {
  try {
    await verifyPersonalMessageSignature(new TextEncoder().encode(message), signature, {
      address: normalizeSuiAddress(address),
    });
    return true;
  } catch {
    return false;
  }
}
