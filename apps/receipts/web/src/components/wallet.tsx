/**
 * The wallet controls (ADR-0064), in Remora's account-menu shape (ADR-0066): signed out, a "Connect
 * wallet" button opening dapp-kit's picker plus a small menu; connected, the address with a menu for
 * the theme and disconnecting. Receipts only asks wallets to sign messages, so there's no balance.
 */
import { ConnectModal, useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";
import { cn } from "cn";
import { ChevronsUpDown, Info, LogOut, MoreHorizontal, Wallet } from "lucide-react";
import { Link } from "react-router";
import { ThemeChoice } from "@/components/app/theme-choice";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { short } from "../format.ts";

/** dapp-kit's wallet picker behind Remora's primary button. */
export function WalletButton({
  className,
  label = "Connect wallet",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <ConnectModal
      trigger={
        <Button className={className} aria-haspopup="dialog">
          <Wallet />
          {label}
        </Button>
      }
    />
  );
}

/** A stable two-letter mark for an address, on the indigo tint. */
function AddressMark({ address }: { address: string }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 font-mono text-xs font-semibold text-primary uppercase"
    >
      {address.slice(2, 4)}
    </span>
  );
}

export function AccountMenu() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;

  if (!account) {
    if (collapsed) {
      return (
        <ConnectModal
          trigger={
            <Button size="icon-sm" aria-label="Connect wallet" aria-haspopup="dialog">
              <Wallet />
            </Button>
          }
        />
      );
    }
    return (
      <div className="flex w-full items-center gap-1">
        <WalletButton className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="More"
              className="text-muted-foreground"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <ThemeChoice />
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/#how">
                <Info /> How Receipts works
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Wallet menu"
          title={account.address}
          className={cn(
            "flex w-full min-w-0 items-center gap-2 rounded-md p-1 text-left text-sm outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
            collapsed && "justify-center",
          )}
        >
          <AddressMark address={account.address} />
          {collapsed ? null : (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-mono text-xs font-medium">
                  {short(account.address)}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {account.label ?? "Wallet"} · signs picks
                </span>
              </span>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="text-xs font-normal text-muted-foreground">Signing with</span>
          <span className="font-mono text-xs break-all">{account.address}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ThemeChoice />
        <DropdownMenuItem asChild>
          <Link to="/#how">
            <Info /> How Receipts works
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => disconnect()}>
          <LogOut /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
