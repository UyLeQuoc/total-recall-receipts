import { loadEnv, withoutBlanks } from "@total-recall/memory";
import { z } from "zod";

const flag = z.enum(["on", "off"]).default("off");

/**
 * Receipts reads the repo's `.env` as is (ADR-0060). Money and Move are on testnet; memory is the
 * operator's account on the mainnet relayer, under `receipts:*` namespaces.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().default("postgres://receipts:receipts@localhost:5435/receipts"),
  RECEIPTS_PORT: z.coerce.number().int().default(8811),
  RECEIPTS_BASE_URL: z.string().default("http://localhost:8811"),
  RECEIPTS_WORKER: flag,
  RECEIPTS_BOT: flag,
  /** Minutes between anchors (ADR-0061: 10). */
  RECEIPTS_ANCHOR_MINUTES: z.coerce.number().positive().default(10),
  /** Minutes between ingest passes. */
  RECEIPTS_INGEST_MINUTES: z.coerce.number().positive().default(10),
  TATUM_API_KEY_TESTNET: z.string().optional(),
  TATUM_SUI_GRPC_TESTNET: z.string().optional(),
  /** Pays gas and sends the anchors (testnet). */
  SPONSOR_PRIVATE_KEY_TESTNET: z.string().optional(),
  RECEIPTS_PACKAGE_ID: z.string().optional(),
  MEMWAL_ACCOUNT_ID: z.string().optional(),
  MEMWAL_PRIVATE_KEY: z.string().optional(),
  MEMWAL_SERVER_URL: z.string().default("https://relayer.memory.walrus.xyz"),
  OPENROUTER_API_KEY: z.string().optional(),
  LLM_SMALL_MODEL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
});
export type Env = z.infer<typeof envSchema>;

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  loadEnv();
  return envSchema.parse(withoutBlanks(source === process.env ? process.env : source));
}
