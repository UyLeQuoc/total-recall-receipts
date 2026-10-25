/**
 * The network control from Remora's components/app/network-select.tsx (ADR-0066). Receipts anchors on
 * testnet only, so mainnet is listed but can't be chosen.
 */
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NetworkPill() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Network"
          className="text-muted-foreground"
        >
          <span aria-hidden className="size-2 rounded-full bg-warning" />
          <span className="hidden sm:inline">Testnet</span>
          <span className="sm:hidden">Test</span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Network</DropdownMenuLabel>
        <DropdownMenuRadioGroup value="testnet">
          <DropdownMenuRadioItem value="testnet">Testnet</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="mainnet" disabled>
            <span className="flex flex-col">
              <span>Mainnet</span>
              <span className="text-xs font-normal text-muted-foreground">
                Anchors run on testnet; memory is on mainnet
              </span>
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
