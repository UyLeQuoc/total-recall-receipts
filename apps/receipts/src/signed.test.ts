/** Wallet-signed joins and picks (ADR-0064): message text, signature checks, the v2 leaf and verify. */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { canonicalPick, leafHash, type PickLeaf } from "./merkle.ts";
import { freshAt, joinMessage, parsePickMessage, pickMessage } from "./messages.ts";
import type { Receipt } from "./picks.ts";
import { signedBy, suiAddress } from "./signatures.ts";
import { SIGNATURE_CHECK, verifyReceipt } from "./verify.ts";

const kp = Ed25519Keypair.generate();
const address = kp.toSuiAddress();
const sign = async (text: string) =>
  (await kp.signPersonalMessage(new TextEncoder().encode(text))).signature;

const at = "2026-10-25T01:30:00.000Z";
const msg = {
  groupId: "g-1",
  eventId: "nba:401",
  eventTitle: "Heat at Hornets",
  side: "yes" as const,
  sideLabel: "Hornets win",
  confidencePct: 72,
  at,
};

describe("signed messages", () => {
  it("reads like a receipt in the wallet and parses back", () => {
    const text = pickMessage(msg);
    expect(text).toBe(
      [
        "Receipts pick",
        "group: g-1",
        "event: nba:401 (Heat at Hornets)",
        "side: yes (Hornets win)",
        "confidence: 72%",
        `at: ${at}`,
      ].join("\n"),
    );
    expect(parsePickMessage(text)).toEqual({
      groupId: "g-1",
      eventId: "nba:401",
      side: "yes",
      confidencePct: 72,
      at,
    });
  });

  it("keeps a title's newline from forging another field", () => {
    const text = pickMessage({ ...msg, eventTitle: "Heat\nconfidence: 99%" });
    expect(text.split("\n")).toHaveLength(6);
    expect(parsePickMessage(text)?.confidencePct).toBe(72);
  });

  it("names the group, the wallet and whether it's a test member when joining", () => {
    expect(
      joinMessage({
        groupId: "g-1",
        groupName: "Friday NBA",
        name: "Ava",
        address,
        test: true,
        at,
      }),
    ).toBe(
      `Receipts: join a group\ngroup: g-1 (Friday NBA)\nname: Ava\naddress: ${address}\ntest member: yes\nat: ${at}`,
    );
  });

  it("accepts a signed time within 5 minutes only", () => {
    const now = new Date(at);
    expect(freshAt("2026-10-25T01:34:59.000Z", now)).toBe(true);
    expect(freshAt("2026-10-25T01:35:01.000Z", now)).toBe(false);
    expect(freshAt("not a time", now)).toBe(false);
  });
});

describe("signatures", () => {
  it("checks the signer and the exact text", async () => {
    const text = pickMessage(msg);
    const sig = await sign(text);
    expect(await signedBy(text, sig, address)).toBe(true);
    expect(await signedBy(text.replace("72%", "73%"), sig, address)).toBe(false);
    expect(await signedBy(text, sig, Ed25519Keypair.generate().toSuiAddress())).toBe(false);
    expect(await signedBy(text, "not a signature", address)).toBe(false);
  });

  it("normalises addresses and rejects junk", () => {
    expect(suiAddress("0x2")).toBe(`0x${"0".repeat(63)}2`);
    expect(suiAddress("hello")).toBeNull();
  });
});

describe("the v2 leaf and verify", () => {
  const base: PickLeaf = {
    id: "p-1",
    groupId: "g-1",
    memberId: "m-1",
    eventId: "nba:401",
    side: "yes",
    confidence: 0.72,
    createdAt: "2026-10-25T01:30:02.000Z",
  };

  it("keeps unsigned leaves exactly as anchored before (v1)", () => {
    const v1 = JSON.stringify({
      v: 1,
      id: "p-1",
      groupId: "g-1",
      memberId: "m-1",
      eventId: "nba:401",
      side: "yes",
      confidence: "0.72",
      createdAt: "2026-10-25T01:30:02.000Z",
    });
    expect(canonicalPick(base)).toBe(v1);
    expect(leafHash(base)).toBe(
      bytesToHex(sha256(concatBytes(utf8ToBytes("receipts/v1"), utf8ToBytes(v1)))),
    );
  });

  async function signedReceipt(): Promise<Receipt> {
    const text = pickMessage(msg);
    const pick = { ...base, signer: address, signature: await sign(text) };
    expect(JSON.parse(canonicalPick(pick)).v).toBe(2);
    return {
      pick,
      leaf: leafHash(pick),
      proof: [],
      anchor: null,
      event: { id: "nba:401", title: "Heat at Hornets", locksAt: "2026-10-25T23:00:00.000Z" },
      signedMessage: text,
    };
  }

  it("passes the signature check for a real signed pick", async () => {
    const v = await verifyReceipt(null, await signedReceipt());
    expect(v.signed).toBe(true);
    expect(v.checks.find((c) => c.name === "pick matches its leaf")?.ok).toBe(true);
    expect(v.checks.find((c) => c.name === SIGNATURE_CHECK)?.ok).toBe(true);
    // Not anchored yet, so the receipt as a whole isn't verified.
    expect(v.ok).toBe(false);
  });

  it("fails a tampered signature, a tampered message and a swapped signer", async () => {
    const r = await signedReceipt();
    const other = await sign(pickMessage({ ...msg, confidencePct: 99 }));
    const forged = await verifyReceipt(null, { ...r, pick: { ...r.pick, signature: other } });
    expect(forged.checks.find((c) => c.name === SIGNATURE_CHECK)?.ok).toBe(false);
    expect(forged.checks.find((c) => c.name === "pick matches its leaf")?.ok).toBe(false);

    const edited = await verifyReceipt(null, {
      ...r,
      signedMessage: r.signedMessage?.replace("72%", "99%") as string,
    });
    expect(edited.checks.find((c) => c.name === SIGNATURE_CHECK)?.detail).toMatch(/99%/);

    const swapped = await verifyReceipt(null, {
      ...r,
      pick: { ...r.pick, signer: Ed25519Keypair.generate().toSuiAddress() },
    });
    expect(swapped.checks.find((c) => c.name === SIGNATURE_CHECK)?.ok).toBe(false);
  });

  it("verifies end to end once anchored", async () => {
    const r = await signedReceipt();
    const anchored = { ...r, anchor: { digest: "d1", root: r.leaf, network: "testnet" } };
    const v = await verifyReceipt(
      {
        read: async () => ({
          digest: "d1",
          success: true,
          root: r.leaf,
          count: 1,
          tsMs: Date.parse("2026-10-25T01:40:00Z"),
          sender: "0x1",
        }),
      },
      anchored,
    );
    expect(v.checks.map((c) => c.ok)).toEqual([true, true, true, true, true]);
    expect(v.ok).toBe(true);
  });
});
