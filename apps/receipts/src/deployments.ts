/** Written by scripts/publish.ts (RC1, ADR-0061). Testnet only; mainnet is Uy's call (ADR-0024). */
export const DEPLOYMENTS = {
  testnet: {
    packageId: "0xc3b4eb9e83f72be63fff68e62245d3fe01289b5c430b706b722f091a1fb5e5a4",
    upgradeCapId: "0xe8cc4f65f8bdbe83993aa1d06492b2327ca4b901f106edee29804858978978f5",
    publishDigest: "5RKauRyJmPxHt4gnA5BeAhaxJRoDYi26GEKbNsWscuVV",
  },
} as const;
