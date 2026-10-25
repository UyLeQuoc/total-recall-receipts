/**
 * Anchors and reads them back (RC2, ADR-0061). Sui access is Tatum gRPC only (ADR-0021); the testnet
 * sponsor key sends anchors and pays their gas.
 */
import { bcs } from "@mysten/sui/bcs";
import type { Keypair } from "@mysten/sui/cryptography";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { hexToBytes } from "@noble/hashes/utils.js";
import { createTatumSuiClient, withRetry } from "@total-recall/chain";

export const AnchoredBcs = bcs.struct("Anchored", {
  root: bcs.vector(bcs.u8()),
  count: bcs.u64(),
  ts_ms: bcs.u64(),
  sender: bcs.Address,
  version: bcs.u64(),
});

export interface AnchorRead {
  digest: string;
  success: boolean;
  root: string;
  count: number;
  tsMs: number;
  sender: string;
}

export interface Anchorer {
  readonly network: "testnet";
  readonly packageId: string;
  anchor(rootHex: string, count: number): Promise<{ digest: string; tsMs: number }>;
  read(digest: string): Promise<AnchorRead | null>;
}

export function testnetClient(env: {
  TATUM_API_KEY_TESTNET?: string;
  TATUM_SUI_GRPC_TESTNET?: string;
}) {
  if (!env.TATUM_API_KEY_TESTNET) throw new Error("TATUM_API_KEY_TESTNET is not set");
  return createTatumSuiClient({
    network: "testnet",
    apiKey: env.TATUM_API_KEY_TESTNET,
    ...(env.TATUM_SUI_GRPC_TESTNET ? { url: env.TATUM_SUI_GRPC_TESTNET } : {}),
  });
}

const toHex = (b: Iterable<number>) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export function createAnchorer(
  client: SuiGrpcClient,
  signer: Keypair,
  packageId: string,
): Anchorer {
  const eventType = `${normalizeSuiAddress(packageId)}::anchor::Anchored`;
  const decode = (events: { eventType: string; bcs: Uint8Array }[] | null | undefined) =>
    (events ?? [])
      .filter(
        (e) =>
          normalizeSuiAddress(e.eventType.split("::")[0] ?? "") ===
            normalizeSuiAddress(packageId) && e.eventType.endsWith("::anchor::Anchored"),
      )
      .map((e) => AnchoredBcs.parse(e.bcs));

  return {
    network: "testnet",
    packageId,
    async anchor(rootHex, count) {
      const tx = new Transaction();
      tx.setSender(signer.toSuiAddress());
      tx.moveCall({
        target: `${packageId}::anchor::anchor`,
        arguments: [
          tx.pure.vector("u8", Array.from(hexToBytes(rootHex))),
          tx.pure.u64(count),
          tx.object.clock(),
        ],
      });
      const bytes = await tx.build({ client });
      const { signature } = await signer.signTransaction(bytes);
      // Not retried blindly: an UNAVAILABLE after submission can still land (packages/chain retry.ts).
      const res = await client.core.executeTransaction({
        transaction: bytes,
        signatures: [signature],
        include: { effects: true, events: true },
      });
      const done = res.Transaction ?? res.FailedTransaction;
      if (!done.effects?.status.success) {
        throw new Error(`anchor failed: ${JSON.stringify(done.effects?.status.error)}`);
      }
      const [ev] = decode(done.events);
      if (!ev) throw new Error(`no ${eventType} in ${done.digest}`);
      // A receipt is shown right after this; a fullnode that hasn't indexed the digest says "not found".
      await client.core.waitForTransaction({ digest: done.digest }).catch(() => {});
      return { digest: done.digest, tsMs: Number(ev.ts_ms) };
    },
    async read(digest) {
      const res = await withRetry(() =>
        client.core.getTransaction({
          digest,
          include: { effects: true, events: true, transaction: true },
        }),
      ).catch(() => null);
      if (!res) return null;
      const tx = res.Transaction ?? res.FailedTransaction;
      const [ev] = decode(tx.events);
      if (!ev) return null;
      return {
        digest,
        success: !!tx.effects?.status.success,
        root: toHex(ev.root),
        count: Number(ev.count),
        tsMs: Number(ev.ts_ms),
        sender: normalizeSuiAddress(ev.sender),
      };
    },
  };
}

export const explorerTx = (digest: string) => `https://suiscan.xyz/testnet/tx/${digest}`;
