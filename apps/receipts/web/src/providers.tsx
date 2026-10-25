// The wallet setup, copied from apps/web/src/app/providers.tsx (ADR-0064): dapp-kit on testnet over
// gRPC-web (ADR-0021). Receipts only asks wallets to sign personal messages, so it needs no gas.
import { createNetworkConfig, SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps, ReactNode } from "react";
import "@mysten/dapp-kit/dist/index.css";

const { networkConfig } = createNetworkConfig({
  testnet: { url: "https://fullnode.testnet.sui.io:443", network: "testnet" },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
});

type CreateClient = NonNullable<ComponentProps<typeof SuiClientProvider>["createClient"]>;

function createClient(_name: string, cfg: { url: string }): ReturnType<CreateClient> {
  const client = new SuiGrpcClient({ network: "testnet", baseUrl: cfg.url });
  // dapp-kit still types this callback as a JSON-RPC client. Public fullnodes retired that transport.
  return client as unknown as ReturnType<CreateClient>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider
        networks={networkConfig}
        defaultNetwork="testnet"
        createClient={createClient}
      >
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
