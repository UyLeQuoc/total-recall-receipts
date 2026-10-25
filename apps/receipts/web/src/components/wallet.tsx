import { ConnectModal, useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";
import { short } from "../format.ts";
import { Button } from "./ui.tsx";

/** dapp-kit's wallet picker behind a compact button that fits a phone-width header. */
export function WalletButton({ className }: { className?: string }) {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  if (!account) {
    return (
      <ConnectModal
        trigger={
          <Button className={className} aria-haspopup="dialog">
            Connect wallet
          </Button>
        }
      />
    );
  }
  return (
    <div className="flex items-center gap-1">
      <span
        className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-line bg-card px-3 font-mono text-xs"
        title={account.address}
      >
        <span className="size-2 rounded-full bg-accent" aria-hidden />
        {short(account.address)}
      </span>
      <Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={() => disconnect()}>
        Disconnect
      </Button>
    </div>
  );
}
