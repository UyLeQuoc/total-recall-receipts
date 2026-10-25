/**
 * An injected wallet-standard test wallet, copied from e2e/support/test-wallet.ts (Remora) and cut down
 * to what Receipts uses: connect and `sui:signPersonalMessage`. Signing calls go back to Node through
 * `page.exposeFunction`, so the key never enters the browser. The key is generated per run and holds
 * nothing (ADR-0064): never a real owner's wallet.
 *
 * dapp-kit only lists wallets that can sign transactions, so `sui:signTransaction` is declared, and it
 * refuses: Receipts never asks for one.
 */
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64 } from "@mysten/sui/utils";
import type { Page } from "@playwright/test";

export const WALLET_NAME = "Receipts E2E Wallet";

export async function installTestWallet(
  page: Page,
  kp: Ed25519Keypair,
): Promise<{ signed: string[] }> {
  const signed: string[] = [];
  await page.exposeFunction("__receiptsE2eSignMessage", async (b64: string) => {
    const message = fromBase64(b64);
    signed.push(new TextDecoder().decode(message));
    const { bytes, signature } = await kp.signPersonalMessage(message);
    return { bytes, signature };
  });
  await page.addInitScript(
    ({ name, address, publicKey }) => {
      const account = {
        address,
        publicKey: new Uint8Array(publicKey),
        chains: ["sui:testnet"],
        features: ["sui:signPersonalMessage"],
        label: name,
      };
      const icon =
        "data:image/svg+xml;base64," +
        btoa(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#059669"/></svg>',
        );
      const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
      const w = window as unknown as Record<
        string,
        (...a: unknown[]) => Promise<{ bytes: string; signature: string }>
      >;
      const wallet = {
        version: "1.0.0",
        name,
        icon,
        chains: ["sui:testnet"],
        get accounts() {
          return [account];
        },
        features: {
          "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
          "standard:disconnect": { version: "1.0.0", disconnect: async () => {} },
          "standard:events": { version: "1.0.0", on: () => () => {} },
          "sui:signPersonalMessage": {
            version: "1.1.0",
            signPersonalMessage: async ({ message }: { message: Uint8Array }) =>
              w.__receiptsE2eSignMessage?.(b64(message)),
          },
          "sui:signTransaction": {
            version: "2.0.0",
            signTransaction: async () => {
              throw new Error("The Receipts test wallet only signs messages.");
            },
          },
        },
      };
      const register = ({ register }: { register: (w: unknown) => void }) => register(wallet);
      window.addEventListener("wallet-standard:app-ready", (e) =>
        register((e as CustomEvent).detail),
      );
      window.dispatchEvent(
        new CustomEvent("wallet-standard:register-wallet", { detail: register }),
      );
    },
    {
      name: WALLET_NAME,
      address: kp.toSuiAddress(),
      publicKey: Array.from(kp.getPublicKey().toRawBytes()),
    },
  );
  return { signed };
}

/** Connects through dapp-kit's own modal. */
export async function connect(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  await page.getByRole("button", { name: WALLET_NAME }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 30_000 });
}
